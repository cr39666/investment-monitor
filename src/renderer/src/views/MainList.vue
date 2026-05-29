<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import ModuleNavBar from '../components/ModuleNavBar.vue'
import Modal from '../components/Modal.vue'
import Confirm from '../components/Confirm.vue'
import Toast from '../components/Toast.vue'
import { loadStockColumnOrder, type StockColumnKey } from '../utils/columnOrder'

const { t } = useI18n()

// 股票数据模型
interface StockItem {
  code: string // 比如 sh600519
  cost: number // 成本价
  amount: number // 持仓手数 (1手=100股)
  buyDate?: string // 买入日期 (YYYY-MM-DD)
  isNew?: boolean // 是否为新添加（用于初始化默认成本）
  priceAlerts?: PriceAlert[] // 价格提醒列表
  realizedPnl?: number // 已实现盈亏（减仓/清仓时累计，永久）
  // 当前剩余持仓的精确成本总额（含买入手续费，单位元）：总盈亏金额的成本基准
  positionCostBasis?: number
  // 累计买入成本（含买入手续费，单位元）：建仓初始化、加仓累加、减仓不动；总盈亏比分母
  totalCostBasis?: number
  dailyRealizedPnl?: number // 当日已实现盈亏（调仓时累计，每日清零）
  dailyDate?: string // 记录 dailyRealizedPnl 对应的日期，用于自动清零
  // 当日已实现部分对应的分母基准；历史仓用昨收市值，当日新建仓用对应成本基准；每日清零
  // 仅减仓/清仓时累计；这样清仓后 amount=0 也能算出正确的日盈亏比
  dailyBasis?: number
}

interface WatchStockItem {
  code: string
}

type StockPageMode = 'holding' | 'watch'

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
  quoteDate?: string // 行情写入时的本地日期(YYYY-MM-DD)，用于跨日识别陈旧昨收
}

const inputCode = ref('')
const stocks = ref<StockItem[]>([])
const watchStocks = ref<WatchStockItem[]>([])
const stockPageMode = ref<StockPageMode>(
  (localStorage.getItem('stock_pageMode') as StockPageMode) || 'holding'
)
// 以 code 为 key 保存行情数据
const quotes = ref<Record<string, StockQuote>>({})
let timer: ReturnType<typeof setTimeout> | null = null

const containerRef = ref<HTMLElement | null>(null)
const stockInputRef = ref<HTMLInputElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// 拆分列（涨跌幅/日盈比/总盈比/市值）— 多选数组
const splitColumns = ref<string[]>([])
const splitChg = computed(() => splitColumns.value.includes('chg'))
const splitDpnl = computed(() => splitColumns.value.includes('dpnl'))
const splitPnl = computed(() => splitColumns.value.includes('pnl'))
const splitVal = computed(() => splitColumns.value.includes('val'))

// 自定义列顺序（持久化到 localStorage，由设置页拖拽调整）
const columnOrder = ref<StockColumnKey[]>(loadStockColumnOrder())
// 同时刷新拆分列（弹窗内可同时调整列顺序和拆分列）
const reloadSplitColumns = () => {
  const splitSaved = localStorage.getItem('stock_splitColumns')
  if (splitSaved === null) {
    splitColumns.value = []
    return
  }
  try {
    const parsed = JSON.parse(splitSaved)
    if (Array.isArray(parsed)) splitColumns.value = parsed
    else if (parsed === true) splitColumns.value = ['chg', 'pnl', 'val']
    else splitColumns.value = []
  } catch {
    splitColumns.value = splitSaved === 'true' ? ['chg', 'pnl', 'val'] : []
  }
}
const onColumnOrderChanged = () => {
  columnOrder.value = loadStockColumnOrder()
  reloadSplitColumns()
}

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
            dpnlDisplayMode.value === 1
              ? (calculateDailyPnlPercent(a) ?? -999999999)
              : (calculateDailyPnl(a) ?? -999999999)
          valB =
            dpnlDisplayMode.value === 1
              ? (calculateDailyPnlPercent(b) ?? -999999999)
              : (calculateDailyPnl(b) ?? -999999999)
          break
        case 'dpnlPct':
          valA = calculateDailyPnlPercent(a) ?? -999999999
          valB = calculateDailyPnlPercent(b) ?? -999999999
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

const displayWatchStocks = computed(() => {
  return [...watchStocks.value].sort((a, b) => {
    const nameA = quotes.value[a.code]?.name || a.code
    const nameB = quotes.value[b.code]?.name || b.code
    return nameA.localeCompare(nameB, 'zh-CN')
  })
})

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

