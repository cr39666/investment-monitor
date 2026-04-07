<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getLastMainView } from '../router'

const { t } = useI18n()
const router = useRouter()
const isDragging = ref(false)
let offsetX = 0
let offsetY = 0

// ---------- 盈亏数据 ----------
interface StockItem {
  code: string
  cost: number
  amount: number
  buyDate?: string
  dailyRealizedPnl?: number
  dailyDate?: string
}
interface StockQuote {
  currentPrice: number
  yesterdayClose: number
}

const totalDailyPnl = ref(0)
const hasStocks = ref(false)
const goldPrice = ref(0)
// 悬浮球显示模式：'stock'=股票盈亏, 'gold'=黄金实时价, 'none'=不显示
const ballDisplayMode = ref('stock')
const isHovered = ref(false)
const isContextMenuOpen = ref(false)
let pnlTimer: ReturnType<typeof setInterval> | null = null
let goldTimer: ReturnType<typeof setInterval> | null = null

const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isTradingTime = () => {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const timeNum = now.getHours() * 100 + now.getMinutes()
  return (timeNum >= 915 && timeNum <= 1130) || (timeNum >= 1300 && timeNum <= 1500)
}

// 通过 JSONP 拉取最新行情并更新 localStorage
const fetchAndRefreshPnl = () => {
  // 同步读取显示模式
  const modeSetting = localStorage.getItem('ball_display_mode')
  ballDisplayMode.value = modeSetting || 'stock'

  if (ballDisplayMode.value === 'none') return

  if (ballDisplayMode.value === 'gold') {
    // 金价模式不在此处刷新，由独立的 goldTimer 定时刷新
    return
  }

  // stock 模式：获取股票盈亏

  const stocksRaw = localStorage.getItem('my_stocks')
  if (!stocksRaw) {
    totalDailyPnl.value = 0
    hasStocks.value = false
    return
  }
  const stocks: StockItem[] = JSON.parse(stocksRaw)
  hasStocks.value = stocks.length > 0
  if (!hasStocks.value) {
    totalDailyPnl.value = 0
    return
  }

  // 检查缓存是否过期（非今天的缓存）
  const cachedDate = localStorage.getItem('cached_quotes_date')
  const today = getTodayStr()
  if (cachedDate !== today) {
    // 清除过期缓存
    localStorage.removeItem('cached_quotes')
    localStorage.removeItem('cached_quotes_date')
  }

  // 非交易时间只读缓存，不发请求
  if (!isTradingTime()) {
    calcPnlFromCache(stocks)
    return
  }

  const codes = stocks.map((s) => s.code).join(',')
  const scriptId = 'ball-jsonp-script'
  let script = document.getElementById(scriptId) as HTMLScriptElement
  if (script) document.body.removeChild(script)

  script = document.createElement('script')
  script.id = scriptId
  script.charset = 'gbk'
  script.src = `http://qt.gtimg.cn/q=${codes}&t=${Date.now()}`

  script.onload = () => {
    const cachedRaw = localStorage.getItem('cached_quotes')
    const cached: Record<string, StockQuote> = cachedRaw ? JSON.parse(cachedRaw) : {}

    stocks.forEach((s) => {
      const dataStr = (window as any)[`v_${s.code}`]
      if (dataStr) {
        const parts = dataStr.split('~')
        if (parts.length > 5) {
          cached[s.code] = {
            currentPrice: parseFloat(parts[3]),
            yesterdayClose: parseFloat(parts[4])
          }
        }
      }
    })

    const today = getTodayStr()
    localStorage.setItem('cached_quotes', JSON.stringify(cached))
    localStorage.setItem('cached_quotes_date', today)
    calcPnl(stocks, cached)
  }

  script.onerror = () => {
    calcPnlFromCache(stocks)
  }

  document.body.appendChild(script)
}

const calcPnlFromCache = (stocks: StockItem[]) => {
  const quotesRaw = localStorage.getItem('cached_quotes')
  if (!quotesRaw) {
    totalDailyPnl.value = 0
    return
  }
  calcPnl(stocks, JSON.parse(quotesRaw))
}

const calcPnl = (stocks: StockItem[], quotes: Record<string, StockQuote>) => {
  const today = getTodayStr()
  totalDailyPnl.value = stocks.reduce((sum, s) => {
    const q = quotes[s.code]
    if (!q) return sum

    // 如果今天买入，当日盈亏 = (现价 - 买入价) × 股数
    if (s.buyDate === today) {
      return sum + (q.currentPrice - s.cost) * s.amount * 100
    }

    // 如果之前买入，当日盈亏 = (现价 - 昨收) × 股数 + 当日已实现盈亏修正
    const dailyCorrection = (s.dailyDate === today ? s.dailyRealizedPnl : 0) || 0
    return sum + (q.currentPrice - q.yesterdayClose) * s.amount * 100 + dailyCorrection
  }, 0)
}

// 获取黄金实时价格（Gold API → CNY 克价）
const OZ_TO_GRAM = 31.1035
const fetchGoldPrice = async () => {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU/CNY')
    if (!res.ok) return
    const data = await res.json()
    if (data?.price) {
      goldPrice.value = data.price / OZ_TO_GRAM
    }
  } catch {
    /* ignore */
  }
}

