import { ref } from 'vue'
import type { StockQuote } from '../types/stock'

export type QuoteLoadedHandler = (code: string, currentPrice: number) => void

const CACHE_KEY = 'cached_quotes'
const CACHE_DATE_KEY = 'cached_quotes_date'

export const useStockQuotes = (
  getTrackedStockCodes: () => string[],
  getTodayStr: () => string,
  onQuoteLoaded?: QuoteLoadedHandler
) => {
  const quotes = ref<Record<string, StockQuote>>({})

  const parseQuote = (code: string, dataStr: string): number | null => {
    const parts = dataStr.split('~')
    if (parts.length <= 5) return null

    const currentPrice = parseFloat(parts[3])
    quotes.value[code] = {
      name: parts[1],
      currentPrice,
      yesterdayClose: parseFloat(parts[4]),
      changeAmount: parseFloat(parts[31]),
      changePercent: parseFloat(parts[32]),
      quoteDate: getTodayStr()
    }
    return currentPrice
  }

  const loadCachedQuotes = () => {
    const saved = localStorage.getItem(CACHE_KEY)
    const savedDate = localStorage.getItem(CACHE_DATE_KEY)
    const today = getTodayStr()

    // 如果缓存不是当天的，清除缓存（确保使用新的昨收价）
    if (savedDate !== today) {
      localStorage.removeItem(CACHE_KEY)
      localStorage.removeItem(CACHE_DATE_KEY)
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

  const cacheQuotes = () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(quotes.value))
    localStorage.setItem(CACHE_DATE_KEY, getTodayStr())
  }

  const isTradingTime = () => {
    const now = new Date()
    const day = now.getDay()
    const hours = now.getHours()
    const minutes = now.getMinutes()

    if (day === 0 || day === 6) return false

    const timeNum = hours * 100 + minutes
    const isMorning = timeNum >= 915 && timeNum <= 1130
    const isAfternoon = timeNum >= 1300 && timeNum <= 1500

    return isMorning || isAfternoon
  }

  const cleanupGlobal = (code: string) => {
    try {
      delete (window as unknown as Record<string, unknown>)[`v_${code}`]
    } catch {
      ;(window as unknown as Record<string, unknown>)[`v_${code}`] = undefined
    }
  }

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
        cleanupGlobal(code)
        if (script.parentNode) document.body.removeChild(script)
      }

      script.onload = () => {
        const varName = `v_${code}`
        const dataStr = (window as unknown as Record<string, unknown>)[varName] as string | undefined
        if (dataStr) parseQuote(code, dataStr)
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

  const fetchQuotes = (force = false) => {
    const trackedCodes = getTrackedStockCodes()
    if (trackedCodes.length === 0) return

    if (!force && !isTradingTime()) return

    const codes = trackedCodes.join(',')
    const scriptId = 'jsonp-stock-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement

    if (script) document.body.removeChild(script)

    script = document.createElement('script')
    script.id = scriptId
    script.charset = 'gbk'
    script.src = `http://qt.gtimg.cn/q=${codes}&t=${Date.now()}`

    const stockCodes = [...trackedCodes]
    const cleanupGlobals = () => {
      stockCodes.forEach(cleanupGlobal)
    }

    script.onload = () => {
      stockCodes.forEach((code) => {
        const varName = `v_${code}`
        const dataStr = (window as unknown as Record<string, unknown>)[varName] as string | undefined
        if (!dataStr) return

        const currentPrice = parseQuote(code, dataStr)
        if (currentPrice !== null) onQuoteLoaded?.(code, currentPrice)
      })
      cacheQuotes()
      cleanupGlobals()
    }
    script.onerror = () => {
      cleanupGlobals()
    }

    document.body.appendChild(script)
  }

  const removeUnusedQuotes = (codes: string[], isCodeUsed: (code: string) => boolean) => {
    codes.forEach((code) => {
      if (!isCodeUsed(code)) delete quotes.value[code]
    })
    cacheQuotes()
  }

  return {
    quotes,
    loadCachedQuotes,
    cacheQuotes,
    fetchQuotesByCode,
    fetchQuotes,
    removeUnusedQuotes
  }
}