// Price 列展示模式：0=现价, 1=涨跌幅, 2=现价/涨跌幅
const priceDisplayMode = ref(parseInt(localStorage.getItem('stock_priceDisplayMode') || '0'))
const togglePriceDisplayMode = () => {
  priceDisplayMode.value = (priceDisplayMode.value + 1) % 3
  localStorage.setItem('stock_priceDisplayMode', String(priceDisplayMode.value))
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

// 右下角合计盈亏展示模式：0=当日合计(D), 1=持仓合计(H)
const summaryPnlMode = ref(parseInt(localStorage.getItem('stock_summaryPnlMode') || '0'))
const toggleSummaryPnlMode = () => {
  summaryPnlMode.value = (summaryPnlMode.value + 1) % 2
  localStorage.setItem('stock_summaryPnlMode', String(summaryPnlMode.value))
}

// 选中的行代码（多选）
const selectedCodes = ref<string[]>([])
const selectedWatchCodes = ref<string[]>([])
const toggleRowSelection = (code: string) => {
  const selected = stockPageMode.value === 'holding' ? selectedCodes : selectedWatchCodes
  const index = selected.value.indexOf(code)
  if (index > -1) {
    selected.value.splice(index, 1)
  } else {
    selected.value.push(code)
  }
}

const toggleStockPageMode = () => {
  stockPageMode.value = stockPageMode.value === 'holding' ? 'watch' : 'holding'
  localStorage.setItem('stock_pageMode', stockPageMode.value)
  selectedCodes.value = []
  selectedWatchCodes.value = []
  nextTick(() => stockInputRef.value?.focus())
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

// 加载本地存储
const loadStocks = () => {
  const saved = localStorage.getItem('my_stocks')
  if (saved) {
    try {
      stocks.value = JSON.parse(saved)
      // 兼容老数据：缺失成本基准时按"当前持仓均摊成本 × 手数"近似初始化
      let changed = false
      stocks.value.forEach((s) => {
        const currentBasis = s.cost > 0 && s.amount > 0 ? s.cost * s.amount * 100 : 0
        if (s.positionCostBasis === undefined && currentBasis > 0) {
          s.positionCostBasis = currentBasis
          changed = true
        }
        if (s.totalCostBasis === undefined && currentBasis > 0) {
          s.totalCostBasis = currentBasis
          changed = true
        }
      })
      if (changed) saveStocks()
    } catch (e) {
      console.error('Failed to parse saved stocks', e)
    }
  }
}

const loadWatchStocks = () => {
  const saved = localStorage.getItem('watch_stocks')
  if (!saved) return
  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) {
      watchStocks.value = parsed
        .map((item) => (typeof item === 'string' ? { code: item } : item))
        .filter((item): item is WatchStockItem => !!item?.code)
    }
  } catch (e) {
    console.error('Failed to parse watch stocks', e)
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

// 跨日清零当日字段（dailyRealizedPnl / dailyBasis / dailyDate 同生命周期）
const resetDailyRealizedPnl = () => {
  const today = getTodayStr()
  let changed = false
  stocks.value.forEach((stock) => {
    if (stock.dailyDate !== today) {
      // 有残留值或日期错位才写入，避免无意义保存
      if (stock.dailyRealizedPnl || stock.dailyBasis || stock.dailyDate) {
        stock.dailyRealizedPnl = 0
        stock.dailyBasis = 0
        stock.dailyDate = today
        changed = true
      }
    }
  })
  if (changed) saveStocks()
}

// 页面从隐藏切回可见时，立即校验一次跨日清零
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') resetDailyRealizedPnl()
}

// 保存到本地存储
const saveStocks = () => {
  localStorage.setItem('my_stocks', JSON.stringify(stocks.value))
}

const saveWatchStocks = () => {
  localStorage.setItem('watch_stocks', JSON.stringify(watchStocks.value))
}

const normalizeStockCode = (rawCode: string): string => {
  let code = rawCode.trim().toLowerCase()
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
  return code
}

// 添加股票
const addStock = async () => {
  const code = normalizeStockCode(inputCode.value)
  if (!code) return

  if (stocks.value.some((s) => s.code === code)) {
    toastRef.value?.show(t('stockExists'), 'warn')
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
      isNew: false,
      // 建仓价由用户填写，视为已含手续费的均摊成本价
      positionCostBasis: res.price * res.amount * 100,
      totalCostBasis: res.price * res.amount * 100
    })
    saveStocks()
    inputCode.value = ''
    fetchQuotes(true)
    toastRef.value?.show(t('stockAdded'), 'success')
  }
  // 无论确认还是取消，都把焦点恢复到输入框，方便连续输入
  nextTick(() => stockInputRef.value?.focus())
}

const addWatchStock = async () => {
  const code = normalizeStockCode(inputCode.value)
  if (!code) return

  if (watchStocks.value.some((s) => s.code === code)) {
    toastRef.value?.show(t('watchStockExists'), 'warn')
    return
  }

  await fetchQuotesByCode(code)
  watchStocks.value.push({ code })
  saveWatchStocks()
  inputCode.value = ''
  fetchQuotes(true)
  toastRef.value?.show(t('watchStockAdded'), 'success')
  nextTick(() => stockInputRef.value?.focus())
}

const handleAddAction = () => {
  if (stockPageMode.value === 'holding') addStock()
  else addWatchStock()
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
    const cleanup = () => {
      // 释放腾讯接口注入的全局变量，避免常驻 window
      try {
        delete (window as unknown as Record<string, unknown>)[`v_${code}`]
      } catch {
        ;(window as unknown as Record<string, unknown>)[`v_${code}`] = undefined
      }
      if (script.parentNode) document.body.removeChild(script)
    }
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
            changePercent: parseFloat(parts[32]),
            quoteDate: getTodayStr()
          }
        }
      }
      cleanup()
      resolve()
    }
    script.onerror = () => {
      cleanup()
      resolve()
    }
    document.body.appendChild(script)
  })
}

const removeUnusedQuotes = (codes: string[]) => {
  codes.forEach((code) => {
    const stillUsed =
      stocks.value.some((s) => s.code === code) || watchStocks.value.some((s) => s.code === code)
    if (!stillUsed) delete quotes.value[code]
  })
  cacheQuotes()
}

