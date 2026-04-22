<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import Modal from '../components/Modal.vue'
import Confirm from '../components/Confirm.vue'
import Toast from '../components/Toast.vue'
import { useUpdateCheck } from '../composables/useUpdateCheck'

const { t } = useI18n()
const router = useRouter()
const { hasPendingUpdate, checkPendingUpdate } = useUpdateCheck()

// 股票数据模型
interface StockItem {
  code: string // 比如 sh600519
  cost: number // 成本价
  amount: number // 持仓手数 (1手=100股)
  buyDate?: string // 买入日期 (YYYY-MM-DD)
  isNew?: boolean // 是否为新添加（用于初始化默认成本）
  priceAlerts?: PriceAlert[] // 价格提醒列表
  realizedPnl?: number // 已实现盈亏（减仓/清仓时累计，永久）
  dailyRealizedPnl?: number // 当日已实现盈亏（调仓时累计，每日清零）
  dailyDate?: string // 记录 dailyRealizedPnl 对应的日期，用于自动清零
}

// 价格提醒
interface PriceAlert {
  targetPrice: number // 目标价格
  direction: 'up' | 'down' // up: 涨到该价格提醒, down: 跌到该价格提醒
  triggered: boolean // 是否已触发
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
const stockInputRef = ref<HTMLInputElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// 前往黄金页面
const goToGold = (): void => {
  router.push('/gold')
}

// 前往基金页面
const goToFund = (): void => {
  router.push('/fund')
}

// 显示导航模块
const visibleModules = ref<string[]>(['stock', 'gold', 'fund'])

// Price 列展示模式：0=现价, 1=涨跌幅, 2=现价/涨跌幅
const priceDisplayMode = ref(parseInt(localStorage.getItem('stock_priceDisplayMode') || '0'))
const togglePriceDisplayMode = () => {
  priceDisplayMode.value = (priceDisplayMode.value + 1) % 3
  localStorage.setItem('stock_priceDisplayMode', String(priceDisplayMode.value))
}

// 拆分列（涨跌幅/总盈比/市值）— 多选数组
const splitColumns = ref<string[]>([])
const splitChg = computed(() => splitColumns.value.includes('chg'))
const splitPnl = computed(() => splitColumns.value.includes('pnl'))
const splitVal = computed(() => splitColumns.value.includes('val'))

// Qty 列的展示模式：0=持仓手数, 1=价格提醒
const qtyDisplayMode = ref(parseInt(localStorage.getItem('stock_qtyDisplayMode') || '0'))
const toggleQtyDisplayMode = (): void => {
  qtyDisplayMode.value = (qtyDisplayMode.value + 1) % 2
  localStorage.setItem('stock_qtyDisplayMode', String(qtyDisplayMode.value))
}

// 排序状态（持久化）
const sortColumn = ref<string | null>(null)
const sortOrder = ref<'asc' | 'desc' | 'none'>('none')

// 加载排序状态
const loadSortState = () => {
  const savedColumn = localStorage.getItem('sort_column')
  const savedOrder = localStorage.getItem('sort_order')
  if (savedColumn && savedOrder) {
    sortColumn.value = savedColumn
    sortOrder.value = savedOrder as 'asc' | 'desc' | 'none'
  }
}

// 保存排序状态
const saveSortState = () => {
  if (sortColumn.value) {
    localStorage.setItem('sort_column', sortColumn.value)
    localStorage.setItem('sort_order', sortOrder.value)
  } else {
    localStorage.removeItem('sort_column')
    localStorage.removeItem('sort_order')
  }
}

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
  saveSortState()
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
          valA =
            dpnlDisplayMode.value === 1 ? (calculateDailyPnlPercent(a) ?? -999999999) : calculateDailyPnl(a)
          valB =
            dpnlDisplayMode.value === 1 ? (calculateDailyPnlPercent(b) ?? -999999999) : calculateDailyPnl(b)
          break
        case 'tpnl':
          valA =
            tpnlDisplayMode.value === 1
              ? (calculateTotalPnlPercent(a) ?? -999999999)
              : (calculateTotalPnl(a) ?? -999999999)
          valB =
            tpnlDisplayMode.value === 1
              ? (calculateTotalPnlPercent(b) ?? -999999999)
              : (calculateTotalPnl(b) ?? -999999999)
          break
        case 'avg':
          valA = avgDisplayMode.value === 1 ? calculateMarketValue(a) : a.cost || 0
          valB = avgDisplayMode.value === 1 ? calculateMarketValue(b) : b.cost || 0
          break
        case 'change':
          valA = qA?.changePercent || 0
          valB = qB?.changePercent || 0
          break
        case 'tpnlPct':
          valA = calculateTotalPnlPercent(a) ?? -999999999
          valB = calculateTotalPnlPercent(b) ?? -999999999
          break
        case 'marketVal':
          valA = calculateMarketValue(a)
          valB = calculateMarketValue(b)
          break
        case 'name': {
          const nameA = qA?.name || a.code
          const nameB = qB?.name || b.code
          const cmp = nameA.localeCompare(nameB, 'zh-CN')
          return sortOrder.value === 'asc' ? cmp : -cmp
        }
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

// Name 这一列单行显示代码还是名称展示的追踪列表
const shownCodes = ref<string[]>([])
const toggleNameDisplay = (code: string) => {
  if (shownCodes.value.includes(code)) {
    shownCodes.value = shownCodes.value.filter((c) => c !== code)
  } else {
    shownCodes.value.push(code)
  }
}

// Name 列全局展示模式：0=名称, 1=代码
const nameDisplayMode = ref(parseInt(localStorage.getItem('stock_nameDisplayMode') || '0'))
const toggleNameDisplayMode = () => {
  nameDisplayMode.value = (nameDisplayMode.value + 1) % 2
  localStorage.setItem('stock_nameDisplayMode', String(nameDisplayMode.value))
}

// D.PnL 列展示模式：0=当日盈亏额, 1=当日盈亏比(%), 2=盈亏额/盈亏比
const dpnlDisplayMode = ref(parseInt(localStorage.getItem('stock_dpnlDisplayMode') || '0'))
const toggleDpnlDisplayMode = () => {
  dpnlDisplayMode.value = (dpnlDisplayMode.value + 1) % 3
  localStorage.setItem('stock_dpnlDisplayMode', String(dpnlDisplayMode.value))
}

// T.PnL 列展示模式：0=总盈亏额, 1=总盈亏比(%), 2=盈亏额/盈亏比
const tpnlDisplayMode = ref(parseInt(localStorage.getItem('stock_tpnlDisplayMode') || '0'))
const toggleTpnlDisplayMode = () => {
  tpnlDisplayMode.value = (tpnlDisplayMode.value + 1) % 3
  localStorage.setItem('stock_tpnlDisplayMode', String(tpnlDisplayMode.value))
}

// Avg 列展示模式：0=均摊成本, 1=持仓市值, 2=成本/市值
const avgDisplayMode = ref(parseInt(localStorage.getItem('stock_avgDisplayMode') || '0'))
const toggleAvgDisplayMode = () => {
  avgDisplayMode.value = (avgDisplayMode.value + 1) % 3
  localStorage.setItem('stock_avgDisplayMode', String(avgDisplayMode.value))
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
const formatName = (name: string | undefined): string => {
  if (!name) return '--'
  if (name.length > 4) {
    return name.slice(0, 4) + '...'
  }
  return name
}

// 复制盈亏到剪贴板
const copyPnl = (type: 'daily' | 'total') => {
  if (isCensored.value) return
  const value = type === 'daily' ? totalDailyPnl.value : totalHoldingPnl.value
  const text = `${value > 0 ? '+' : ''}${value.toFixed(1)}`
  const label = type === 'daily' ? t('dailyPnlCopied') : t('totalPnlCopied')
  navigator.clipboard.writeText(text).then(() => {
    toastRef.value?.show(label, 'success')
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

// 加载缓存的行情数据
const loadCachedQuotes = () => {
  const saved = localStorage.getItem('cached_quotes')
  const savedDate = localStorage.getItem('cached_quotes_date')
  const today = getTodayStr()

  // 如果缓存不是今天的，清除缓存（确保使用新的昨收价）
  if (savedDate !== today) {
    localStorage.removeItem('cached_quotes')
    localStorage.removeItem('cached_quotes_date')
    return
  }

  if (saved) {
    try {
      quotes.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse cached quotes', e)
    }
  }
}

// 缓存行情数据
const cacheQuotes = () => {
  const today = getTodayStr()
  localStorage.setItem('cached_quotes', JSON.stringify(quotes.value))
  localStorage.setItem('cached_quotes_date', today)
}

// 获取今天日期字符串 (YYYY-MM-DD)
const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 清零过期的当日已实现盈亏（跨日自动清零）
const resetDailyRealizedPnl = () => {
  const today = getTodayStr()
  let changed = false
  stocks.value.forEach((stock) => {
    if (stock.dailyDate !== today && stock.dailyRealizedPnl) {
      stock.dailyRealizedPnl = 0
      stock.dailyDate = today
      changed = true
    }
  })
  if (changed) saveStocks()
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
    if (code.startsWith('6') || code.startsWith('5') || code.startsWith('7') || code.startsWith('9')) {
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
    alert(t('stockExists'))
    return
  }

  // 先获取行情以提供默认价格
  await fetchQuotesByCode(code)
  const quote = quotes.value[code]
  const defaultPrice = quote?.currentPrice || 0

  const res = await modalRef.value?.open('add', t('addPosition'), quote?.name || code, {
    price: defaultPrice,
    amount: 1
  })

  if (res?.confirmed) {
    const today = getTodayStr()
    stocks.value.push({
      code,
      cost: res.price,
      amount: res.amount,
      buyDate: res.isTodayNewPosition ? today : undefined,
      isNew: false
    })
    saveStocks()
    inputCode.value = ''
    fetchQuotes(true)
    toastRef.value?.show(t('stockAdded'), 'success')
    nextTick(() => stockInputRef.value?.focus())
  }
}

// 单独获取行情（辅助addStock）
const fetchQuotesByCode = (code: string): Promise<void> => {
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
      const dataStr = (window as unknown as Record<string, unknown>)[varName] as string | undefined
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
      t('deleteStock'),
      t('deleteConfirm', { count: selectedCodes.value.length })
    )
    if (confirmed) {
      stocks.value = stocks.value.filter((s) => !selectedCodes.value.includes(s.code))
      selectedCodes.value = []
      saveStocks()
      toastRef.value?.show(t('selectedRemoved'), 'info')
    }
  } else {
    // 清空所有股票（原逻辑）
    if (stocks.value.length === 0) return
    const confirmed = await confirmRef.value?.open(t('clearList'), t('clearConfirm'))
    if (confirmed) {
      stocks.value = []
      saveStocks()
      toastRef.value?.show(t('allCleared'), 'warn')
    }
  }
}

// 调仓逻辑
const adjustStockFlow = async (stock: StockItem) => {
  const quote = quotes.value[stock.code]
  let lastPrice = quote?.currentPrice || stock.cost || 0

  // 循环：清仓取消后重新显示调仓确认框
  while (true) {
    const res = await modalRef.value?.open('transaction', t('adjustPosition'), quote?.name || stock.code, {
      price: lastPrice,
      amount: 0,
      currentAmount: stock.amount
    })

    if (!res?.confirmed) return

    // 买入/卖出：需要二次确认
    if (!res.clearPosition) {
      lastPrice = res.price
      const stockName = quote?.name || stock.code
      const directionText = res.amount > 0 ? t('tradeBuy') : t('tradeSell')
      const confirmMsg = `${directionText} ${stockName}，${t('tradePrice')} ${res.price.toFixed(2)}，${t('deltaLots')} ${Math.abs(res.amount)}？`
      const confirmed = await confirmRef.value?.open(t('adjustPosition'), confirmMsg)
      if (!confirmed) continue
    }

    // 清仓：需要二次确认
    if (res.clearPosition) {
      lastPrice = res.price // 保留用户修改过的价格
      const stockName = quote?.name || stock.code
      const confirmMsg = t('clearPositionConfirm', {
        price: res.price.toFixed(2),
        name: stockName,
        amount: stock.amount
      })
      const confirmed = await confirmRef.value?.open(t('clearPositionTitle'), confirmMsg)
      if (!confirmed) continue // 取消清仓 → 重新显示调仓确认框
    }

    const delta = res.amount
    const tradePrice = res.price
    const isTodayTrade = res.isTodayTrade !== false // 默认 true
    if (delta === 0) return

    const newAmount = stock.amount + delta
    if (newAmount < 0) {
      toastRef.value?.show(t('amountCannotBeNegative'), 'fail')
      return
    }

    const yesterdayClose = quote?.yesterdayClose || 0
    const today = getTodayStr()

    // 确保 dailyRealizedPnl 属于今天
    if (stock.dailyDate !== today) {
      stock.dailyRealizedPnl = 0
      stock.dailyDate = today
    }

    if (delta > 0) {
      // 加仓：计算加权平均成本
      const oldTotalVal = stock.amount * stock.cost
      const addTotalVal = delta * tradePrice
      stock.cost = Number(((oldTotalVal + addTotalVal) / newAmount).toFixed(3))

      // 当日盈亏修正：仅当日操作时才修正
      if (isTodayTrade && yesterdayClose > 0) {
        stock.dailyRealizedPnl = (stock.dailyRealizedPnl || 0) - (tradePrice - yesterdayClose) * delta * 100
      }
    } else {
      // 减仓：将卖出部分的盈亏计入已实现盈亏（永久）
      const soldLots = Math.abs(delta)
      const realized = (tradePrice - stock.cost) * soldLots * 100
      stock.realizedPnl = (stock.realizedPnl || 0) + realized

      // 当日盈亏修正：仅当日操作时才修正
      if (isTodayTrade && yesterdayClose > 0) {
        stock.dailyRealizedPnl =
          (stock.dailyRealizedPnl || 0) + (tradePrice - yesterdayClose) * soldLots * 100
      }
    }

    stock.amount = newAmount
    saveStocks()
    toastRef.value?.show(t('positionUpdated'), 'success')
    return // 操作完成，退出循环
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

          // 检查价格提醒
          checkPriceAlerts(stock, currentPrice)
        }
      }
    })
    // 缓存行情数据
    cacheQuotes()
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

// 计算某只股票的当日盈亏
// 如果今天买入：(现价 - 买入价) × 股数
// 如果之前买入：(现价 - 昨收) × 股数 + 当日已实现盈亏修正
const calculateDailyPnl = (stock: StockItem): number => {
  const quote = quotes.value[stock.code]
  if (!quote) return 0

  const today = getTodayStr()

  // 如果今天买入，当日盈亏 = (现价 - 买入价) × 股数
  if (stock.buyDate === today) {
    return (quote.currentPrice - stock.cost) * stock.amount * 100
  }

  // 如果之前买入，当日盈亏 = (现价 - 昨收) × 股数 + 当日已实现盈亏修正
  const dailyCorrection = (stock.dailyDate === today ? stock.dailyRealizedPnl : 0) || 0
  return (quote.currentPrice - quote.yesterdayClose) * stock.amount * 100 + dailyCorrection
}

// 计算某只股票的持仓总盈亏 = (现价 - 均摊成本) * 股数 + 已实现盈亏
// 只有在填写了成本价时才有效
const calculateTotalPnl = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote || stock.cost <= 0) return null
  const floatingPnl = (quote.currentPrice - stock.cost) * stock.amount * 100
  const realizedPnl = stock.realizedPnl || 0
  return floatingPnl + realizedPnl
}

