<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import Confirm from '../components/Confirm.vue'
import Toast from '../components/Toast.vue'
import FundEditModal from '../components/FundEditModal.vue'

const { t } = useI18n()
const router = useRouter()

// 基金数据模型
interface FundItem {
  code: string // 基金代码，如 110011
  cost: number // 买入成本净值
  shares: number // 持有份额
  buyDate?: string // 买入日期 (YYYY-MM-DD)
}

// 基金行情
interface FundQuote {
  name: string // 基金名称
  nav: number // 最新净值
  navDate: string // 净值日期
  dayGrowth: number // 日涨幅 %
}

const inputCode = ref('')
const funds = ref<FundItem[]>([])
const quotes = ref<Record<string, FundQuote>>({})
let timer: ReturnType<typeof setInterval> | null = null

const containerRef = ref<HTMLElement | null>(null)
const fundInputRef = ref<HTMLInputElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// 隐私模式
const isCensored = ref(false)
const toggleCensor = () => {
  isCensored.value = !isCensored.value
}

// --- 组件引用 ---
const confirmRef = ref<InstanceType<typeof Confirm> | null>(null)
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const fundEditRef = ref<InstanceType<typeof FundEditModal> | null>(null)

// 打开编辑弹窗并处理结果
const openEditModal = async (
  code: string,
  name: string,
  cost: number,
  shares: number,
  buyDate: string,
  isNew: boolean
) => {
  const result = await fundEditRef.value?.open(code, name, cost, shares, buyDate, isNew)
  if (!result) return // 用户取消

  if (result.isNew) {
    funds.value.push({
      code: result.code,
      cost: result.cost,
      shares: result.shares,
      buyDate: result.buyDate || undefined
    })
    inputCode.value = ''
    toastRef.value?.show(t('fundAdded'), 'success')
    nextTick(() => fundInputRef.value?.focus())
  } else {
    const fund = funds.value.find((f) => f.code === result.code)
    if (fund) {
      fund.cost = result.cost
      fund.shares = result.shares
      fund.buyDate = result.buyDate || undefined
    }
    toastRef.value?.show(t('positionUpdated'), 'success')
  }
  saveFunds()
}

// 选中的行（多选）
const selectedCodes = ref<string[]>([])
const toggleRowSelection = (code: string) => {
  const index = selectedCodes.value.indexOf(code)
  if (index > -1) {
    selectedCodes.value.splice(index, 1)
  } else {
    selectedCodes.value.push(code)
  }
}

// Name 列展示模式：0=名称, 1=代码
const nameDisplayMode = ref(0)
const toggleNameDisplayMode = () => {
  nameDisplayMode.value = (nameDisplayMode.value + 1) % 2
}

const formatName = (name: string | undefined): string => {
  if (!name) return '--'
  if (name.length > 5) return name.slice(0, 5) + '...'
  return name
}

const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 计算持有天数
const calcHoldingDays = (fund: FundItem): number | null => {
  if (!fund.buyDate) return null
  const buy = new Date(fund.buyDate)
  const now = new Date()
  return Math.floor((now.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24))
}

// 加载本地存储
const loadFunds = () => {
  const saved = localStorage.getItem('my_funds')
  if (saved) {
    try {
      funds.value = JSON.parse(saved)
    } catch {
      /* ignore */
    }
  }
}

const saveFunds = () => {
  localStorage.setItem('my_funds', JSON.stringify(funds.value))
}

// 获取单个基金净值（天天基金 JSONP，带备用源）
// 接口固定回调名为 jsonpgz，不支持自定义 cb
const FUND_APIS = ['https://fundgz.1234567.com.cn/js/', 'https://fundgz.1702702.com/js/']

const fetchFundByCode = (code: string): Promise<FundQuote | null> => {
  return new Promise((resolve) => {
    let apiIndex = 0

    const tryFetch = () => {
      if (apiIndex >= FUND_APIS.length) {
        resolve(null)
        return
      }
      // 天天基金 JSONP 固定回调名 jsonpgz
      ;(window as any).jsonpgz = (data: any) => {
        delete (window as any).jsonpgz
        const el = document.getElementById(`fund-script-${code}`)
        if (el) document.body.removeChild(el)
        if (data && data.fundcode) {
          resolve({
            name: data.name || code,
            nav: parseFloat(data.dwjz) || 0,
            navDate: data.jzrq || '',
            dayGrowth: parseFloat(data.gszzl) || 0
          })
        } else {
          resolve(null)
        }
      }
      const script = document.createElement('script')
      script.id = `fund-script-${code}`
      script.src = `${FUND_APIS[apiIndex]}${code}.js?rt=${Date.now()}`
      script.onerror = () => {
        delete (window as any).jsonpgz
        const el = document.getElementById(`fund-script-${code}`)
        if (el) document.body.removeChild(el)
        apiIndex++
        tryFetch()
      }
      document.body.appendChild(script)
    }

    tryFetch()
  })
}

