<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import ModuleNavBar from '../components/ModuleNavBar.vue'
import HoldingStockTable from '../components/HoldingStockTable.vue'
import WatchStockTable from '../components/WatchStockTable.vue'
import Modal from '../components/Modal.vue'
import Confirm from '../components/Confirm.vue'
import Toast from '../components/Toast.vue'
import AdjustmentHistoryModal from '../components/AdjustmentHistoryModal.vue'
import { loadStockColumnOrder, type StockColumnKey } from '../utils/columnOrder'
import { normalizeStockCode } from '../utils/stockCode'
import {
  calculateDailyPnl as calcDailyPnl,
  calculateDailyPnlPercent as calcDailyPnlPercent,
  calculateMarketValue as calcMarketValue,
  calculateTotalPnl as calcTotalPnl,
  calculateTotalPnlPercent as calcTotalPnlPercent
} from '../utils/stockCalc'
import { useStockQuotes } from '../composables/useStockQuotes'
import { useStockWatchlist } from '../composables/useStockWatchlist'
import type {
  StockAdjustmentDirection,
  StockAdjustmentRecord,
  StockAdjustmentSnapshot,
  StockItem,
  StockPageMode
} from '../types/stock'

const { t } = useI18n()

// 页面标题：根据 stockPageMode 动态显示
const pageTitle = computed(() => {
  return stockPageMode.value === 'holding' ? t('stockHolding') : t('stockWatch')
})

const inputCode = ref('')
const stocks = ref<StockItem[]>([])
const stockPageMode = ref<StockPageMode>(
  (localStorage.getItem('stock_pageMode') as StockPageMode) || 'holding'
)
let timer: ReturnType<typeof setTimeout> | null = null

const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const getTrackedStockCodes = (): string[] => {
  return Array.from(new Set([...stocks.value.map((s) => s.code), ...watchStocks.value.map((s) => s.code)]))
}

const {
  quotes,
  loadCachedQuotes,
  fetchQuotesByCode,
  fetchQuotes,
  removeUnusedQuotes: removeUnusedStockQuotes
} = useStockQuotes(getTrackedStockCodes, getTodayStr, (code, currentPrice) => {
  const stock = stocks.value.find((s) => s.code === code)
  if (stock?.isNew && currentPrice > 0) {
    stock.cost = currentPrice
    stock.isNew = false
    saveStocks()
  }
  if (stock) checkPriceAlerts(stock, currentPrice)
})

const {
  watchStocks,
  selectedWatchCodes,
  displayWatchStocks,
  loadWatchStocks,
  saveWatchStocks,
  clearWatchSelection
} = useStockWatchlist(quotes)

const containerRef = ref<HTMLElement | null>(null)
const stockInputRef = ref<HTMLInputElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// 拆分列（涨跌幅/日盈比/总盈比/市值）— 多选数组
const splitColumns = ref<string[]>([])

// 自定义列顺序（持久化到 localStorage，由设置页拖拽调整）
const columnOrder = ref<StockColumnKey[]>(loadStockColumnOrder())
// 完整列顺序（主列+拆分列，新格式）
const fullColumnOrder = ref<string[]>([])
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
// 加载完整列顺序（从 stock_columnOrderFull）
const loadFullColumnOrder = () => {
  const raw = localStorage.getItem('stock_columnOrderFull')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        fullColumnOrder.value = parsed.filter((k: unknown): k is string => typeof k === 'string')
        return
      }
    } catch {
      // 忽略
    }
  }
  // 降级：使用 columnOrder + splitColumns 构造
  fullColumnOrder.value = []
  columnOrder.value.forEach((mainKey) => {
    fullColumnOrder.value.push(mainKey as string)
    splitColumns.value.forEach((sk) => {
      // 简单处理：拆分列跟在父主列后（降级兼容）
      const parentMap: Record<string, string> = { chg: 'price', dpnl: 'dpnl', pnl: 'tpnl', val: 'avg' }
      if (parentMap[sk] === mainKey) fullColumnOrder.value.push(`split:${sk}`)
    })
  })
}
const onColumnOrderChanged = () => {
  columnOrder.value = loadStockColumnOrder()
  reloadSplitColumns()
  loadFullColumnOrder()
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
  clearWatchSelection()
  nextTick(() => stockInputRef.value?.focus())
}

// --- 组件引用 ---
const modalRef = ref<InstanceType<typeof Modal> | null>(null)
const confirmRef = ref<InstanceType<typeof Confirm> | null>(null)
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const adjustmentHistoryRef = ref<InstanceType<typeof AdjustmentHistoryModal> | null>(null)
// --------------------------
const formatName = (name: string | undefined): string => {
  if (!name) return '--'
  if (name.length > 4) {
    return name.slice(0, 4) + '...'
  }
  return name
}

