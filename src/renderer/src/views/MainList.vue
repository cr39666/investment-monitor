<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import DragHandle from '../components/DragHandle.vue'
import Modal from '../components/Modal.vue'
import Confirm from '../components/Confirm.vue'
import Toast from '../components/Toast.vue'

const router = useRouter()

// 股票数据模型
interface StockItem {
  code: string // 比如 sh600519
  cost: number // 成本价
  amount: number // 持仓手数 (1手=100股)
  isNew?: boolean // 是否为新添加（用于初始化默认成本）
}

// 腾讯行情接口返回的字段对应
interface StockQuote {
  name: string // 股票名称
  currentPrice: number // 最新价
  yesterdayClose: number // 昨收价
  changeAmount: number // 涨跌额
  changePercent: number // 涨跌幅
}

const inputCode = ref('')
const stocks = ref<StockItem[]>([])
// 以 code 为 key 保存行情数据
const quotes = ref<Record<string, StockQuote>>({})
let timer: ReturnType<typeof setInterval> | null = null

const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// Name 列的展示模式：0=仅名称, 1=仅代码
const nameDisplayMode = ref(0)
const toggleNameDisplayMode = () => {
  nameDisplayMode.value = (nameDisplayMode.value + 1) % 2
}

// 排序状态
const sortColumn = ref<string | null>(null)
const sortOrder = ref<'asc' | 'desc' | 'none'>('none')

const toggleSort = (column: string) => {
  if (sortColumn.value === column) {
    if (sortOrder.value === 'asc') sortOrder.value = 'desc'
    else if (sortOrder.value === 'desc') sortOrder.value = 'none'
    else sortOrder.value = 'asc'

    if (sortOrder.value === 'none') sortColumn.value = null
  } else {
    sortColumn.value = column
    sortOrder.value = 'asc'
  }
}

// 实际显示的经过排序的股票列表
const displayStocks = computed(() => {
  const list = [...stocks.value]

  // 第一优先级：手动选择的列排序
  if (sortColumn.value && sortOrder.value !== 'none') {
    return list.sort((a, b) => {
      let valA: number = 0
      let valB: number = 0
      const qA = quotes.value[a.code]
      const qB = quotes.value[b.code]

      switch (sortColumn.value) {
        case 'curPrice':
          valA = qA?.currentPrice || 0
          valB = qB?.currentPrice || 0
          break
        case 'dpnl':
          valA = calculateDailyPnl(a)
          valB = calculateDailyPnl(b)
          break
        case 'tpnl':
          valA = calculateTotalPnl(a) ?? -999999999
          valB = calculateTotalPnl(b) ?? -999999999
          break
        case 'change':
          valA = qA?.changePercent || 0
          valB = qB?.changePercent || 0
          break
      }
      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    })
  }

  // 默认排序：按名称拼音首字母正序
  return list.sort((a, b) => {
    const nameA = quotes.value[a.code]?.name || a.code
    const nameB = quotes.value[b.code]?.name || b.code
    return nameA.localeCompare(nameB, 'zh-CN')
  })
})

// 隐私模式
const isCensored = ref(false)
const toggleCensor = () => {
  isCensored.value = !isCensored.value
}

// Avg 列展示模式：0=均摊成本, 1=持仓市值
const avgDisplayMode = ref(0)
const toggleAvgDisplayMode = () => {
  avgDisplayMode.value = (avgDisplayMode.value + 1) % 2
}

// 选中的行代码（多选）
const selectedCodes = ref<string[]>([])
const toggleRowSelection = (code: string) => {
  const index = selectedCodes.value.indexOf(code)
  if (index > -1) {
    selectedCodes.value.splice(index, 1)
  } else {
    selectedCodes.value.push(code)
  }
}

// --- 组件引用 ---
const modalRef = ref<InstanceType<typeof Modal> | null>(null)
const confirmRef = ref<InstanceType<typeof Confirm> | null>(null)
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
// --------------------------

// 格式化股票名称：超过4个字则截取前3个加...
const formatName = (name: string | undefined): string => {
  if (!name) return '--'
  if (name.length > 4) {
    return name.slice(0, 3) + '...'
  }
  return name
}

// 复制价格到剪贴板
const copyPrice = (price: number | undefined) => {
  if (!price) return
  navigator.clipboard.writeText(price.toString()).then(() => {
    toastRef.value?.show('Price Copied!', 'success')
  })
}

