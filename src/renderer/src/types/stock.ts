export interface PriceAlert {
  targetPrice: number
  direction: 'up' | 'down'
  triggered: boolean
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