// 移除/清空股票逻辑
const handleDeleteAction = async () => {
  if (stockPageMode.value === 'watch') {
    if (selectedWatchCodes.value.length > 0) {
      const codesToRemove = [...selectedWatchCodes.value]
      const confirmed = await confirmRef.value?.open(
        t('deleteStock'),
        t('deleteConfirm', { count: codesToRemove.length })
      )
      if (confirmed) {
        watchStocks.value = watchStocks.value.filter((s) => !codesToRemove.includes(s.code))
        selectedWatchCodes.value = []
        shownCodes.value = shownCodes.value.filter((code) => !codesToRemove.includes(code))
        saveWatchStocks()
        removeUnusedQuotes(codesToRemove)
        toastRef.value?.show(t('selectedRemoved'), 'info')
      }
    } else {
      if (watchStocks.value.length === 0) return
      const codesToRemove = watchStocks.value.map((s) => s.code)
      const confirmed = await confirmRef.value?.open(t('clearList'), t('clearWatchConfirm'))
      if (confirmed) {
        watchStocks.value = []
        selectedWatchCodes.value = []
        shownCodes.value = shownCodes.value.filter((code) => !codesToRemove.includes(code))
        saveWatchStocks()
        removeUnusedQuotes(codesToRemove)
        toastRef.value?.show(t('allCleared'), 'warn')
      }
    }
    return
  }

  if (selectedCodes.value.length > 0) {
    // 批量删除已选项
    const codesToRemove = [...selectedCodes.value]
    const confirmed = await confirmRef.value?.open(
      t('deleteStock'),
      t('deleteConfirm', { count: codesToRemove.length })
    )
    if (confirmed) {
      stocks.value = stocks.value.filter((s) => !codesToRemove.includes(s.code))
      selectedCodes.value = []
      shownCodes.value = shownCodes.value.filter((code) => !codesToRemove.includes(code))
      saveStocks()
      removeUnusedQuotes(codesToRemove)
      toastRef.value?.show(t('selectedRemoved'), 'info')
    }
  } else {
    // 清空所有股票（原逻辑）
    if (stocks.value.length === 0) return
    const codesToRemove = stocks.value.map((s) => s.code)
    const confirmed = await confirmRef.value?.open(t('clearList'), t('clearConfirm'))
    if (confirmed) {
      stocks.value = []
      selectedCodes.value = []
      shownCodes.value = shownCodes.value.filter((code) => !codesToRemove.includes(code))
      saveStocks()
      removeUnusedQuotes(codesToRemove)
      toastRef.value?.show(t('allCleared'), 'warn')
    }
  }
}

// 读取手续费配置
interface FeeConfig {
  commissionRate: number // 佣金费率（万分之X）
  minCommission: number // 最低佣金（元）
  transferFeeRate: number // 过户费费率（万分之X）
  stampTaxRate: number // 印花税费率（万分之X）
}

const getStockFeeConfig = (): FeeConfig => {
  const raw = localStorage.getItem('stock_fee_config')
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      // ignore
    }
  }
  return { commissionRate: 2.5, minCommission: 5, transferFeeRate: 0.2, stampTaxRate: 5 }
}

/**
 * 计算股票交易手续费
 * @param tradePrice 成交价格
 * @param lots 手数（正数）
 * @param direction 'buy' | 'sell'
 * @returns 总手续费（元）
 */