// 加载本地存储
const loadStocks = () => {
  const saved = localStorage.getItem('my_stocks')
  if (saved) {
    try {
      stocks.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse saved stocks', e)
    }
  }
}

// 保存到本地存储
const saveStocks = () => {
  localStorage.setItem('my_stocks', JSON.stringify(stocks.value))
}

// 添加股票
const addStock = async () => {
  let code = inputCode.value.trim().toLowerCase()
  if (!code) return

  // 自动根据6位纯数字代码补齐市场前缀
  if (/^\d{6}$/.test(code)) {
    if (
      code.startsWith('6') ||
      code.startsWith('5') ||
      code.startsWith('7') ||
      code.startsWith('9')
    ) {
      code = 'sh' + code
    } else if (code.startsWith('0') || code.startsWith('1') || code.startsWith('3')) {
      code = 'sz' + code
    } else if (code.startsWith('4') || code.startsWith('8')) {
      code = 'bj' + code
    } else {
      code = 'sz' + code
    }
  }

  if (stocks.value.some((s) => s.code === code)) {
    alert('该股票已存在')
    return
  }

  // 先获取行情以提供默认价格
  await fetchQuotesByCode(code)
  const quote = quotes.value[code]
  const defaultPrice = quote?.currentPrice || 0

  const res = await modalRef.value?.open('add', '添加持仓', `请输入股票 ${code} 的初始仓位`, {
    price: defaultPrice,
    amount: 1
  })

  if (res?.confirmed) {
    stocks.value.push({
      code,
      cost: res.price,
      amount: res.amount,
      isNew: false
    })
    saveStocks()
    inputCode.value = ''
    fetchQuotes(true)
    toastRef.value?.show('Stock Added!', 'success')
  }
}

// 单独获取行情（辅助addStock）
const fetchQuotesByCode = (code: string) => {
  return new Promise<void>((resolve) => {
    const scriptId = 'temp-jsonp-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement
    if (script) document.body.removeChild(script)
    script = document.createElement('script')
    script.id = scriptId
    script.charset = 'gbk'
    script.src = `http://qt.gtimg.cn/q=${code}&t=${Date.now()}`
    script.onload = () => {
      const varName = `v_${code}`
      const dataStr = (window as any)[varName]
      if (dataStr) {
        const parts = dataStr.split('~')
        if (parts.length > 5) {
          quotes.value[code] = {
            name: parts[1],
            currentPrice: parseFloat(parts[3]),
            yesterdayClose: parseFloat(parts[4]),
            changeAmount: parseFloat(parts[31]),
            changePercent: parseFloat(parts[32])
          }
        }
      }
      document.body.removeChild(script!)
      resolve()
    }
    document.body.appendChild(script)
  })
}

// 移除/清空股票逻辑
const handleDeleteAction = async () => {
  if (selectedCodes.value.length > 0) {
    // 批量删除已选项
    const confirmed = await confirmRef.value?.open(
      '删除股票',
      `确定要删除选中的 ${selectedCodes.value.length} 只股票吗？`
    )
    if (confirmed) {
      stocks.value = stocks.value.filter((s) => !selectedCodes.value.includes(s.code))
      selectedCodes.value = []
      saveStocks()
      toastRef.value?.show('Selected Stocks Removed', 'info')
    }
  } else {
    // 清空所有股票（原逻辑）
    if (stocks.value.length === 0) return
    const confirmed = await confirmRef.value?.open('清空列表', '确定要清空列表中的所有股票吗？')
    if (confirmed) {
      stocks.value = []
      saveStocks()
      toastRef.value?.show('All Stocks Cleared', 'warn')
    }
  }
}

// 调仓逻辑
const adjustStockFlow = async (stock: StockItem) => {
  const quote = quotes.value[stock.code]
  const currentPrice = quote?.currentPrice || stock.cost || 0

  const res = await modalRef.value?.open(
    'transaction',
    '调仓确认',
    `加/减仓: 正数为买入，负数为卖出`,
    { price: currentPrice, amount: 0 }
  )

  if (res?.confirmed) {
    const delta = res.amount
    const tradePrice = res.price
    if (delta === 0) return

    const newAmount = stock.amount + delta
    if (newAmount < 0) {
      toastRef.value?.show('持仓手数不能小于0', 'fail')
      return
    }

    if (delta > 0) {
      // 加仓：计算加权平均成本
      const oldTotalVal = stock.amount * stock.cost
      const addTotalVal = delta * tradePrice
      stock.cost = Number(((oldTotalVal + addTotalVal) / newAmount).toFixed(3))
    }
    // 减仓：仅减少数量，不改变单价成本

    stock.amount = newAmount
    saveStocks()
    toastRef.value?.show('Position Updated', 'success')
  }
}

