import { computed, ref, type Ref } from 'vue'
import type { StockQuote, WatchStockItem } from '../types/stock'

const STORAGE_KEY = 'watch_stocks'

export const useStockWatchlist = (quotes: Ref<Record<string, StockQuote>>) => {
  const watchStocks = ref<WatchStockItem[]>([])
  const selectedWatchCodes = ref<string[]>([])

  const displayWatchStocks = computed(() => {
    return [...watchStocks.value].sort((a, b) => {
      const nameA = quotes.value[a.code]?.name || a.code
      const nameB = quotes.value[b.code]?.name || b.code
      return nameA.localeCompare(nameB, 'zh-CN')
    })
  })

  const loadWatchStocks = () => {
    const saved = localStorage.getItem(STORAGE_KEY)
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

  const saveWatchStocks = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchStocks.value))
  }

  const clearWatchSelection = () => {
    selectedWatchCodes.value = []
  }

  return {
    watchStocks,
    selectedWatchCodes,
    displayWatchStocks,
    loadWatchStocks,
    saveWatchStocks,
    clearWatchSelection
  }
}
