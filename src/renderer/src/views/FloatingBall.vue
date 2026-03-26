<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

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
  dailyRealizedPnl?: number
  dailyDate?: string
}
interface StockQuote {
  currentPrice: number
  yesterdayClose: number
}

const totalDailyPnl = ref(0)
const hasStocks = ref(false)
const showBallPnl = ref(true)
let pnlTimer: ReturnType<typeof setInterval> | null = null

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
  // 同步读取开关设置
  const pnlSetting = localStorage.getItem('show_ball_pnl')
  showBallPnl.value = pnlSetting === null ? true : JSON.parse(pnlSetting)

  const stocksRaw = localStorage.getItem('my_stocks')
  if (!stocksRaw) {
    totalDailyPnl.value = 0
    hasStocks.value = false
    return
  }
  const stocks: StockItem[] = JSON.parse(stocksRaw)
  hasStocks.value = stocks.length > 0
  if (!hasStocks.value) { totalDailyPnl.value = 0; return }

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
  if (!quotesRaw) { totalDailyPnl.value = 0; return }
  calcPnl(stocks, JSON.parse(quotesRaw))
}

const calcPnl = (stocks: StockItem[], quotes: Record<string, StockQuote>) => {
  const today = getTodayStr()
  totalDailyPnl.value = stocks.reduce((sum, s) => {
    const q = quotes[s.code]
    if (!q) return sum
    const dailyCorrection = (s.dailyDate === today ? s.dailyRealizedPnl : 0) || 0
    return sum + (q.currentPrice - q.yesterdayClose) * s.amount * 100 + dailyCorrection
  }, 0)
}

const pnlText = computed(() => {
  const v = totalDailyPnl.value
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(abs / 10000).toFixed(1)}万`
  return abs.toFixed(0)
})

const pnlColorClass = computed(() => {
  if (totalDailyPnl.value > 0) return 'pnl-red'
  if (totalDailyPnl.value < 0) return 'pnl-blue'
  return 'pnl-gray'
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

const stopDragging = () => {
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
  fetchAndRefreshPnl()
  pnlTimer = setInterval(fetchAndRefreshPnl, 1000)
})

onUnmounted(() => {
  if (pnlTimer) clearInterval(pnlTimer)
})

const goToDetail = () => {
  if (isDragging.value) return // 如果是拖拽结束，不触发点击
  // 点击后切换路由到列表页，然后在主进程通知放大窗口
  router.push('/')
}

const onContextMenu = (e: MouseEvent) => {
  e.preventDefault()
  window.electron.ipcRenderer.send('show-ball-context-menu')
}
</script>

<template>
  <div
    ref="containerRef"
    class="floating-ball-container"
    @mousedown="onMouseDown"
    @click="goToDetail"
    @contextmenu="onContextMenu"
    :title="t('dragToMove')"
  >
    <img src="../assets/electron.svg" class="ball-icon" alt="logo" />
    <span v-if="hasStocks && showBallPnl" class="pnl-text" :class="pnlColorClass">{{ pnlText }}</span>
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

.floating-ball-container:hover .ball-icon {
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
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.85), 0 0 8px rgba(0, 0, 0, 0.6);
  z-index: 1;
  transition: opacity 0.35s ease;
}

.floating-ball-container:hover .pnl-text {
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

@keyframes ball-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