const adjustmentSnapshotKeys: (keyof StockAdjustmentSnapshot)[] = [
  'cost',
  'amount',
  'buyDate',
  'isNew',
  'realizedPnl',
  'positionCostBasis',
  'totalCostBasis',
  'dailyRealizedPnl',
  'dailyDate',
  'dailyBasis'
]

const createAdjustmentSnapshot = (stock: StockItem): StockAdjustmentSnapshot => ({
  cost: stock.cost,
  amount: stock.amount,
  buyDate: stock.buyDate,
  isNew: stock.isNew,
  realizedPnl: stock.realizedPnl,
  positionCostBasis: stock.positionCostBasis,
  totalCostBasis: stock.totalCostBasis,
  dailyRealizedPnl: stock.dailyRealizedPnl,
  dailyDate: stock.dailyDate,
  dailyBasis: stock.dailyBasis
})

const restoreAdjustmentSnapshot = (stock: StockItem, snapshot: StockAdjustmentSnapshot) => {
  const writableStock = stock as unknown as Record<keyof StockAdjustmentSnapshot, unknown>
  adjustmentSnapshotKeys.forEach((key) => {
    const value = snapshot[key]
    if (value === undefined) {
      delete writableStock[key]
    } else {
      writableStock[key] = value
    }
  })
}

const snapshotsEqual = (stock: StockItem, snapshot: StockAdjustmentSnapshot): boolean => {
  const current = createAdjustmentSnapshot(stock)
  return adjustmentSnapshotKeys.every((key) => current[key] === snapshot[key])
}

const pruneAdjustmentRecords = (stock: StockItem, today = getTodayStr()): boolean => {
  if (!stock.adjustmentRecords?.length) return false
  const todayRecords = stock.adjustmentRecords.filter((record) => record.date === today)
  if (todayRecords.length === stock.adjustmentRecords.length) return false
  if (todayRecords.length > 0) stock.adjustmentRecords = todayRecords
  else delete stock.adjustmentRecords
  return true
}

const getTodayAdjustmentRecords = (stock: StockItem): StockAdjustmentRecord[] => {
  const today = getTodayStr()
  return stock.adjustmentRecords?.filter((record) => record.date === today) || []
}