const pnlText = computed(() => {
  if (ballDisplayMode.value === 'gold') {
    if (goldPrice.value <= 0) return '--'
    return goldPrice.value.toFixed(1)
  }
  const v = totalDailyPnl.value
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(abs / 10000).toFixed(1)}万`
  return abs.toFixed(0)
})

const pnlColorClass = computed(() => {
  if (ballDisplayMode.value === 'gold') return 'pnl-gold'
  if (totalDailyPnl.value > 0) return 'pnl-red'
  if (totalDailyPnl.value < 0) return 'pnl-blue'
  return 'pnl-gray'
})

const isHoverActive = computed(() => {
  return isHovered.value && !isContextMenuOpen.value
})

// 用 rAF 节流，只在每帧提交一次 IPC，避免 mousemove 洪泛导致延迟
let rafId: number | null = null
let latestScreenX = 0
let latestScreenY = 0

const flushMove = () => {
  rafId = null
  window.electron.ipcRenderer.send('window-move', {
    screenX: latestScreenX,
    screenY: latestScreenY,
    offsetX,
    offsetY
  })
}

const onMouseMove = (moveEvent: MouseEvent) => {
  latestScreenX = moveEvent.screenX
  latestScreenY = moveEvent.screenY
  isDragging.value = true
  if (rafId === null) {
    rafId = requestAnimationFrame(flushMove)
  }
}

const stopDragging = (): void => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    // 确保最终位置被提交
    flushMove()
  }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', stopDragging)
}

const onMouseDown = (e: MouseEvent) => {
  isDragging.value = false
  // 记录鼠标点击位置相对于窗口左下角的偏移 (在 80x80 坐标系内)
  offsetX = e.clientX
  offsetY = e.clientY

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', stopDragging)
}

onMounted(() => {
  // 初始收缩为 80x80
  window.electron.ipcRenderer.send('resize-window', 80, 80)

  // 初始化显示模式并启动相应的定时器
  fetchAndRefreshPnl()
  pnlTimer = setInterval(fetchAndRefreshPnl, 1000)

  // 如果初始模式是金价，启动金价定时器
  if (ballDisplayMode.value === 'gold') {
    fetchGoldPrice()
    goldTimer = setInterval(fetchGoldPrice, 10000)
  }

  // 监听右键菜单切换显示模式
  window.electron.ipcRenderer.on('set-ball-display-mode', (_event, mode: string) => {
    ballDisplayMode.value = mode
    localStorage.setItem('ball_display_mode', mode)

    // 切换到金价模式时，立即刷新一次并启动独立定时器
    if (mode === 'gold') {
      fetchGoldPrice()
      if (goldTimer) clearInterval(goldTimer)
      goldTimer = setInterval(fetchGoldPrice, 10000)
    } else {
      // 切换到非金价模式时，清除金价定时器
      if (goldTimer) {
        clearInterval(goldTimer)
        goldTimer = null
      }
    }

    fetchAndRefreshPnl()
  })

  window.electron.ipcRenderer.on('ball-context-menu-closed', () => {
    isContextMenuOpen.value = false
  })
})

onUnmounted(() => {
  if (pnlTimer) clearInterval(pnlTimer)
  if (goldTimer) clearInterval(goldTimer)
  window.electron.ipcRenderer.removeAllListeners('set-ball-display-mode')
  window.electron.ipcRenderer.removeAllListeners('ball-context-menu-closed')
})

const goToDetail = () => {
  if (isDragging.value) return // 如果是拖拽结束，不触发点击
  // 点击后切换路由到上一个主视图页（stock 或 gold）
  router.push(getLastMainView())
}

const onMouseEnter = () => {
  isHovered.value = true
}

const onMouseLeave = () => {
  isHovered.value = false
}

const onContextMenu = (e: MouseEvent) => {
  e.preventDefault()
  isContextMenuOpen.value = true
  isHovered.value = false
  window.electron.ipcRenderer.send('show-ball-context-menu', ballDisplayMode.value)
}
</script>

<template>
  <div
    ref="containerRef"
    :class="['floating-ball-container', { 'is-hovered': isHoverActive }]"
    :title="t('dragToMove')"
    @mousedown="onMouseDown"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @click="goToDetail"
    @contextmenu="onContextMenu"
  >
    <img src="../assets/electron.svg" class="ball-icon" alt="logo" />
    <span
      v-if="ballDisplayMode !== 'none' && (ballDisplayMode === 'gold' || hasStocks)"
      class="pnl-text"
      :class="pnlColorClass"
      >{{ pnlText }}</span
    >
  </div>
</template>

<style scoped>
.floating-ball-container {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
  position: relative;
}

.floating-ball-container:active {
  cursor: grabbing;
}

.ball-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
  filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.5));
  pointer-events: none; /* 让事件穿透到容器 */
  animation: ball-rotate 6s linear infinite;
  transition:
    opacity 0.4s ease,
    filter 0.4s ease,
    animation-duration 0.6s ease;
  will-change: transform, opacity, filter;
}

.floating-ball-container.is-hovered .ball-icon {
  opacity: 1;
  animation-duration: 2s;
  filter: drop-shadow(0 0 8px #6988e6aa);
}

/* === 盈亏金额 === */
.pnl-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.5px;
  white-space: nowrap;
  pointer-events: none;
  text-shadow:
    0 0 4px rgba(0, 0, 0, 0.85),
    0 0 8px rgba(0, 0, 0, 0.6);
  z-index: 1;
  transition: opacity 0.35s ease;
}

.floating-ball-container.is-hovered .pnl-text {
  opacity: 0.4;
}

.pnl-red {
  color: var(--ev-c-pink);
}
.pnl-blue {
  color: var(--ev-c-blue);
}
.pnl-gray {
  color: var(--ev-c-text-3);
}
.pnl-gold {
  color: #f0d060;
}

@keyframes ball-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