const calcTradeFee = (tradePrice: number, lots: number, direction: 'buy' | 'sell'): number => {
  const config = getStockFeeConfig()
  const tradeAmount = tradePrice * lots * 100 // 成交金额

  // 佣金 = 成交金额 × 佣金费率，不低于最低佣金
  const commission = Math.max(tradeAmount * (config.commissionRate / 10000), config.minCommission)

  // 过户费 = 成交金额 × 过户费费率
  const transferFee = tradeAmount * (config.transferFeeRate / 10000)

  if (direction === 'buy') {
    // 买入 = 佣金 + 过户费
    return commission + transferFee
  } else {
    // 卖出 = 佣金 + 印花税 + 过户费
    const stampTax = tradeAmount * (config.stampTaxRate / 10000)
    return commission + transferFee + stampTax
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
      const direction = res.amount > 0 ? 'buy' : 'sell'
      const estFee = calcTradeFee(res.price, Math.abs(res.amount), direction)
      const confirmMsg = `${directionText} ${stockName}，${t('tradePrice')} ${res.price.toFixed(2)}，${t('deltaLots')} ${Math.abs(res.amount)}，${t('estFee')} ¥${estFee.toFixed(2)}？`
      const confirmed = await confirmRef.value?.open(t('adjustPosition'), confirmMsg)
      if (!confirmed) continue
    }

    // 清仓：需要二次确认
    if (res.clearPosition) {
      lastPrice = res.price // 保留用户修改过的价格
      const stockName = quote?.name || stock.code
      const estFee = calcTradeFee(res.price, stock.amount, 'sell')
      const confirmMsg = t('clearPositionConfirm', {
        price: res.price.toFixed(2),
        name: stockName,
        amount: stock.amount,
        fee: estFee.toFixed(2)
      })
      const confirmed = await confirmRef.value?.open(t('clearPositionTitle'), confirmMsg)
      if (!confirmed) continue // 取消清仓 → 重新显示调仓确认框
    }

    const delta = res.amount
    const tradePrice = res.price
    const isTodayTrade = res.isTodayTrade !== false // 默认 true
    if (delta === 0) return

    const oldAmount = stock.amount
    const newAmount = oldAmount + delta
    if (newAmount < 0) {
      toastRef.value?.show(t('amountCannotBeNegative'), 'fail')
      return
    }

    const yesterdayClose = quote?.yesterdayClose || 0
    const today = getTodayStr()

    // 确保 dailyRealizedPnl 属于今天
    if (stock.dailyDate !== today) {
      stock.dailyRealizedPnl = 0
      stock.dailyBasis = 0
      stock.dailyDate = today
    }

    if (delta > 0) {
      // 加仓价为未含手续费的成交价；买入手续费计入当前持仓成本基准
      const buyFee = calcTradeFee(tradePrice, delta, 'buy')
      const prevPositionBasis = stock.positionCostBasis ?? stock.cost * oldAmount * 100
      const prevTotalBasis = stock.totalCostBasis ?? prevPositionBasis
      const addCostBasis = tradePrice * delta * 100 + buyFee
      const nextPositionBasis = prevPositionBasis + addCostBasis

      stock.positionCostBasis = nextPositionBasis
      stock.cost = Number((nextPositionBasis / (newAmount * 100)).toFixed(3))
      stock.totalCostBasis = prevTotalBasis + addCostBasis

      // 当日盈亏修正：仅非新建仓的当日操作才修正
      // 新建仓(buyDate===today)直接用当前市值 - 当前持仓成本 + 已实现盈亏计算当日盈亏
      if (isTodayTrade && yesterdayClose > 0 && stock.buyDate !== today) {
        stock.dailyRealizedPnl =
          (stock.dailyRealizedPnl || 0) - (tradePrice - yesterdayClose) * delta * 100 - buyFee
      }
    } else {
      // 减仓：按当前持仓成本基准等比例拆出卖出部分成本，避免依赖三位小数均价造成偏差
      const soldLots = Math.abs(delta)
      const sellFee = calcTradeFee(tradePrice, soldLots, 'sell')
      const prevPositionBasis = stock.positionCostBasis ?? stock.cost * oldAmount * 100
      const soldCostBasis = oldAmount > 0 ? (prevPositionBasis * soldLots) / oldAmount : 0
      const sellIncome = tradePrice * soldLots * 100 - sellFee
      const realized = sellIncome - soldCostBasis
      stock.realizedPnl = (stock.realizedPnl || 0) + realized

      const nextPositionBasis = Math.max(0, prevPositionBasis - soldCostBasis)
      stock.positionCostBasis = newAmount > 0 ? nextPositionBasis : 0
      stock.cost = newAmount > 0 ? Number((stock.positionCostBasis / (newAmount * 100)).toFixed(3)) : 0

      // 当日盈亏修正：仅当日操作时才修正（扣除卖出手续费）
      if (isTodayTrade && (stock.buyDate === today || yesterdayClose > 0)) {
        if (stock.buyDate === today) {
          stock.dailyRealizedPnl = (stock.dailyRealizedPnl || 0) + realized
          // 当日新建仓按买入成本做分母，卖出部分也用对应成本基准
          stock.dailyBasis = (stock.dailyBasis || 0) + soldCostBasis
        } else {
          stock.dailyRealizedPnl =
            (stock.dailyRealizedPnl || 0) + (tradePrice - yesterdayClose) * soldLots * 100 - sellFee
          // 累加卖出部分对应的"昨日基准市值"，用于日盈亏比的分母
          // 这样清仓后 amount=0 时仍可用 dailyBasis 算比例
          stock.dailyBasis = (stock.dailyBasis || 0) + yesterdayClose * soldLots * 100
        }
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

const getTrackedStockCodes = (): string[] => {
  return Array.from(new Set([...stocks.value.map((s) => s.code), ...watchStocks.value.map((s) => s.code)]))
}

// 获取行情数据 (使用 JSONP 注入 script 标签，解决 GBK 编码跨域)
const fetchQuotes = (force = false) => {
  const trackedCodes = getTrackedStockCodes()
  if (trackedCodes.length === 0) return

  // 非交易时间且非强制刷新(初始化)时，跳过请求
  if (!force && !isTradingTime()) {
    return
  }

  const codes = trackedCodes.join(',')
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
  const stockCodes = [...trackedCodes]
  const cleanupGlobals = () => {
    // 释放腾讯接口注入到 window 的 v_xxx 全局变量
    stockCodes.forEach((code) => {
      try {
        delete (window as unknown as Record<string, unknown>)[`v_${code}`]
      } catch {
        ;(window as unknown as Record<string, unknown>)[`v_${code}`] = undefined
      }
    })
  }
  script.onload = () => {
    stockCodes.forEach((code) => {
      // 腾讯接口会在全局注入形如 v_sh600519 的变量
      const varName = `v_${code}`
      const dataStr = (window as any)[varName]
      if (dataStr) {
        const parts = dataStr.split('~')
        if (parts.length > 5) {
          const currentPrice = parseFloat(parts[3])
          quotes.value[code] = {
            name: parts[1],
            currentPrice,
            yesterdayClose: parseFloat(parts[4]),
            changeAmount: parseFloat(parts[31]),
            changePercent: parseFloat(parts[32]),
            quoteDate: getTodayStr()
          }

          const stock = stocks.value.find((s) => s.code === code)
          // 如果是新添加的股票，且成功获取到价格，则将成本价初始化为当前价
          if (stock?.isNew && currentPrice > 0) {
            stock.cost = currentPrice
            stock.isNew = false
            saveStocks()
          }

          // 检查价格提醒
          if (stock) checkPriceAlerts(stock, currentPrice)
        }
      }
    })
    // 缓存行情数据
    cacheQuotes()
    cleanupGlobals()
  }
  script.onerror = () => {
    cleanupGlobals()
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

const getPositionCostBasis = (stock: StockItem): number => {
  const basis =
    stock.positionCostBasis ?? (stock.cost > 0 && stock.amount > 0 ? stock.cost * stock.amount * 100 : 0)
  return Number.isFinite(basis) ? basis : 0
}

// 计算某只股票的当日盈亏
// 今天买入：当前市值 - 当前持仓成本基准 + 当日已实现盈亏
// 之前买入：(现价 - 昨收) × 股数 + 当日已实现盈亏修正
// 跨日陈旧昨收（quoteDate !== today）返回 null，避免不重启跨零点后显示"昨天的日盈"
const calculateDailyPnl = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote) return null

  const today = getTodayStr()

  // 行情陈旧（跨日未刷新）→ 昨收过期
  if (quote.quoteDate && quote.quoteDate !== today) return null

  if (stock.buyDate === today) {
    const marketValue = quote.currentPrice * stock.amount * 100
    const dailyRealizedPnl = (stock.dailyDate === today ? stock.dailyRealizedPnl : 0) || 0
    return marketValue - getPositionCostBasis(stock) + dailyRealizedPnl
  }

  const dailyCorrection = (stock.dailyDate === today ? stock.dailyRealizedPnl : 0) || 0
  return (quote.currentPrice - quote.yesterdayClose) * stock.amount * 100 + dailyCorrection
}

// 计算某只股票的持仓总盈亏 = 当前市值 - 当前持仓成本基准 + 已实现盈亏
const calculateTotalPnl = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote) return null
  const positionCostBasis = getPositionCostBasis(stock)
  if (stock.amount > 0 && positionCostBasis <= 0 && stock.cost <= 0) return null
  const marketValue = quote.currentPrice * stock.amount * 100
  const realizedPnl = stock.realizedPnl || 0
  return marketValue - positionCostBasis + realizedPnl
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
  if (!quote) return null

  const today = getTodayStr()
  const dailyPnl = calculateDailyPnl(stock)
  if (dailyPnl === null) return null
  // 当日已卖出部分的分母基准（清仓后用它做分母）
  const soldBasis = (stock.dailyDate === today ? stock.dailyBasis : 0) || 0

  // 如果今天买入，基准为当前持仓成本 + 当日已卖出部分成本基准
  if (stock.buyDate === today) {
    const costValue = getPositionCostBasis(stock)
    const denom = costValue + soldBasis
    if (denom <= 0) return null
    return (dailyPnl / denom) * 100
  }

  // 否则基准 = 持仓部分昨日市值 + 当日已卖出部分昨日基准
  // 这样清仓后 amount=0 时仍可正常计算比例
  const yesterdayValue = quote.yesterdayClose * stock.amount * 100
  const denom = yesterdayValue + soldBasis
  if (denom <= 0) return null
  return (dailyPnl / denom) * 100
}

// 计算某只股票的总盈亏比(%)
// 总盈亏额 / 累计买入成本 × 100
// 分母使用 totalCostBasis（累计买入成本），与当前持仓成本基准分离
const calculateTotalPnlPercent = (stock: StockItem): number | null => {
  const quote = quotes.value[stock.code]
  if (!quote) return null

  const totalPnl = calculateTotalPnl(stock)
  if (totalPnl === null) return null

  // 旧数据缺 totalCostBasis 时退回当前持仓成本基准
  const basis =
    stock.totalCostBasis && stock.totalCostBasis > 0 ? stock.totalCostBasis : getPositionCostBasis(stock)
  if (basis <= 0) return null
  return (totalPnl / basis) * 100
}

// 总当日盈亏额
const totalDailyPnl = computed(() => {
  return stocks.value.reduce((total, stock) => total + (calculateDailyPnl(stock) ?? 0), 0)
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
  loadWatchStocks()
  resetDailyRealizedPnl() // 跨日清零当日已实现盈亏

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
  // 用链式 setTimeout 取代 setInterval：
  //   1. 上一轮请求完成后再触发下一轮，避免弱网时请求堆积
  //   2. 窗口不可见时拉长间隔到 10s，降低后台 CPU/内存占用
  //   3. 每轮顺手做一次跨日清零校验，避免页面长开过零点不清零
  const scheduleNext = () => {
    const delay = document.visibilityState === 'visible' ? 1000 : 10000
    timer = setTimeout(() => {
      try {
        resetDailyRealizedPnl() // 跨零点自动清零（无变化时是 no-op）
        fetchQuotes(false)
      } finally {
        scheduleNext()
      }
    }, delay)
  }
  scheduleNext()

  // 窗口从隐藏→可见 / 重新获得焦点时，立即校验跨日清零。
  // 覆盖：电脑休眠唤醒、最小化恢复、切回应用等"轮询暂停过零点"的场景
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', resetDailyRealizedPnl)

  // 监听设置页中列顺序的变化，刷新本视图的渲染顺序
  window.addEventListener('column-order-changed', onColumnOrderChanged)

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

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  if (resizeObserver) resizeObserver.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', resetDailyRealizedPnl)
  window.removeEventListener('column-order-changed', onColumnOrderChanged)
})
</script>

<template>
  <div ref="containerRef" class="main-list-container">
    <ModuleNavBar current="stock">
      <template #navLabel>{{ t('stock') }}</template>
    </ModuleNavBar>
    <div class="table-container">
      <table v-if="stockPageMode === 'holding'" class="stock-table">
        <thead>
          <tr>
            <template v-for="key in columnOrder" :key="`th-${key}`">
              <!-- name -->
              <th
                v-if="key === 'name'"
                :title="nameDisplayMode === 0 ? t('name') : t('stockCode')"
                class="clickable-th col-name"
              >
                <span class="th-text" @click="toggleNameDisplayMode">{{
                  nameDisplayMode === 0 ? t('thName') : t('thCode')
                }}</span>
                <span
                  :class="['sort-icon', { 'sort-active': sortColumn === 'name' }]"
                  @click="toggleSort('name')"
                  >{{ sortColumn === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                >
              </th>

              <!-- price (+ split chg) -->
              <template v-else-if="key === 'price'">
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
                  class="clickable-th col-price"
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
                    :class="[
                      'sort-icon',
                      { 'sort-active': sortColumn === 'curPrice' || sortColumn === 'change' }
                    ]"
                    @click="
                      toggleSort(splitChg ? 'curPrice' : priceDisplayMode === 1 ? 'change' : 'curPrice')
                    "
                    >{{
                      sortColumn === 'curPrice' || sortColumn === 'change'
                        ? sortOrder === 'asc'
                          ? '↑'
                          : '↓'
                        : '↕'
                    }}</span
                  >
                </th>
                <th v-if="splitChg" :title="t('change')" class="clickable-th col-num">
                  <span class="th-text-static">{{ t('thChg') }}</span>
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'change' }]"
                    @click="toggleSort('change')"
                    >{{ sortColumn === 'change' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
              </template>

              <!-- dpnl (+ split dpnlPct) -->
              <template v-else-if="key === 'dpnl'">
                <th
                  :title="
                    splitDpnl
                      ? t('dailyPnl')
                      : dpnlDisplayMode === 0
                        ? t('dailyPnl')
                        : dpnlDisplayMode === 1
                          ? t('dailyPnlPercent')
                          : t('dailyPnl') + ' / ' + t('dailyPnlPercent')
                  "
                  class="clickable-th col-num"
                >
                  <span
                    :class="splitDpnl ? 'th-text-static' : 'th-text'"
                    @click="splitDpnl ? undefined : toggleDpnlDisplayMode()"
                    >{{
                      splitDpnl
                        ? t('thDPnl')
                        : dpnlDisplayMode === 0
                          ? t('thDPnl')
                          : dpnlDisplayMode === 1
                            ? t('thDPnlPct')
                            : t('thDPnlBoth')
                    }}</span
                  >
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'dpnl' }]"
                    @click="toggleSort('dpnl')"
                    >{{ sortColumn === 'dpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
                <th v-if="splitDpnl" :title="t('dailyPnlPercent')" class="clickable-th col-num">
                  <span class="th-text-static">{{ t('thDPnlPct') }}</span>
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'dpnlPct' }]"
                    @click="toggleSort('dpnlPct')"
                    >{{ sortColumn === 'dpnlPct' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
              </template>

              <!-- tpnl (+ split tpnlPct) -->
              <template v-else-if="key === 'tpnl'">
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
                  class="clickable-th col-num"
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
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'tpnl' }]"
                    @click="toggleSort('tpnl')"
                    >{{ sortColumn === 'tpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
                <th v-if="splitPnl" :title="t('totalPnlPercent')" class="clickable-th col-num">
                  <span class="th-text-static">{{ t('thTPnlPct') }}</span>
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'tpnlPct' }]"
                    @click="toggleSort('tpnlPct')"
                    >{{ sortColumn === 'tpnlPct' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
              </template>

              <!-- avg (+ split marketVal) -->
              <template v-else-if="key === 'avg'">
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
                  class="clickable-th col-avg"
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
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'avg' }]"
                    @click="toggleSort('avg')"
                    >{{ sortColumn === 'avg' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
                <th v-if="splitVal" :title="t('marketValue')" class="clickable-th col-avg">
                  <span class="th-text-static">{{ t('thVal') }}</span>
                  <span
                    :class="['sort-icon', { 'sort-active': sortColumn === 'marketVal' }]"
                    @click="toggleSort('marketVal')"
                    >{{ sortColumn === 'marketVal' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
                  >
                </th>
              </template>

              <!-- qty -->
              <th
                v-else-if="key === 'qty'"
                :title="qtyDisplayMode === 0 ? t('amount') : t('priceAlert')"
                class="clickable-th col-qty"
              >
                <span class="th-text" @click="toggleQtyDisplayMode">{{
                  qtyDisplayMode === 0 ? t('thQty') : t('thAlert')
                }}</span>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stock in displayStocks"
            :key="stock.code"
            :class="{ 'row-selected': selectedCodes.includes(stock.code) }"
            @click="toggleRowSelection(stock.code)"
          >
            <template v-for="key in columnOrder" :key="`td-${stock.code}-${key}`">
              <!-- name -->
              <td
                v-if="key === 'name'"
                :class="['name-cell', (quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
                :title="quotes[stock.code]?.name || stock.code"
                @click.stop="toggleNameDisplay(stock.code)"
              >
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
              </td>

              <!-- price (+ split chg) -->
              <template v-else-if="key === 'price'">
                <td
                  class="col-price"
                  :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
                >
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
                      <span class="price-main">{{
                        quotes[stock.code]?.currentPrice?.toFixed(2) || '--'
                      }}</span>
                      <span v-if="quotes[stock.code]" class="price-chg">
                        {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
                        }}{{ quotes[stock.code].changePercent }}%
                      </span>
                    </div>
                  </template>
                </td>
                <td
                  v-if="splitChg"
                  class="chg-cell col-num"
                  :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
                >
                  <span v-if="quotes[stock.code]">
                    {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
                    }}{{ quotes[stock.code].changePercent }}%
                  </span>
                  <span v-else>--</span>
                </td>
              </template>

              <!-- dpnl (+ split dpnlPct) -->
              <template v-else-if="key === 'dpnl'">
                <td class="col-num" :class="(calculateDailyPnl(stock) ?? 0) >= 0 ? 'red' : 'green'">
                  <span>
                    <template v-if="splitDpnl || dpnlDisplayMode === 0">
                      {{ calculateDailyPnl(stock) !== null ? calculateDailyPnl(stock)!.toFixed(2) : '--' }}
                    </template>
                    <template v-else-if="dpnlDisplayMode === 1">
                      {{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}
                    </template>
                    <template v-else>
                      <div class="price-dual">
                        <span class="price-main">
                          {{
                            calculateDailyPnl(stock) !== null ? calculateDailyPnl(stock)!.toFixed(2) : '--'
                          }}
                        </span>
                        <span class="price-chg">{{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}</span>
                      </div>
                    </template>
                  </span>
                </td>
                <td
                  v-if="splitDpnl"
                  class="col-num"
                  :class="(calculateDailyPnlPercent(stock) ?? 0) >= 0 ? 'red' : 'green'"
                >
                  <span>
                    {{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}
                  </span>
                </td>
              </template>

              <!-- tpnl (+ split tpnlPct) -->
              <template v-else-if="key === 'tpnl'">
                <td class="tpnl-cell col-num" :class="(calculateTotalPnl(stock) || 0) >= 0 ? 'red' : 'green'">
                  <span>
                    <template v-if="splitPnl || tpnlDisplayMode === 0">
                      {{ calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(2) : '--' }}
                    </template>
                    <template v-else-if="tpnlDisplayMode === 1">
                      {{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}
                    </template>
                    <template v-else>
                      <div class="price-dual">
                        <span class="price-main">{{
                          calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(2) : '--'
                        }}</span>
                        <span class="price-chg">{{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}</span>
                      </div>
                    </template>
                  </span>
                </td>
                <td
                  v-if="splitPnl"
                  class="tpnl-cell col-num"
                  :class="(calculateTotalPnlPercent(stock) || 0) >= 0 ? 'red' : 'green'"
                >
                  <span>
                    {{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}
                  </span>
                </td>
              </template>

              <!-- avg (+ split marketVal) -->
              <template v-else-if="key === 'avg'">
                <td class="col-avg">
                  <span>
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
                </td>
                <td v-if="splitVal" class="col-avg">
                  <span>
                    {{
                      calculateMarketValue(stock).toLocaleString(undefined, {
                        maximumFractionDigits: 0
                      })
                    }}
                  </span>
                </td>
              </template>

              <!-- qty -->
              <td
                v-else-if="key === 'qty'"
                class="clickable-cell col-qty"
                :title="qtyDisplayMode === 0 ? t('clickToAdjust') : t('setPriceAlert')"
                @click.stop="qtyDisplayMode === 0 ? adjustStockFlow(stock) : setPriceAlert(stock)"
              >
                <div
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
              </td>
            </template>
          </tr>
          <tr v-if="stocks.length === 0">
            <td
              :colspan="
                6 + (splitChg ? 1 : 0) + (splitDpnl ? 1 : 0) + (splitPnl ? 1 : 0) + (splitVal ? 1 : 0)
              "
              class="empty-row"
            >
              {{ t('noStocks') }}
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else class="stock-table watch-table">
        <thead>
          <tr>
            <th :title="t('name')" class="col-name">{{ t('thName') }}</th>
            <th :title="t('currentPrice')" class="col-price">{{ t('thPrice') }}</th>
            <th :title="t('change')" class="col-num">{{ t('thChg') }}</th>
            <th :title="t('changeAmount')" class="col-num">{{ t('thChangeAmount') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stock in displayWatchStocks"
            :key="stock.code"
            :class="{ 'row-selected': selectedWatchCodes.includes(stock.code) }"
            @click="toggleRowSelection(stock.code)"
          >
            <td
              :class="['name-cell', (quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
              :title="quotes[stock.code]?.name || stock.code"
              @click.stop="toggleNameDisplay(stock.code)"
            >
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
            </td>
            <td class="col-price" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
              {{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}
            </td>
            <td class="col-num" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
              <span v-if="quotes[stock.code]">
                {{ quotes[stock.code].changePercent > 0 ? '+' : '' }}{{ quotes[stock.code].changePercent }}%
              </span>
              <span v-else>--</span>
            </td>
            <td class="col-num" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
              <span v-if="quotes[stock.code]">
                {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
                }}{{ quotes[stock.code].changeAmount.toFixed(2) }}
              </span>
              <span v-else>--</span>
            </td>
          </tr>
          <tr v-if="watchStocks.length === 0">
            <td colspan="4" class="empty-row">{{ t('noWatchStocks') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-section">
      <div class="bottom-actions">
        <button
          class="mode-btn stock-page-btn"
          :title="stockPageMode === 'holding' ? t('switchToWatchStocks') : t('switchToHoldings')"
          @click="toggleStockPageMode"
        >
          <span class="mode-icon">{{ stockPageMode === 'holding' ? '👀' : '📊' }}</span>
        </button>
        <div class="input-group">
          <input
            ref="stockInputRef"
            v-model="inputCode"
            :placeholder="stockPageMode === 'holding' ? t('code') : t('watchStockCode')"
            class="stock-input"
            @keyup.enter="handleAddAction"
          />
          <button class="add-btn" @click="handleAddAction"><span class="add-icon">➕</span></button>
          <button
            v-if="stockPageMode === 'holding' ? stocks.length > 0 : watchStocks.length > 0"
            class="clear-all-btn"
            :title="
              (stockPageMode === 'holding' ? selectedCodes.length : selectedWatchCodes.length) > 0
                ? t('deleteSelected')
                : t('clearAll')
            "
            @click="handleDeleteAction"
          >
            <span class="clear-all-icon">{{
              (stockPageMode === 'holding' ? selectedCodes.length : selectedWatchCodes.length) > 0
                ? '🗑️'
                : '🧹'
            }}</span>
          </button>
        </div>
      </div>
      <div
        v-if="stockPageMode === 'holding'"
        class="summary-pnl"
        :title="t('clickToTogglePnL')"
        @click="toggleSummaryPnlMode"
      >
        <span class="pnl-toggle-icon">🔄</span>
        <span
          v-if="summaryPnlMode === 0"
          :class="['visible-summary', totalDailyPnl > 0 ? 'red' : totalDailyPnl < 0 ? 'green' : 'gray']"
          :title="t('dailyPnlTotal')"
        >
          <span class="pnl-label">{{ t('labelD') }}</span>
          <span>{{ totalDailyPnl > 0 ? '+' : '' }}{{ totalDailyPnl.toFixed(2) }}</span>
        </span>
        <span
          v-else
          :class="['visible-summary', totalHoldingPnl > 0 ? 'red' : totalHoldingPnl < 0 ? 'green' : 'gray']"
          :title="t('holdingPnlTotal')"
        >
          <span class="pnl-label">{{ t('labelH') }}</span>
          <span>{{ totalHoldingPnl > 0 ? '+' : '' }}{{ totalHoldingPnl.toFixed(2) }}</span>
        </span>
      </div>
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
  padding: 4px 6px 6px;
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
.stock-table td.col-name,
.stock-table td.col-price,
.stock-table td.col-avg,
.stock-table td.col-qty,
.stock-table td:last-child {
  text-align: center;
}

.watch-table {
  min-width: 240px;
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
  position: relative;
  cursor: pointer;
  text-decoration: underline dotted color-mix(in srgb, var(--ev-c-pink) 70%, transparent);
  text-underline-offset: 2px;
  display: inline-block;
  transition:
    color 0.2s,
    text-shadow 0.2s,
    text-decoration-color 0.2s,
    transform 0.2s;
}

.th-text:hover {
  color: var(--ev-c-pink);
  text-decoration-color: transparent;
  text-shadow: 0 0 5px color-mix(in srgb, var(--ev-c-pink) 55%, transparent);
  transform: scale(1.08);
}

.th-text-static {
  cursor: default;
}

.sort-icon {
  font-size: 10px;
  opacity: 0.55;
  margin-left: 2px;
  cursor: pointer;
  display: inline-block;
  width: 10px;
  color: #fff;
  transition:
    opacity 0.2s,
    transform 0.2s,
    color 0.2s;
  vertical-align: middle;
}

.sort-icon:hover,
.sort-icon.sort-active {
  opacity: 1;
  transform: scale(1.5);
  color: var(--ev-c-pink);
}

.clickable-th:hover .sort-icon:not(.sort-active) {
  opacity: 0.8;
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
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 8px;
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.05);
  transition: background-color 0.2s;
  cursor: pointer;
}
.summary-pnl:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
.pnl-toggle-icon {
  font-size: 11px;
  opacity: 0.9;
  transition:
    transform 0.3s ease,
    opacity 0.2s;
}
.summary-pnl:hover .pnl-toggle-icon {
  opacity: 1;
  transform: rotate(180deg);
}

.pnl-label {
  font-size: 10px;
  opacity: 0.6;
  margin-right: 4px;
  letter-spacing: 0.5px;
}

.visible-summary {
  user-select: none;
  display: inline-flex;
  align-items: baseline;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
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

/* 数值列字号统一加大（原 nth-child(2/3/4) 行为，改为基于列 class，
   避免列重排后 nth-child 索引错位） */
.stock-table td.col-price,
.stock-table td.col-num {
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
  color: #c084fc;
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