const addAdjustmentRecord = (stock: StockItem, record: StockAdjustmentRecord) => {
  stock.adjustmentRecords = [...getTodayAdjustmentRecords(stock), record]
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
        if (pruneAdjustmentRecords(s)) {
          changed = true
        }
      })
      if (changed) saveStocks()
    } catch (e) {
      console.error('Failed to parse saved stocks', e)
    }
  }
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
    if (pruneAdjustmentRecords(stock, today)) {
      changed = true
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

const removeUnusedQuotes = (codes: string[]) => {
  removeUnusedStockQuotes(
    codes,
    (code) => stocks.value.some((s) => s.code === code) || watchStocks.value.some((s) => s.code === code)
  )
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

    // 确保 dailyRealizedPnl 属于当天
    if (stock.dailyDate !== today) {
      stock.dailyRealizedPnl = 0
      stock.dailyBasis = 0
      stock.dailyDate = today
    }
    const beforeAdjustment = createAdjustmentSnapshot(stock)
    const adjustmentDirection: StockAdjustmentDirection = res.clearPosition
      ? 'clear'
      : delta > 0
        ? 'buy'
        : 'sell'
    const adjustmentFee = calcTradeFee(tradePrice, Math.abs(delta), delta > 0 ? 'buy' : 'sell')

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
    addAdjustmentRecord(stock, {
      id: `${stock.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: today,
      createdAt: new Date().toISOString(),
      direction: adjustmentDirection,
      price: tradePrice,
      amount: Math.abs(delta),
      fee: adjustmentFee,
      isTodayTrade,
      before: beforeAdjustment,
      after: createAdjustmentSnapshot(stock)
    })
    saveStocks()
    toastRef.value?.show(t('positionUpdated'), 'success')
    return // 操作完成，退出循环
  }
}

const undoLastAdjustment = async (stock: StockItem) => {
  const records = getTodayAdjustmentRecords(stock)
  const lastRecord = records[records.length - 1]
  if (!lastRecord) {
    toastRef.value?.show(t('adjustmentRecordsEmpty'), 'info')
    return
  }

  if (!snapshotsEqual(stock, lastRecord.after)) {
    toastRef.value?.show(t('adjustmentUndoConflict'), 'fail')
    return
  }

  const confirmed = await confirmRef.value?.open(t('undoAdjustmentTitle'), t('undoAdjustmentConfirm'))
  if (!confirmed) return

  restoreAdjustmentSnapshot(stock, lastRecord.before)
  const remainingRecords = records.slice(0, -1)
  if (remainingRecords.length > 0) {
    stock.adjustmentRecords = remainingRecords
  } else {
    delete stock.adjustmentRecords
  }
  saveStocks()
  toastRef.value?.show(t('adjustmentUndone'), 'success')
}

const showAdjustmentRecords = async (stock: StockItem) => {
  if (pruneAdjustmentRecords(stock)) saveStocks()
  const quote = quotes.value[stock.code]
  const stockName = quote?.name ? `${quote.name} (${stock.code})` : stock.code
  const result = await adjustmentHistoryRef.value?.open(stockName, getTodayAdjustmentRecords(stock))
  if (result === 'undo') {
    await undoLastAdjustment(stock)
  }
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

const calculateDailyPnl = (stock: StockItem): number | null => {
  return calcDailyPnl(stock, quotes.value[stock.code], getTodayStr())
}

const calculateTotalPnl = (stock: StockItem): number | null => {
  return calcTotalPnl(stock, quotes.value[stock.code])
}

const calculateMarketValue = (stock: StockItem): number => {
  return calcMarketValue(stock, quotes.value[stock.code])
}

const calculateDailyPnlPercent = (stock: StockItem): number | null => {
  return calcDailyPnlPercent(stock, quotes.value[stock.code], getTodayStr())
}

const calculateTotalPnlPercent = (stock: StockItem): number | null => {
  return calcTotalPnlPercent(stock, quotes.value[stock.code])
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

  // 加载完整列顺序（必须在 splitColumns 加载后）
  loadFullColumnOrder()

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
      <template #navLabel>{{ pageTitle }}</template>
    </ModuleNavBar>
    <div class="table-container">
      <HoldingStockTable
        v-if="stockPageMode === 'holding'"
        :full-column-order="fullColumnOrder"
        :stocks="stocks"
        :display-stocks="displayStocks"
        :selected-codes="selectedCodes"
        :quotes="quotes"
        :shown-codes="shownCodes"
        :name-display-mode="nameDisplayMode"
        :price-display-mode="priceDisplayMode"
        :dpnl-display-mode="dpnlDisplayMode"
        :tpnl-display-mode="tpnlDisplayMode"
        :avg-display-mode="avgDisplayMode"
        :qty-display-mode="qtyDisplayMode"
        :sort-column="sortColumn"
        :sort-order="sortOrder"
        :t="t"
        :format-name="formatName"
        :calculate-daily-pnl="calculateDailyPnl"
        :calculate-daily-pnl-percent="calculateDailyPnlPercent"
        :calculate-total-pnl="calculateTotalPnl"
        :calculate-total-pnl-percent="calculateTotalPnlPercent"
        :calculate-market-value="calculateMarketValue"
        :format-pnl-percent="formatPnlPercent"
        :format-price-alerts="formatPriceAlerts"
        @toggle-row-selection="toggleRowSelection"
        @toggle-name-display="toggleNameDisplay"
        @toggle-name-display-mode="toggleNameDisplayMode"
        @toggle-price-display-mode="togglePriceDisplayMode"
        @toggle-dpnl-display-mode="toggleDpnlDisplayMode"
        @toggle-tpnl-display-mode="toggleTpnlDisplayMode"
        @toggle-avg-display-mode="toggleAvgDisplayMode"
        @toggle-qty-display-mode="toggleQtyDisplayMode"
        @toggle-sort="toggleSort"
        @adjust-stock="adjustStockFlow"
        @set-price-alert="setPriceAlert"
        @show-adjustment-records="showAdjustmentRecords"
      />
      <WatchStockTable
        v-else
        :watch-stocks="watchStocks"
        :display-watch-stocks="displayWatchStocks"
        :selected-watch-codes="selectedWatchCodes"
        :quotes="quotes"
        :shown-codes="shownCodes"
        :name-display-mode="nameDisplayMode"
        :t="t"
        :format-name="formatName"
        @toggle-row-selection="toggleRowSelection"
        @toggle-name-display="toggleNameDisplay"
      />
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

    <!-- 当日调仓记录组件 -->
    <AdjustmentHistoryModal ref="adjustmentHistoryRef" />

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

.table-container {
  flex: 1;
  min-width: 240px;
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
</style>