// 检查是否为 A 股交易时间
const isTradingTime = () => {
  const now = new Date()
  const day = now.getDay()
  const hours = now.getHours()
  const minutes = now.getMinutes()

  // 周六周日不交易
  if (day === 0 || day === 6) return false

  const timeNum = hours * 100 + minutes

  // A 股交易时间：09:15 - 11:30, 13:00 - 15:00
  const isMorning = timeNum >= 915 && timeNum <= 1130
  const isAfternoon = timeNum >= 1300 && timeNum <= 1500

  return isMorning || isAfternoon
}

// 获取行情数据 (使用 JSONP 注入 script 标签，解决 GBK 编码跨域)
const fetchQuotes = (force = false) => {
  if (stocks.value.length === 0) return

  // 非交易时间且非强制刷新(初始化)时，跳过请求
  if (!force && !isTradingTime()) {
    return
  }

  const codes = stocks.value.map((s) => s.code).join(',')
  const scriptId = 'jsonp-stock-script'
  let script = document.getElementById(scriptId) as HTMLScriptElement

  if (script) {
    document.body.removeChild(script)
  }

  script = document.createElement('script')
  script.id = scriptId
  script.charset = 'gbk'
  script.src = `http://qt.gtimg.cn/q=${codes}&t=${Date.now()}`

  // 监听脚本加载完成
  script.onload = () => {
    stocks.value.forEach((stock) => {
      // 腾讯接口会在全局注入形如 v_sh600519 的变量
      const varName = `v_${stock.code}`
      const dataStr = (window as any)[varName]
      if (dataStr) {
        const parts = dataStr.split('~')
        if (parts.length > 5) {
          const currentPrice = parseFloat(parts[3])
          quotes.value[stock.code] = {
            name: parts[1],
            currentPrice,
            yesterdayClose: parseFloat(parts[4]),
            changeAmount: parseFloat(parts[31]),
            changePercent: parseFloat(parts[32])
          }

          // 如果是新添加的股票，且成功获取到价格，则将成本价初始化为当前价
          if (stock.isNew && currentPrice > 0) {
            stock.cost = currentPrice
            stock.isNew = false
            saveStocks()
          }
        }
      }
    })
  }

  document.body.appendChild(script)
}

// 通用窗口尺寸同步：测量容器实际尺寸并通知主进程
const syncWindowSize = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  // 加上外边距的补偿 (20px * 2)
  const width = Math.ceil(rect.width) + 40
  const height = Math.ceil(rect.height) + 40
  window.electron.ipcRenderer.send('resize-window', width, height)
}

// 计算某只股票的当日盈亏 = (现价 - 昨收) * 股数
const calculateDailyPnl = (stock: StockItem): number => {
  const quote = quotes.value[stock.code]
  if (!quote) return 0
  return (quote.currentPrice - quote.yesterdayClose) * stock.amount * 100
}

// 计算某只股票的持仓总盈亏 = (现价 - 均摊成本) * 股数
// 只有在填写了成本价时才有效
const calculateTotalPnl = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote || stock.cost <= 0) return null
  return (quote.currentPrice - stock.cost) * stock.amount * 100
}

// 计算某只股票的持仓市值 = 现价 * 股数 * 100
const calculateMarketValue = (stock: StockItem): number => {
  const quote = quotes.value[stock.code]
  if (!quote) return 0
  return quote.currentPrice * stock.amount * 100
}

// 总当日盈亏额
const totalDailyPnl = computed(() => {
  return stocks.value.reduce((total, stock) => total + calculateDailyPnl(stock), 0)
})

// 总持仓盈亏额
const totalHoldingPnl = computed(() => {
  return stocks.value.reduce((total, stock) => {
    const pnl = calculateTotalPnl(stock)
    return total + (pnl || 0)
  }, 0)
})

onMounted(async () => {
  loadStocks()
  fetchQuotes(true) // 初始强制获取一次，不论是否在交易时间
  timer = setInterval(() => fetchQuotes(false), 1000)

  // 等待 Vue DOM 更新完毕后再测量，避免拿到未渲染完成的尺寸
  await nextTick()

  if (containerRef.value) {
    // 初始同步一次窗口尺寸
    syncWindowSize()

    // 延迟再同步一次作为安全网（JSONP 数据加载后表格高度可能变化）
    setTimeout(syncWindowSize, 300)

    resizeObserver = new ResizeObserver(() => {
      // rAF 确保在浏览器完成布局/绘制后再读取尺寸
      requestAnimationFrame(syncWindowSize)
    })
    resizeObserver.observe(containerRef.value)
  }
})