// 计算某只股票的持仓市值 = 现价 * 股数 * 100
const calculateMarketValue = (stock: StockItem): number => {
  const quote = quotes.value[stock.code]
  if (!quote) return 0
  return quote.currentPrice * stock.amount * 100
}

// 计算某只股票的当日盈亏比(%)
// 当日盈亏额 / 昨日市值(或买入市值) × 100
const calculateDailyPnlPercent = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote || stock.amount <= 0) return null

  const today = getTodayStr()
  const dailyPnl = calculateDailyPnl(stock)

  // 如果今天买入，基准为买入成本市值
  if (stock.buyDate === today) {
    const costValue = stock.cost * stock.amount * 100
    if (costValue <= 0) return null
    return (dailyPnl / costValue) * 100
  }

  // 如果之前买入，基准为昨收市值
  const yesterdayValue = quote.yesterdayClose * stock.amount * 100
  if (yesterdayValue <= 0) return null
  return (dailyPnl / yesterdayValue) * 100
}

// 计算某只股票的总盈亏比(%)
// 总盈亏额 / 总投入成本 × 100
const calculateTotalPnlPercent = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote || stock.cost <= 0) return null

  const totalPnl = calculateTotalPnl(stock)
  if (totalPnl === null) return null

  const totalCost = stock.cost * stock.amount * 100
  if (totalCost <= 0) return null
  return (totalPnl / totalCost) * 100
}

