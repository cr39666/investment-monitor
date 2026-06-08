import type { StockItem, StockQuote } from '../types/stock'

export const getPositionCostBasis = (stock: StockItem): number => {
  const basis =
    stock.positionCostBasis ?? (stock.cost > 0 && stock.amount > 0 ? stock.cost * stock.amount * 100 : 0)
  return Number.isFinite(basis) ? basis : 0
}

// 当天买入：当前市值 - 当前持仓成本基准 + 当日已实现盈亏
// 之前买入：(现价 - 昨收) × 股数 + 当日已实现盈亏修正
// 跨日陈旧昨收（quoteDate !== today）返回 null，避免不重启跨零点后显示"昨天的日盈"
export const calculateDailyPnl = (stock: StockItem, quote: StockQuote | undefined, today: string): number | null => {
  if (!quote) return null
  if (quote.quoteDate && quote.quoteDate !== today) return null

  if (stock.buyDate === today) {
    const marketValue = quote.currentPrice * stock.amount * 100
    const dailyRealizedPnl = (stock.dailyDate === today ? stock.dailyRealizedPnl : 0) || 0
    return marketValue - getPositionCostBasis(stock) + dailyRealizedPnl
  }

  const dailyCorrection = (stock.dailyDate === today ? stock.dailyRealizedPnl : 0) || 0
  return (quote.currentPrice - quote.yesterdayClose) * stock.amount * 100 + dailyCorrection
}

export const calculateTotalPnl = (stock: StockItem, quote: StockQuote | undefined): number | null => {
  if (!quote) return null
  const positionCostBasis = getPositionCostBasis(stock)
  if (stock.amount > 0 && positionCostBasis <= 0 && stock.cost <= 0) return null
  const marketValue = quote.currentPrice * stock.amount * 100
  const realizedPnl = stock.realizedPnl || 0
  return marketValue - positionCostBasis + realizedPnl
}

export const calculateMarketValue = (stock: StockItem, quote: StockQuote | undefined): number => {
  if (!quote) return 0
  return quote.currentPrice * stock.amount * 100
}

export const calculateDailyPnlPercent = (
  stock: StockItem,
  quote: StockQuote | undefined,
  today: string
): number | null => {
  if (!quote) return null

  const dailyPnl = calculateDailyPnl(stock, quote, today)
  if (dailyPnl === null) return null

  const soldBasis = (stock.dailyDate === today ? stock.dailyBasis : 0) || 0

  if (stock.buyDate === today) {
    const costValue = getPositionCostBasis(stock)
    const denom = costValue + soldBasis
    if (denom <= 0) return null
    return (dailyPnl / denom) * 100
  }

  const yesterdayValue = quote.yesterdayClose * stock.amount * 100
  const denom = yesterdayValue + soldBasis
  if (denom <= 0) return null
  return (dailyPnl / denom) * 100
}

export const calculateTotalPnlPercent = (stock: StockItem, quote: StockQuote | undefined): number | null => {
  if (!quote) return null

  const totalPnl = calculateTotalPnl(stock, quote)
  if (totalPnl === null) return null

  const basis = stock.totalCostBasis && stock.totalCostBasis > 0 ? stock.totalCostBasis : getPositionCostBasis(stock)
  if (basis <= 0) return null
  return (totalPnl / basis) * 100
}