// 串行获取所有基金净值（避免 jsonpgz 回调冲突）
const fetchAllQuotes = async (force = false) => {
  if (funds.value.length === 0) return
  if (!force && !isTradingTime()) return

  for (const fund of funds.value) {
    const result = await fetchFundByCode(fund.code)
    if (result) quotes.value[fund.code] = result
  }
}

// 添加基金
const addFund = async () => {
  let code = inputCode.value.trim()
  if (!code) return
  if (!/^\d{6}$/.test(code)) {
    toastRef.value?.show(t('fundCodeInvalid'), 'fail')
    return
  }
  if (funds.value.some((f) => f.code === code)) {
    toastRef.value?.show(t('fundExists'), 'fail')
    return
  }

  // 先获取净值
  const quote = await fetchFundByCode(code)
  if (quote) {
    quotes.value[code] = quote
  }

  // 弹出输入弹窗
  openEditModal(code, quote?.name || code, quote?.nav || 0, 1000, getTodayStr(), true)
}

// 编辑已有基金持仓
const editFund = (fund: FundItem) => {
  const quote = quotes.value[fund.code]
  openEditModal(
    fund.code,
    quote?.name || fund.code,
    fund.cost,
    fund.shares,
    fund.buyDate || '',
    false
  )
}

// 删除/清空
const handleDeleteAction = async () => {
  if (selectedCodes.value.length > 0) {
    const confirmed = await confirmRef.value?.open(
      t('deleteFund'),
      t('deleteFundConfirm', { count: selectedCodes.value.length })
    )
    if (confirmed) {
      funds.value = funds.value.filter((f) => !selectedCodes.value.includes(f.code))
      selectedCodes.value = []
      saveFunds()
      toastRef.value?.show(t('selectedRemoved'), 'info')
    }
  } else {
    if (funds.value.length === 0) return
    const confirmed = await confirmRef.value?.open(t('clearList'), t('clearFundConfirm'))
    if (confirmed) {
      funds.value = []
      saveFunds()
      toastRef.value?.show(t('allCleared'), 'warn')
    }
  }
}

// 是否交易时间（与股票一致）
const isTradingTime = () => {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const timeNum = now.getHours() * 100 + now.getMinutes()
  return (timeNum >= 915 && timeNum <= 1130) || (timeNum >= 1300 && timeNum <= 1500)
}

// 计算某只基金的持仓盈亏 = (最新净值 - 成本净值) × 份额
const calculatePnl = (fund: FundItem): number | null => {
  const quote = quotes.value[fund.code]
  if (!quote || fund.cost <= 0 || fund.shares <= 0) return null
  return (quote.nav - fund.cost) * fund.shares
}

// 计算收益率 = (最新净值 - 成本净值) / 成本净值 × 100%
const calculateYield = (fund: FundItem): number | null => {
  const quote = quotes.value[fund.code]
  if (!quote || fund.cost <= 0) return null
  return ((quote.nav - fund.cost) / fund.cost) * 100
}

// 计算持仓市值
const calculateMarketValue = (fund: FundItem): number => {
  const quote = quotes.value[fund.code]
  if (!quote || fund.shares <= 0) return 0
  return quote.nav * fund.shares
}

// 最后一列展示模式：0=持有天数, 1=持仓市值
const lastColMode = ref(0)
const toggleLastColMode = () => {
  lastColMode.value = (lastColMode.value + 1) % 2
}

// 总持仓盈亏
const totalPnl = computed(() => {
  return funds.value.reduce((total, fund) => {
    const pnl = calculatePnl(fund)
    return total + (pnl || 0)
  }, 0)
})

// 复制价格
const copyPrice = (price: number | undefined) => {
  if (!price) return
  navigator.clipboard.writeText(price.toString()).then(() => {
    toastRef.value?.show(t('priceCopied'), 'success')
  })
}