// 总当日盈亏额
const totalDailyPnl = computed(() => {
  return stocks.value.reduce((total, stock) => total + calculateDailyPnl(stock), 0)
})

// 格式化盈亏比显示
const formatPnlPercent = (value: number | null): string => {
  if (value === null) return '--'
  return (value > 0 ? '+' : '') + value.toFixed(2) + '%'
}

// 总持仓盈亏额
const totalHoldingPnl = computed(() => {
  return stocks.value.reduce((total, stock) => {
    const pnl = calculateTotalPnl(stock)
    return total + (pnl || 0)
  }, 0)
})

// 价格提醒相关
// 设置价格提醒
const setPriceAlert = async (stock: StockItem) => {
  const quote = quotes.value[stock.code]
  const currentPrice = quote?.currentPrice || 0

  // 查找已有的提醒，涨优先
  const upAlert = stock.priceAlerts?.find((a) => a.direction === 'up')
  const downAlert = stock.priceAlerts?.find((a) => a.direction === 'down')
  const existingAlert = upAlert || downAlert

  const res = await modalRef.value?.open(
    'alert',
    t('setPriceAlert'),
    `${quote?.name || stock.code} (${t('currentPrice')}: ${currentPrice.toFixed(2)})`,
    {
      price: existingAlert?.targetPrice || currentPrice,
      direction: existingAlert?.direction || 'up',
      isUp: quote?.changeAmount !== undefined ? quote.changeAmount >= 0 : undefined
    }
  )

  if (res?.confirmed) {
    // 清除当前选中方向的提醒
    if (res.clear) {
      const direction = res.direction
      if (stock.priceAlerts) {
        stock.priceAlerts = stock.priceAlerts.filter((a) => a.direction !== direction)
        if (stock.priceAlerts.length === 0) {
          stock.priceAlerts = undefined
        }
      }
      saveStocks()
      // 根据方向显示不同的提示
      const clearMsg = direction === 'up' ? t('priceAlertUpCleared') : t('priceAlertDownCleared')
      toastRef.value?.show(clearMsg, 'info')
      return
    }

    const targetPrice = res.price
    const direction = res.direction

    // 验证价格
    if (direction === 'up' && targetPrice <= currentPrice) {
      toastRef.value?.show(t('priceAlertUpError'), 'fail')
      return
    }
    if (direction === 'down' && targetPrice >= currentPrice) {
      toastRef.value?.show(t('priceAlertDownError'), 'fail')
      return
    }

    if (!stock.priceAlerts) {
      stock.priceAlerts = []
    }

    // 移除同方向的旧提醒，保留另一个方向的提醒
    stock.priceAlerts = stock.priceAlerts.filter((a) => a.direction !== direction)

    // 添加新提醒
    stock.priceAlerts.push({
      targetPrice,
      direction,
      triggered: false
    })
    saveStocks()
    toastRef.value?.show(t('priceAlertSet'), 'success')
  }
}

