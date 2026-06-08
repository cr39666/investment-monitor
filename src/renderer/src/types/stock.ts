export interface PriceAlert {
  targetPrice: number
  direction: 'up' | 'down'
  triggered: boolean
}

export type StockAdjustmentDirection = 'buy' | 'sell' | 'clear'

export interface StockAdjustmentSnapshot {
  cost: number
  amount: number
  buyDate?: string
  isNew?: boolean
  realizedPnl?: number
  positionCostBasis?: number
  totalCostBasis?: number
  dailyRealizedPnl?: number
  dailyDate?: string
  dailyBasis?: number
}

export interface StockAdjustmentRecord {
  id: string
  date: string
  createdAt: string
  direction: StockAdjustmentDirection
  price: number
  amount: number
  fee: number
  isTodayTrade: boolean
  before: StockAdjustmentSnapshot
  after: StockAdjustmentSnapshot
}

export interface StockItem {
  code: string
  cost: number
  amount: number
  buyDate?: string
  isNew?: boolean
  priceAlerts?: PriceAlert[]
  realizedPnl?: number
  positionCostBasis?: number
  totalCostBasis?: number
  dailyRealizedPnl?: number
  dailyDate?: string
  dailyBasis?: number
  adjustmentRecords?: StockAdjustmentRecord[]
}

export interface WatchStockItem {
  code: string
}

export type StockPageMode = 'holding' | 'watch'

export interface StockQuote {
  name: string
  currentPrice: number
  yesterdayClose: number
  changeAmount: number
  changePercent: number
  quoteDate?: string
}