// 复制总盈亏到剪贴板
const copyTotalPnl = () => {
  if (isCensored.value) return
  const text = `${totalPnl.value > 0 ? '+' : ''}${totalPnl.value.toFixed(1)}`
  navigator.clipboard.writeText(text).then(() => {
    toastRef.value?.show(t('totalPnlCopied'), 'success')
  })
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

// 排序显示列表
const displayFunds = computed(() => {
  const list = [...funds.value]

  if (sortColumn.value && sortOrder.value !== 'none') {
    return list.sort((a, b) => {
      let valA = 0,
        valB = 0
      switch (sortColumn.value) {
        case 'nav':
          valA = quotes.value[a.code]?.nav || 0
          valB = quotes.value[b.code]?.nav || 0
          break
        case 'pnl':
          valA = calculatePnl(a) ?? -999999999
          valB = calculatePnl(b) ?? -999999999
          break
        case 'chg':
          valA = quotes.value[a.code]?.dayGrowth || 0
          valB = quotes.value[b.code]?.dayGrowth || 0
          break
        case 'yield':
          valA = calculateYield(a) ?? -999999999
          valB = calculateYield(b) ?? -999999999
          break
      }
      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    })
  }

  return list.sort((a, b) => {
    const nameA = quotes.value[a.code]?.name || a.code
    const nameB = quotes.value[b.code]?.name || b.code
    return nameA.localeCompare(nameB, 'zh-CN')
  })
})

// 窗口尺寸同步
const syncWindowSize = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const width = Math.ceil(rect.width) + 40
  const height = Math.ceil(rect.height) + 40
  window.electron.ipcRenderer.send('resize-window', width, height)
}

// 导航
const goBack = () => {
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/ball')
}

const goToSetting = () => {
  router.push('/setting')
}

const goToStock = () => {
  router.push('/')
}

const goToGold = () => {
  router.push('/gold')
}