// 检查价格提醒
const checkPriceAlerts = (stock: StockItem, currentPrice: number) => {
  if (!stock.priceAlerts || stock.priceAlerts.length === 0) return

  stock.priceAlerts.forEach((alert) => {
    if (alert.triggered) return

    let shouldTrigger = false
    if (alert.direction === 'up' && currentPrice >= alert.targetPrice) {
      shouldTrigger = true
    } else if (alert.direction === 'down' && currentPrice <= alert.targetPrice) {
      shouldTrigger = true
    }

    if (shouldTrigger) {
      alert.triggered = true
      const quote = quotes.value[stock.code]
      const direction = alert.direction === 'up' ? '↑' : '↓'
      const message = `${quote?.name || stock.code} ${direction} ${alert.targetPrice.toFixed(2)}`

      // 显示列表中的提示
      toastRef.value?.show(message, 'alert')

      // 发送系统通知
      window.electron.ipcRenderer.send('show-notification', {
        title: t('priceAlertTitle'),
        body: message
      })
    }
  })
}

// 格式化价格提醒显示
const formatPriceAlerts = (stock: StockItem): string => {
  if (!stock.priceAlerts || stock.priceAlerts.length === 0) return '--'
  return stock.priceAlerts
    .map((a) => {
      const arrow = a.direction === 'up' ? '↑' : '↓'
      const triggered = a.triggered ? '✓' : ''
      return `${arrow}${a.targetPrice.toFixed(2)}${triggered}`
    })
    .join(' ')
}