const goBack = () => {
  // 返回时缩小到球大小
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/')
}

const goToSetting = () => {
  router.push('/setting')
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="main-list-container">
    <DragHandle />
    <div class="table-container">
      <table class="stock-table">
        <thead>
          <tr>
            <th
              :title="nameDisplayMode === 0 ? '名称 (Name)' : '代码 (Code)'"
              @click="toggleNameDisplayMode"
              class="clickable-th"
            >
              {{ nameDisplayMode === 0 ? 'Name' : 'Code' }} <span class="toggle-icon">🔁</span>
            </th>
            <th title="当前价 (Current Price)" @click="toggleSort('curPrice')" class="clickable-th">
              Price
              <span class="sort-icon">{{
                sortColumn === 'curPrice' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th title="当日盈亏 (Daily Pnl)" @click="toggleSort('dpnl')" class="clickable-th">
              D.PnL
              <span class="sort-icon">{{
                sortColumn === 'dpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th title="持仓总盈亏 (Total Pnl)" @click="toggleSort('tpnl')" class="clickable-th">
              T.PnL
              <span class="sort-icon">{{
                sortColumn === 'tpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th
              :title="
                avgDisplayMode === 0
                  ? '均摊成本/保本价 (Avg. Buy Price)'
                  : '持仓市值 (Market Value)'
              "
              @click="toggleAvgDisplayMode"
              class="clickable-th"
            >
              {{ avgDisplayMode === 0 ? 'Avg' : 'Val' }} <span class="toggle-icon">🔁</span>
            </th>
            <th title="涨跌幅 (Change)" @click="toggleSort('change')" class="clickable-th">
              Chg%
              <span class="sort-icon">{{
                sortColumn === 'change' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th title="持仓手数 (Amount)">Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stock in displayStocks"
            :key="stock.code"
            :class="{ 'row-selected': selectedCodes.includes(stock.code) }"
            @click="toggleRowSelection(stock.code)"
          >
            <td :class="['name-cell', quotes[stock.code]?.changeAmount >= 0 ? 'red' : 'green']">
              <template v-if="!isCensored">
                <div v-if="nameDisplayMode === 0">{{ formatName(quotes[stock.code]?.name) }}</div>
                <div v-else>{{ stock.code }}</div>
              </template>
              <template v-else>
                <div>❇❇</div>
              </template>
            </td>
            <td
              :class="['price-cell', quotes[stock.code]?.changeAmount >= 0 ? 'red' : 'green']"
              @click.stop="copyPrice(quotes[stock.code]?.currentPrice)"
              title="Click to copy price to clipboard"
            >
              <div v-if="!isCensored" class="clickable-tag">
                {{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}
              </div>
              <span v-else>❇❇</span>
            </td>
            <td :class="calculateDailyPnl(stock) >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">{{ calculateDailyPnl(stock).toFixed(1) }}</span>
              <span v-else>❇❇</span>
            </td>
            <td :class="(calculateTotalPnl(stock) || 0) >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">
                {{
                  calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(1) : '--'
                }}
              </span>
              <span v-else>❇❇</span>
            </td>
            <td>
              <span v-if="!isCensored">
                <template v-if="avgDisplayMode === 0">
                  {{ stock.cost?.toFixed(3) }}
                </template>
                <template v-else>
                  {{
                    calculateMarketValue(stock).toLocaleString(undefined, {
                      maximumFractionDigits: 0
                    })
                  }}
                </template>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td :class="quotes[stock.code]?.changeAmount >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">
                <span v-if="quotes[stock.code]">
                  {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
                  }}{{ quotes[stock.code].changePercent }}%
                </span>
                <span v-else>--</span>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td
              @click.stop="adjustStockFlow(stock)"
              class="clickable-cell"
              title="Click to adjust quantity"
            >
              <div v-if="!isCensored" class="clickable-tag">
                {{ stock.amount }}
              </div>
              <span v-else>❇❇</span>
            </td>
          </tr>
          <tr v-if="stocks.length === 0">
            <td colspan="7" class="empty-row">no stocks</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-section">
      <div class="bottom-actions">
        <button class="back-btn home-btn" @click="goBack" title="Back to ball">
          <img src="../assets/electron.svg" class="mini-logo" alt="ball" />
        </button>
        <button class="back-btn home-btn" @click="goToSetting" title="Go to setting page">
          ⚙️
        </button>
        <div class="input-group">
          <input
            v-model="inputCode"
            placeholder="code"
            @keyup.enter="addStock"
            class="stock-input"
          />
          <button class="add-btn" @click="addStock">➕</button>
        </div>
      </div>
      <div class="summary-pnl" title="Toggle Hide Amount" @click="toggleCensor">
        <span
          :class="[
            'visible-summary',
            totalDailyPnl > 0 ? 'red' : totalDailyPnl < 0 ? 'green' : 'gray'
          ]"
          title="Daily PnL Total"
        >
          <span class="pnl-label">D:</span>
          <span v-if="!isCensored"
            >{{ totalDailyPnl > 0 ? '+' : '' }}{{ totalDailyPnl.toFixed(1) }}</span
          >
          <span v-else>❇❇</span>
        </span>
        <span
          :class="[
            'visible-summary',
            totalHoldingPnl > 0 ? 'red' : totalHoldingPnl < 0 ? 'green' : 'gray'
          ]"
          title="Holding PnL Total"
        >
          <span class="pnl-label">H:</span>
          <span v-if="!isCensored"
            >{{ totalHoldingPnl > 0 ? '+' : '' }}{{ totalHoldingPnl.toFixed(1) }}</span
          >
          <span v-else>❇❇</span>
        </span>
        <span class="lock-icon">{{ isCensored ? '🔒' : '🔓' }}</span>
      </div>
      <button
        v-if="stocks.length > 0"
        class="clear-all-btn"
        @click="handleDeleteAction"
        :title="selectedCodes.length > 0 ? 'Delete Selected' : 'Clear All'"
      >
        <span class="clear-all-icon">{{ selectedCodes.length > 0 ? '🗑️' : '🧹' }}</span>
      </button>
    </div>

    <!-- 暗色自定义模态框组件 -->
    <Modal ref="modalRef" />

    <!-- 通用确认组件 -->
    <Confirm ref="confirmRef" />

    <!-- 全局提示组件 -->
    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.main-list-container {
  margin: 20px; /* 留出足够的空间显示阴影 */
  padding: 0 10px 10px 10px; /* Top padding 0 for drag handle */
  color: #fff;
  min-height: 100px;
  box-sizing: border-box;
  display: inline-flex; /* 允许根据内容宽度收缩 */
  flex-direction: column;
  background-color: rgba(31, 34, 46, 0.95); /* 半透明背景 */
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  background-clip: padding-box; /* 确保背景不超出圆角边框 */
}

.bottom-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-group {
  display: flex;
  align-items: center;
}

.stock-input {
  padding: 4px 2px 4px 6px;
  font-size: 12px;
  border-radius: 6px 0 0 6px;
  border: 1px solid #3a3d4a; /* Fainter border */
  border-right: none;
  background-color: #2f3241;
  color: white;
  outline: none;
  width: 60px;
}

.add-btn {
  padding: 3px 2px;
  font-size: 12px;
  cursor: pointer;
  background-color: #2f3241;
  color: #fff;
  border: 1px solid #3a3d4a; /* Fainter border */
  border-radius: 0 6px 6px 0;
  transition: background-color 0.3s;
}

.add-btn:hover {
  background-color: var(--ev-c-green);
  border-color: var(--ev-c-green);
}

.back-btn {
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  background-color: #2f3241;
  color: #fff;
  border: 1px solid #3a3d4a; /* Fainter border */
  border-radius: 6px;
  transition: background-color 0.3s;
}

.back-btn:hover {
  border-color: var(--ev-button-alt-hover-border);
  background-color: var(--ev-button-alt-hover-bg);
}

.home-btn {
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 23px;
  padding: 0;
}

.mini-logo {
  width: 20px;
  height: 20px;
  opacity: 0.9;
}

.mini-btn {
  padding: 2px 2px;
  font-size: 12px;
  background-color: transparent;
  border: none;
}
.mini-btn:hover {
  background-color: rgba(255, 77, 79, 0.2);
}

.table-container {
  flex: 1;
  overflow-y: auto;
}

.stock-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.stock-table th,
.stock-table td {
  padding: 1px 4px; /* Further reduced padding for compact look */
  border-bottom: 1px solid #3a3d4a;
}

.stock-table th {
  text-align: center;
  color: #aaa;
  font-size: 11px; /* Slightly smaller font for headers */
}

.stock-table th:first-child,
.stock-table td:first-child,
.stock-table td:nth-child(2),
.stock-table td:nth-child(5),
.stock-table td:last-child {
  text-align: center;
}

.edit-input {
  width: 45px;
  padding: 0; /* Removed padding to minimize height */
  text-align: center;
  background-color: transparent;
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: white;
  border-radius: 4px;
  font-size: 12px;
  height: 18px; /* Fixed small height */
}

/* 隐藏默认上下箭头 */
.edit-input::-webkit-outer-spin-button,
.edit-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.edit-input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}

.number-input-group {
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-btn {
  opacity: 0;
  transition:
    opacity 0.2s,
    background-color 0.2s;
  background-color: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}
/* .step-btn的奇数padding为4,6；偶数padding为4,5 */
.step-btn:nth-of-type(odd) {
  padding: 0 4px;
}
.step-btn:nth-of-type(even) {
  padding: 0 4px;
}

.number-input-group:hover .step-btn {
  opacity: 1;
}

.step-btn:hover {
  background-color: #4a4e5d;
  color: #fff;
}

.empty-row {
  text-align: center !important;
  color: #666;
  padding: 30px !important;
}

.summary-section {
  margin-top: 4px; /* Reduced from 8px */
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.red {
  color: var(--ev-c-pink);
}

.gray {
  color: #666666;
}

.green {
  color: var(--ev-c-blue);
}

.lock-icon {
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.3s ease;
}

.clickable-th {
  cursor: pointer;
  user-select: none;
  transition: color 0.3s;
  white-space: nowrap;
}

.row-selected {
  background-color: rgba(46, 204, 113, 0.15) !important;
}

.row-selected td {
  border-bottom-color: rgba(46, 204, 113, 0.3);
}

.clickable-th:hover {
  color: #fff !important;
}

.toggle-icon,
.sort-icon {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 1px;
}

.clickable-th:hover .toggle-icon,
.clickable-th:hover .sort-icon {
  opacity: 1;
}

.sort-icon {
  display: inline-block;
  width: 8px;
  color: var(--ev-c-green);
}

.clear-all-btn {
  background-color: rgba(255, 77, 79, 0.1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-left: 8px;
  padding: 3px 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.clear-all-btn:hover {
  background-color: rgba(255, 77, 79, 0.3);
}

.clear-all-icon {
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.3s ease;
}

.clear-all-btn:hover .clear-all-icon {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

/* Summary Section & PNL */
.summary-pnl {
  background-color: rgba(255, 255, 255, 0.05);
  flex: 1;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  margin-left: 8px;
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.summary-pnl:hover .lock-icon {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.pnl-label {
  font-size: 10px;
  opacity: 0.6;
  margin-right: 2px;
}

.visible-summary {
  user-select: none;
  display: flex;
  align-items: center;
  font-size: 13px;
  padding: 0 4px;
}

.visible-summary:hover {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.code-sub {
  font-size: 10px;
  color: #888;
  margin-top: 2px;
}

/* Base font size for other cells */
.stock-table td {
  font-size: 12px;
}

.name-cell {
  white-space: nowrap;
  text-align: center !important;
  font-size: 10px; /* Reduced font size for Name column */
}

/* Adjust font sizes for specific columns: 2 (Price), 3 (D.PnL), 4 (T.PnL), 6 (Chg%) */
.stock-table td:nth-child(2),
.stock-table td:nth-child(3),
.stock-table td:nth-child(4),
.stock-table td:nth-child(6) {
  font-size: 14px;
}
.price-cell {
  cursor: pointer;
}
.price-cell:active {
  opacity: 0.6;
}

.clickable-cell {
  cursor: pointer;
}

/* 列表交互增强 */
.stock-table tr {
  transition: background-color 0.2s;
  cursor: default;
}

.stock-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.row-selected {
  background-color: rgba(46, 204, 113, 0.1) !important; /* 选中的行淡淡的绿色底 */
  box-shadow: inset 2px 0 0 var(--ev-c-green);
}

.clickable-tag {
  display: inline-block;
  padding: 0 4px;
  line-height: 16px;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  min-width: 22px;
  text-align: center;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.clickable-tag:hover {
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.clickable-cell .clickable-tag {
  /* 股数 tag 样式维持绿色 */
  color: var(--ev-c-green);
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