onMounted(async () => {
  loadFunds()
  fetchAllQuotes(true)
  timer = setInterval(() => fetchAllQuotes(false), 3000)

  await nextTick()

  if (containerRef.value) {
    syncWindowSize()
    setTimeout(syncWindowSize, 300)
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncWindowSize)
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="fund-container">
    <DragHandle>
      <template #left>
        <button class="nav-btn" @click="goBack" :title="t('backToBall')">
          <img src="../assets/electron.svg" class="nav-icon" alt="ball" />
        </button>
      </template>
      <template #right>
        <button class="nav-btn" @click="goToSetting" :title="t('goToSetting')">⚙️</button>
      </template>
    </DragHandle>

    <div class="table-container">
      <table class="fund-table">
        <thead>
          <tr>
            <th
              :title="nameDisplayMode === 0 ? t('name') : t('code')"
              @click="toggleNameDisplayMode"
              class="clickable-th"
            >
              {{ nameDisplayMode === 0 ? 'Name' : 'Code' }} <span class="toggle-icon">🔁</span>
            </th>
            <th :title="t('fundNav')" @click="toggleSort('nav')" class="clickable-th">
              NAV
              <span class="sort-icon">{{
                sortColumn === 'nav' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th :title="t('totalPnl')" @click="toggleSort('pnl')" class="clickable-th">
              PnL
              <span class="sort-icon">{{
                sortColumn === 'pnl' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th :title="t('change')" @click="toggleSort('chg')" class="clickable-th">
              Chg%
              <span class="sort-icon">{{
                sortColumn === 'chg' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th :title="t('yieldRate')" @click="toggleSort('yield')" class="clickable-th">
              Yield
              <span class="sort-icon">{{
                sortColumn === 'yield' ? (sortOrder === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </th>
            <th
              :title="lastColMode === 0 ? t('holdingDays') : t('marketValue')"
              @click="toggleLastColMode"
              class="clickable-th"
            >
              {{ lastColMode === 0 ? 'Days' : 'Val' }} <span class="toggle-icon">🔁</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="fund in displayFunds"
            :key="fund.code"
            :class="{ 'row-selected': selectedCodes.includes(fund.code) }"
            @click="toggleRowSelection(fund.code)"
          >
            <td :class="['name-cell', (quotes[fund.code]?.dayGrowth || 0) >= 0 ? 'red' : 'green']" :title="quotes[fund.code]?.name || fund.code">
              <template v-if="!isCensored">
                <div v-if="nameDisplayMode === 0">{{ formatName(quotes[fund.code]?.name) }}</div>
                <div v-else>{{ fund.code }}</div>
              </template>
              <template v-else><div>❇❇</div></template>
            </td>
            <td
              :class="['price-cell', (quotes[fund.code]?.dayGrowth || 0) >= 0 ? 'red' : 'green']"
              @click.stop="copyPrice(quotes[fund.code]?.nav)"
              :title="t('clickToCopy')"
            >
              <div v-if="!isCensored" class="clickable-tag">
                {{ quotes[fund.code]?.nav?.toFixed(4) || '--' }}
              </div>
              <span v-else>❇❇</span>
            </td>
            <td
              :class="[(calculatePnl(fund) || 0) >= 0 ? 'red' : 'green', 'clickable-cell']"
              @click.stop="editFund(fund)"
              :title="t('clickToEdit')"
            >
              <div v-if="!isCensored" class="clickable-tag">
                {{ calculatePnl(fund) !== null ? calculatePnl(fund)!.toFixed(1) : '--' }}
              </div>
              <span v-else>❇❇</span>
            </td>
            <td :class="(quotes[fund.code]?.dayGrowth || 0) >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">
                <span v-if="quotes[fund.code]">
                  {{ quotes[fund.code].dayGrowth > 0 ? '+' : '' }}{{ quotes[fund.code].dayGrowth }}%
                </span>
                <span v-else>--</span>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td :class="(calculateYield(fund) || 0) >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">
                <span v-if="calculateYield(fund) !== null">
                  {{ calculateYield(fund)! > 0 ? '+' : '' }}{{ calculateYield(fund)!.toFixed(2) }}%
                </span>
                <span v-else>--</span>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td class="days-cell">
              <span v-if="!isCensored">
                <template v-if="lastColMode === 0">{{ calcHoldingDays(fund) ?? '--' }}</template>
                <template v-else>{{
                  calculateMarketValue(fund) > 0
                    ? calculateMarketValue(fund).toLocaleString(undefined, {
                        maximumFractionDigits: 0
                      })
                    : '--'
                }}</template>
              </span>
              <span v-else>❇❇</span>
            </td>
          </tr>
          <tr v-if="funds.length === 0">
            <td colspan="6" class="empty-row">{{ t('noFunds') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-section">
      <div class="bottom-actions">
        <button class="mode-btn stock-btn" @click="goToStock" :title="t('switchToStock')">
          <span class="mode-icon">📈</span>
        </button>
        <button class="mode-btn gold-btn" @click="goToGold" :title="t('switchToGold')">
          <span class="mode-icon">🟨</span>
        </button>
        <div class="input-group">
          <input
            v-model="inputCode"
            :placeholder="t('fundCode')"
            @keyup.enter="addFund"
            class="fund-input"
            ref="fundInputRef"
          />
          <button class="add-btn" @click="addFund">➕</button>
        </div>
      </div>
      <div class="summary-pnl">
        <span
          :class="['visible-summary', totalPnl > 0 ? 'red' : totalPnl < 0 ? 'green' : 'gray']"
          @click.stop="copyTotalPnl"
          :title="t('totalPnl')"
        >
          <span class="pnl-label">T.PnL:</span>
          <span v-if="!isCensored">{{ totalPnl > 0 ? '+' : '' }}{{ totalPnl.toFixed(1) }}</span>
          <span v-else>❇❇</span>
        </span>
        <span class="lock-icon" @click="toggleCensor" :title="t('toggleHide')">{{
          isCensored ? '🔒' : '🔓'
        }}</span>
      </div>
      <button
        v-if="funds.length > 0"
        class="clear-all-btn"
        @click="handleDeleteAction"
        :title="selectedCodes.length > 0 ? t('deleteSelected') : t('clearAll')"
      >
        <span class="clear-all-icon">{{ selectedCodes.length > 0 ? '🗑️' : '🧹' }}</span>
      </button>
    </div>

    <Confirm ref="confirmRef" />
    <Toast ref="toastRef" />
    <FundEditModal ref="fundEditRef" />
  </div>
</template>

<style scoped>
.fund-container {
  margin: 20px;
  padding: 4px 10px 10px 10px;
  color: #fff;
  min-height: 100px;
  box-sizing: border-box;
  display: inline-flex;
  flex-direction: column;
  background-color: rgba(31, 34, 46, 0.95);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  background-clip: padding-box;
}

.nav-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
  opacity: 0.6;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-btn:hover {
  opacity: 1;
  transform: scale(1.15);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}
.nav-btn:active {
  transform: scale(1.05);
}
.nav-icon {
  width: 16px;
  height: 16px;
  opacity: 0.9;
  transition: opacity 0.3s ease;
}
.nav-btn:hover .nav-icon {
  opacity: 1;
}

.table-container {
  flex: 1;
  overflow-y: auto;
}

.fund-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.fund-table th,
.fund-table td {
  padding: 1px 4px;
  border-bottom: 1px solid #3a3d4a;
}
.fund-table th {
  text-align: center;
  color: #aaa;
  font-size: 11px;
}
.fund-table td {
  font-size: 12px;
}
.fund-table td:first-child,
.fund-table td:nth-child(2) {
  text-align: center;
}
.fund-table td:nth-child(2),
.fund-table td:nth-child(3),
.fund-table td:nth-child(4),
.fund-table td:nth-child(5) {
  font-size: 14px;
}

.name-cell {
  white-space: nowrap;
  text-align: center !important;
  font-size: 10px;
}
.price-cell {
  cursor: pointer;
}
.price-cell:active {
  opacity: 0.6;
}

.clickable-th {
  cursor: pointer;
  user-select: none;
  transition: color 0.3s;
  white-space: nowrap;
}
.clickable-th:hover {
  color: #fff !important;
}
.toggle-icon {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 1px;
}
.sort-icon {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 1px;
  display: inline-block;
  width: 8px;
  color: var(--ev-c-green);
}
.clickable-th:hover .toggle-icon,
.clickable-th:hover .sort-icon {
  opacity: 1;
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

.row-selected {
  background-color: rgba(46, 204, 113, 0.15) !important;
  border-radius: 6px;
}
.row-selected td {
  border-bottom-color: rgba(46, 204, 113, 0.3);
}
.row-selected td:first-child {
  border-radius: 6px 0 0 6px;
}
.row-selected td:last-child {
  border-radius: 0 6px 6px 0;
}

.clickable-cell {
  cursor: pointer;
}
.days-cell {
  text-align: center;
  font-size: 12px;
  color: #888;
}

.fund-table tr {
  transition: background-color 0.2s;
  cursor: default;
}
.fund-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.empty-row {
  text-align: center !important;
  color: #666;
  padding: 30px !important;
}

.red {
  color: var(--ev-c-pink);
}
.green {
  color: var(--ev-c-blue);
}
.gray {
  color: #666;
}

.summary-section {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bottom-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.mode-btn {
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}
.stock-btn {
  background-color: rgba(46, 204, 113, 0.1);
}
.stock-btn:hover {
  background-color: rgba(46, 204, 113, 0.3);
}
.gold-btn {
  background-color: rgba(255, 215, 0, 0.1);
}
.gold-btn:hover {
  background-color: rgba(255, 215, 0, 0.3);
}
.mode-btn:active {
  transform: scale(0.95);
}
.mode-icon {
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.3s ease;
}
.mode-btn:hover .mode-icon {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.input-group {
  display: flex;
  align-items: center;
}
.fund-input {
  padding: 4px 2px 4px 6px;
  font-size: 12px;
  border-radius: 6px 0 0 6px;
  border: 1px solid #3a3d4a;
  border-right: none;
  background-color: #2f3241;
  color: white;
  outline: none;
  width: 70px;
}
.add-btn {
  padding: 3px 2px;
  font-size: 12px;
  cursor: pointer;
  background-color: #2f3241;
  color: #fff;
  border: 1px solid #3a3d4a;
  border-radius: 0 6px 6px 0;
  transition: background-color 0.3s;
}
.add-btn:hover {
  background-color: var(--ev-c-green);
  border-color: var(--ev-c-green);
}

.summary-pnl {
  background-color: rgba(255, 255, 255, 0.05);
  flex: 1;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
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
  margin-right: auto;
  cursor: pointer;
}
.visible-summary:hover {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.lock-icon {
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.3s ease;
  cursor: pointer;
}
.lock-icon:hover {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
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
</style>