onMounted(async () => {
  loadStocks()
  resetDailyRealizedPnl() // 跨日清零当日已实现盈亏

  // 检测更新状态
  checkPendingUpdate()

  // 加载显示模块导航配置
  const moduleSaved = localStorage.getItem('show_modules')
  if (moduleSaved !== null) {
    try {
      const parsed = JSON.parse(moduleSaved)
      if (Array.isArray(parsed)) {
        visibleModules.value = parsed
      } else if (typeof parsed === 'boolean') {
        visibleModules.value = parsed ? ['stock', 'gold', 'fund'] : []
      }
    } catch {
      /* ignore */
    }
  } else {
    const fundSaved = localStorage.getItem('show_fund')
    if (fundSaved !== null) {
      const parsed = JSON.parse(fundSaved)
      visibleModules.value = parsed ? ['stock', 'gold', 'fund'] : []
    }
  }
  loadCachedQuotes() // 先加载缓存的行情数据，避免空白
  loadSortState() // 加载排序状态

  // 加载拆分列配置（兼容旧布尔值格式）
  const splitSaved = localStorage.getItem('stock_splitColumns')
  if (splitSaved !== null) {
    try {
      const parsed = JSON.parse(splitSaved)
      if (Array.isArray(parsed)) {
        splitColumns.value = parsed
      } else if (parsed === true) {
        splitColumns.value = ['chg', 'pnl', 'val']
      }
    } catch {
      if (splitSaved === 'true') {
        splitColumns.value = ['chg', 'pnl', 'val']
      }
    }
  }

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
  router.push('/ball')
}

const goToSetting = (): void => {
  router.push('/setting')
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="main-list-container">
    <DragHandle>
      <template #left>
        <button class="nav-btn" :title="t('backToBall')" @click="goBack">
          <img src="../assets/electron.svg" class="nav-icon" alt="ball" />
        </button>
      </template>
      <template #right>
        <button class="nav-btn setting-btn" :title="t('goToSetting')" @click="goToSetting">
          ⚙️<span v-if="hasPendingUpdate" class="update-dot"></span>
        </button>
      </template>
    </DragHandle>
    <div class="table-container">
      <table class="stock-table">
        <thead>
          <tr>
            <th :title="nameDisplayMode === 0 ? t('name') : t('stockCode')" class="clickable-th">
              <span class="th-text" @click="toggleNameDisplayMode">{{
                nameDisplayMode === 0 ? t('thName') : t('thCode')
              }}</span>
              <span class="sort-icon" @click="toggleSort('name')">{{
                sortColumn === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th
              :title="
                splitChg
                  ? t('currentPrice')
                  : priceDisplayMode === 0
                    ? t('currentPrice')
                    : priceDisplayMode === 1
                      ? t('change')
                      : t('priceAndChange')
              "
              class="clickable-th"
            >
              <span
                :class="splitChg ? 'th-text-static' : 'th-text'"
                @click="splitChg ? undefined : togglePriceDisplayMode()"
                >{{
                  splitChg
                    ? t('thPrice')
                    : priceDisplayMode === 0
                      ? t('thPrice')
                      : priceDisplayMode === 1
                        ? t('thChg')
                        : t('thPriceChg')
                }}</span
              >
              <span
                class="sort-icon"
                @click="toggleSort(splitChg ? 'curPrice' : priceDisplayMode === 1 ? 'change' : 'curPrice')"
                >{{
                  sortColumn === 'curPrice' || sortColumn === 'change'
                    ? sortOrder === 'asc'
                      ? '↑'
                      : '↓'
                    : '↕'
                }}</span
              >
            </th>
            <th v-if="splitChg" :title="t('change')" class="clickable-th">
              <span class="th-text-static">{{ t('thChg') }}</span>
              <span class="sort-icon" @click="toggleSort('change')">{{
                sortColumn === 'change' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th
              :title="
                dpnlDisplayMode === 0
                  ? t('dailyPnl')
                  : dpnlDisplayMode === 1
                    ? t('dailyPnlPercent')
                    : t('dailyPnl') + ' / ' + t('dailyPnlPercent')
              "
              class="clickable-th"
            >
              <span class="th-text" @click="toggleDpnlDisplayMode">{{
                dpnlDisplayMode === 0 ? t('thDPnl') : dpnlDisplayMode === 1 ? t('thDPnlPct') : t('thDPnlBoth')
              }}</span>
              <span class="sort-icon" @click="toggleSort('dpnl')">{{
                sortColumn === 'dpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th
              :title="
                splitPnl
                  ? t('totalPnl')
                  : tpnlDisplayMode === 0
                    ? t('totalPnl')
                    : tpnlDisplayMode === 1
                      ? t('totalPnlPercent')
                      : t('totalPnl') + ' / ' + t('totalPnlPercent')
              "
              class="clickable-th"
            >
              <span
                :class="splitPnl ? 'th-text-static' : 'th-text'"
                @click="splitPnl ? undefined : toggleTpnlDisplayMode()"
                >{{
                  splitPnl
                    ? t('thTPnl')
                    : tpnlDisplayMode === 0
                      ? t('thTPnl')
                      : tpnlDisplayMode === 1
                        ? t('thTPnlPct')
                        : t('thTPnlBoth')
                }}</span
              >
              <span class="sort-icon" @click="toggleSort('tpnl')">{{
                sortColumn === 'tpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th v-if="splitPnl" :title="t('totalPnlPercent')" class="clickable-th">
              <span class="th-text-static">{{ t('thTPnlPct') }}</span>
              <span class="sort-icon" @click="toggleSort('tpnlPct')">{{
                sortColumn === 'tpnlPct' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th
              :title="
                splitVal
                  ? t('avgBuyPrice')
                  : avgDisplayMode === 0
                    ? t('avgBuyPrice')
                    : avgDisplayMode === 1
                      ? t('marketValue')
                      : t('avgBuyPrice') + ' / ' + t('marketValue')
              "
              class="clickable-th"
            >
              <span
                :class="splitVal ? 'th-text-static' : 'th-text'"
                @click="splitVal ? undefined : toggleAvgDisplayMode()"
                >{{
                  splitVal
                    ? t('thAvg')
                    : avgDisplayMode === 0
                      ? t('thAvg')
                      : avgDisplayMode === 1
                        ? t('thVal')
                        : t('thAvgVal')
                }}</span
              >
              <span class="sort-icon" @click="toggleSort('avg')">{{
                sortColumn === 'avg' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th v-if="splitVal" :title="t('marketValue')" class="clickable-th">
              <span class="th-text-static">{{ t('thVal') }}</span>
              <span class="sort-icon" @click="toggleSort('marketVal')">{{
                sortColumn === 'marketVal' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span>
            </th>
            <th :title="qtyDisplayMode === 0 ? t('amount') : t('priceAlert')" class="clickable-th">
              <span class="th-text" @click="toggleQtyDisplayMode">{{
                qtyDisplayMode === 0 ? t('thQty') : t('thAlert')
              }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stock in displayStocks"
            :key="stock.code"
            :class="{ 'row-selected': selectedCodes.includes(stock.code) }"
            @click="toggleRowSelection(stock.code)"
          >
            <td
              :class="['name-cell', (quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
              :title="quotes[stock.code]?.name || stock.code"
              @click.stop="toggleNameDisplay(stock.code)"
            >
              <template v-if="!isCensored">
                <div class="clickable-tag">
                  <span
                    v-if="
                      (nameDisplayMode === 0 && !shownCodes.includes(stock.code)) ||
                      (nameDisplayMode === 1 && shownCodes.includes(stock.code))
                    "
                    >{{ formatName(quotes[stock.code]?.name) }}</span
                  >
                  <span v-else>{{ stock.code }}</span>
                </div>
              </template>
              <template v-else>
                <div class="clickable-tag">❇❇</div>
              </template>
            </td>
            <td :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
              <template v-if="!isCensored">
                <template v-if="splitChg || priceDisplayMode === 0">
                  {{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}
                </template>
                <template v-else-if="priceDisplayMode === 1">
                  <span v-if="quotes[stock.code]">
                    {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
                    }}{{ quotes[stock.code].changePercent }}%
                  </span>
                  <span v-else>--</span>
                </template>
                <template v-else>
                  <div class="price-dual">
                    <span class="price-main">{{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}</span>
                    <span v-if="quotes[stock.code]" class="price-chg">
                      {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
                      }}{{ quotes[stock.code].changePercent }}%
                    </span>
                  </div>
                </template>
              </template>
              <span v-else>❇❇</span>
            </td>
            <td
              v-if="splitChg"
              class="chg-cell"
              :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
            >
              <template v-if="!isCensored">
                <span v-if="quotes[stock.code]">
                  {{ quotes[stock.code].changeAmount > 0 ? '+' : '' }}{{ quotes[stock.code].changePercent }}%
                </span>
                <span v-else>--</span>
              </template>
              <span v-else>❇❇</span>
            </td>
            <td :class="calculateDailyPnl(stock) >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">
                <template v-if="dpnlDisplayMode === 0">{{ calculateDailyPnl(stock).toFixed(1) }}</template>
                <template v-else-if="dpnlDisplayMode === 1">
                  {{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}
                </template>
                <template v-else>
                  <div class="price-dual">
                    <span class="price-main">{{ calculateDailyPnl(stock).toFixed(1) }}</span>
                    <span class="price-chg">{{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}</span>
                  </div>
                </template>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td class="tpnl-cell" :class="(calculateTotalPnl(stock) || 0) >= 0 ? 'red' : 'green'">
              <span v-if="!isCensored">
                <template v-if="splitPnl || tpnlDisplayMode === 0">
                  {{ calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(1) : '--' }}
                </template>
                <template v-else-if="tpnlDisplayMode === 1">
                  {{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}
                </template>
                <template v-else>
                  <div class="price-dual">
                    <span class="price-main">{{
                      calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(1) : '--'
                    }}</span>
                    <span class="price-chg">{{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}</span>
                  </div>
                </template>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td
              v-if="splitPnl"
              class="tpnl-cell"
              :class="(calculateTotalPnlPercent(stock) || 0) >= 0 ? 'red' : 'green'"
            >
              <span v-if="!isCensored">
                {{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}
              </span>
              <span v-else>❇❇</span>
            </td>
            <td>
              <span v-if="!isCensored">
                <template v-if="splitVal || avgDisplayMode === 0">
                  {{ stock.cost?.toFixed(3) }}
                </template>
                <template v-else-if="avgDisplayMode === 1">
                  {{
                    calculateMarketValue(stock).toLocaleString(undefined, {
                      maximumFractionDigits: 0
                    })
                  }}
                </template>
                <template v-else>
                  <div class="price-dual">
                    <span class="price-main">{{ stock.cost?.toFixed(3) }}</span>
                    <span class="price-chg">{{
                      calculateMarketValue(stock).toLocaleString(undefined, {
                        maximumFractionDigits: 0
                      })
                    }}</span>
                  </div>
                </template>
              </span>
              <span v-else>❇❇</span>
            </td>
            <td v-if="splitVal">
              <span v-if="!isCensored">
                {{
                  calculateMarketValue(stock).toLocaleString(undefined, {
                    maximumFractionDigits: 0
                  })
                }}
              </span>
              <span v-else>❇❇</span>
            </td>
            <td
              class="clickable-cell"
              :title="qtyDisplayMode === 0 ? t('clickToAdjust') : t('setPriceAlert')"
              @click.stop="qtyDisplayMode === 0 ? adjustStockFlow(stock) : setPriceAlert(stock)"
            >
              <div
                v-if="!isCensored"
                class="clickable-tag"
                :class="{ 'alert-active': qtyDisplayMode === 1 && stock.priceAlerts?.length }"
              >
                <template v-if="qtyDisplayMode === 0">
                  {{ stock.amount }}
                </template>
                <template v-else>
                  <span v-if="stock.priceAlerts?.length" class="alert-text">
                    {{ formatPriceAlerts(stock) }}
                  </span>
                  <span v-else class="alert-placeholder">➕</span>
                </template>
              </div>
              <span v-else>❇❇</span>
            </td>
          </tr>
          <tr v-if="stocks.length === 0">
            <td :colspan="6 + (splitChg ? 1 : 0) + (splitPnl ? 1 : 0) + (splitVal ? 1 : 0)" class="empty-row">
              {{ t('noStocks') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-section">
      <div class="bottom-actions">
        <button
          v-if="visibleModules.includes('fund')"
          class="mode-btn fund-btn"
          :title="t('switchToFund')"
          @click="goToFund"
        >
          <span class="mode-icon">💹</span>
        </button>
        <button
          v-if="visibleModules.includes('gold')"
          class="mode-btn"
          :title="t('switchToGold')"
          @click="goToGold"
        >
          <span class="mode-icon">🟨</span>
        </button>
        <div class="input-group">
          <input
            ref="stockInputRef"
            v-model="inputCode"
            :placeholder="t('code')"
            class="stock-input"
            @keyup.enter="addStock"
          />
          <button class="add-btn" @click="addStock"><span class="add-icon">➕</span></button>
        </div>
      </div>
      <div class="summary-pnl">
        <span
          :class="['visible-summary', totalDailyPnl > 0 ? 'red' : totalDailyPnl < 0 ? 'green' : 'gray']"
          :title="t('dailyPnlTotal')"
          @click.stop="copyPnl('daily')"
        >
          <span class="pnl-label">{{ t('labelD') }}</span>
          <span v-if="!isCensored">{{ totalDailyPnl > 0 ? '+' : '' }}{{ totalDailyPnl.toFixed(1) }}</span>
          <span v-else>❇❇</span>
        </span>
        <span
          :class="['visible-summary', totalHoldingPnl > 0 ? 'red' : totalHoldingPnl < 0 ? 'green' : 'gray']"
          :title="t('holdingPnlTotal')"
          @click.stop="copyPnl('total')"
        >
          <span class="pnl-label">{{ t('labelH') }}</span>
          <span v-if="!isCensored">{{ totalHoldingPnl > 0 ? '+' : '' }}{{ totalHoldingPnl.toFixed(1) }}</span>
          <span v-else>❇❇</span>
        </span>
        <span class="lock-icon" :title="t('toggleHide')" @click="toggleCensor">{{
          isCensored ? '🔒' : '🔓'
        }}</span>
      </div>
      <button
        v-if="stocks.length > 0"
        class="clear-all-btn"
        :title="selectedCodes.length > 0 ? t('deleteSelected') : t('clearAll')"
        @click="handleDeleteAction"
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
  padding: 4px 10px 10px 10px; /* Top padding 0 for drag handle */
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

.setting-btn {
  position: relative;
}

.update-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  background-color: #2ecc71;
  border-radius: 50%;
  animation: dotPulse 2s ease-in-out infinite;
}

@keyframes dotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.3);
  }
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

.bottom-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-btn {
  background-color: rgba(255, 215, 0, 0.1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.mode-btn:hover {
  background-color: rgba(255, 215, 0, 0.3);
}

.mode-btn:active {
  transform: scale(0.95);
}

.fund-btn {
  background-color: rgba(46, 204, 113, 0.1);
}
.fund-btn:hover {
  background-color: rgba(46, 204, 113, 0.3);
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

.stock-input {
  padding: 4px 2px 4px 6px;
  font-size: 12px;
  border-radius: 6px 0 0 6px;
  border: 1px solid #3a3d4a; /* Fainter border */
  border-right: none;
  background-color: #2f3241;
  color: white;
  outline: none;
  width: 74px;
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
  background-color: rgba(46, 204, 113, 0.2);
  border-color: rgba(46, 204, 113, 0.2);
}

.add-btn:active {
  transform: scale(0.95);
}

.add-icon {
  font-size: 12px;
  opacity: 0.8;
  display: inline-block;
  transition:
    opacity 0.25s,
    transform 0.25s,
    text-shadow 0.25s;
}

.add-btn:hover .add-icon {
  opacity: 1;
  transform: scale(1.2);
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.2);
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
}

.stock-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  border-bottom: 1px solid #3a3d4a;
}

.stock-table th,
.stock-table td {
  padding: 1px 4px; /* Further reduced padding for compact look */
}

.stock-table th {
  border-bottom: 1px solid #3a3d4a;
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

/* Price/Chg% 双行模式 */
.price-dual {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.price-main {
  font-size: 13px;
}

.price-chg {
  font-size: 9px;
  opacity: 0.75;
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
  margin-left: auto;
  cursor: pointer;
}

.lock-icon:hover {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.clickable-th {
  cursor: default;
  user-select: none;
  white-space: nowrap;
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

.clickable-th:hover {
  color: #ccc;
}

.th-text {
  cursor: pointer;
  transition:
    color 0.2s,
    text-decoration 0.2s;
  border-bottom: 1px dashed transparent;
}

.th-text:hover {
  color: #fff !important;
  border-bottom-color: rgba(255, 255, 255, 0.5);
}

.th-text-static {
  cursor: default;
}

.sort-icon {
  font-size: 10px;
  opacity: 0.4;
  margin-left: 2px;
  cursor: pointer;
  display: inline-block;
  width: 10px;
  color: var(--ev-c-green);
  transition:
    opacity 0.2s,
    transform 0.2s,
    color 0.2s;
  vertical-align: middle;
}

.sort-icon:hover {
  opacity: 1;
  transform: scale(1.5);
  color: #fff;
}

.clickable-th:hover .sort-icon {
  opacity: 0.7;
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
}

.visible-summary:hover {
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  cursor: pointer;
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

/* Adjust font sizes for specific columns: 2 (Price), 3 (D.PnL), 4 (T.PnL) */
.stock-table td:nth-child(2),
.stock-table td:nth-child(3),
.stock-table td:nth-child(4) {
  font-size: 14px;
}

/* 涨跌幅独立列样式 */
.chg-cell {
  text-align: center;
  font-size: 14px !important;
}

/* T.PnL 列在拆分涨跌幅时变为第5列，需要保持字体 */
.tpnl-cell {
  font-size: 14px !important;
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

.stock-table tbody tr:nth-child(even) {
  background-color: rgba(255, 255, 255, 0.03);
}

.stock-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.row-selected {
  background-color: rgba(46, 204, 113, 0.1) !important;
  border-radius: 6px;
}

.clickable-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 18px;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  min-width: 22px;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.clickable-tag:hover {
  cursor: pointer;
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.clickable-cell .clickable-tag {
  /* 股数 tag 样式维持绿色 */
  color: var(--ev-c-green);
}

/* 价格提醒样式 - 黄色系 */
.alert-active {
  color: #f1c40f !important;
  background-color: rgba(241, 196, 15, 0.15);
  border-color: rgba(241, 196, 15, 0.3);
}

.alert-text {
  font-size: 10px;
}

.alert-placeholder {
  font-size: 10px;
  font-weight: bold;
  opacity: 0.8;
  color: #f1c40f;
}

.clickable-cell .alert-active:hover {
  background-color: rgba(241, 196, 15, 0.25);
  border-color: rgba(241, 196, 15, 0.5);
  color: #ffd700 !important;
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
