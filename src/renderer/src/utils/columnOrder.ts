// 股票/基金列表的可自定义列顺序（仅"主列"，拆分出来的副列固定跟随主列）
// 设置页通过 localStorage 持久化用户调整后的顺序

// ========== 股票主列 ==========
// name: 名称/代码
// price: 现价（含 splitChg 的副列 chg）
// dpnl: 当日盈亏（含 splitDpnl 的副列 dpnlPct）
// tpnl: 总盈亏（含 splitPnl 的副列 tpnlPct）
// avg : 均摊成本（含 splitVal 的副列 marketVal）
// qty : 持仓手数/价格提醒
export type StockColumnKey = 'name' | 'price' | 'dpnl' | 'tpnl' | 'avg' | 'qty'
export const STOCK_COLUMNS_DEFAULT: StockColumnKey[] = ['name', 'price', 'dpnl', 'tpnl', 'avg', 'qty']

// ========== 基金主列 ==========
// name : 名称/代码
// nav  : 最新净值
// pnl  : 盈亏（点击编辑持仓）
// chg  : 日涨幅
// yield: 收益率
// last : 持有天数 / 持仓市值（点击切换）
export type FundColumnKey = 'name' | 'nav' | 'pnl' | 'chg' | 'yield' | 'last'
export const FUND_COLUMNS_DEFAULT: FundColumnKey[] = ['name', 'nav', 'pnl', 'chg', 'yield', 'last']

const STOCK_KEY = 'stock_columnOrder'
const FUND_KEY = 'fund_columnOrder'

const sanitize = <T extends string>(saved: unknown, defaults: readonly T[]): T[] => {
  if (!Array.isArray(saved)) return [...defaults]
  const filtered = saved.filter((k): k is T => (defaults as readonly string[]).includes(k))
  // 补齐缺失的（向后兼容：将来加新列时自动追加到末尾）
  for (const k of defaults) {
    if (!filtered.includes(k)) filtered.push(k)
  }
  return filtered
}

export const loadStockColumnOrder = (): StockColumnKey[] => {
  try {
    const raw = localStorage.getItem(STOCK_KEY)
    return sanitize<StockColumnKey>(raw ? JSON.parse(raw) : null, STOCK_COLUMNS_DEFAULT)
  } catch {
    return [...STOCK_COLUMNS_DEFAULT]
  }
}

export const saveStockColumnOrder = (order: StockColumnKey[]): void => {
  localStorage.setItem(STOCK_KEY, JSON.stringify(order))
}

export const loadFundColumnOrder = (): FundColumnKey[] => {
  try {
    const raw = localStorage.getItem(FUND_KEY)
    return sanitize<FundColumnKey>(raw ? JSON.parse(raw) : null, FUND_COLUMNS_DEFAULT)
  } catch {
    return [...FUND_COLUMNS_DEFAULT]
  }
}

export const saveFundColumnOrder = (order: FundColumnKey[]): void => {
  localStorage.setItem(FUND_KEY, JSON.stringify(order))
}
