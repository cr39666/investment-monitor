<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import Toast from '../components/Toast.vue'
import GoldTradeModal from '../components/GoldTradeModal.vue'
import Confirm from '../components/Confirm.vue'
import { useUpdateCheck } from '../composables/useUpdateCheck'

const { t } = useI18n()
const router = useRouter()
const { hasPendingUpdate, checkPendingUpdate } = useUpdateCheck()

interface GoldHolding {
  grams: number
  avgPrice: number
}

// METALS constant removed as rows are now integrated into the card structure

type Currency = 'CNY' | 'USD'

const currency = ref<Currency>((localStorage.getItem('gold_currency') as Currency) || 'CNY')
const goldPrice = ref<number | null>(null)
const silverPrice = ref<number | null>(null)
const goldPriceCNY = ref<number | null>(null) // 专门用于持仓计算的 CNY 价格
const goldHolding = ref<GoldHolding | null>(null)
const fetchError = ref(false)
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const confirmClearRef = ref<InstanceType<typeof Confirm> | null>(null)
const showTradeModal = ref(false)
const tradeMode = ref<'buy' | 'sell' | 'init'>('buy')
const isHoldingDrawerOpen = ref(false)
const displayFetchVersion = ref(0)

const isSwitchingCurrency = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// 隐私模式
const isCensored = ref(false)
const toggleCensor = () => {
  isCensored.value = !isCensored.value
}

// 盈亏显示切换
const showPnLType = ref<'value' | 'percent'>('value')
const togglePnLDisplay = () => {
  showPnLType.value = showPnLType.value === 'value' ? 'percent' : 'value'
}

// 加载黄金持仓
const loadGoldHolding = () => {
  const saved = localStorage.getItem('gold_holding')
  if (saved) {
    goldHolding.value = JSON.parse(saved)
  }
}

const holdingPricePerGramCNY = computed(() => {
  if (goldPriceCNY.value === null) return null
  return goldPriceCNY.value / OZ_TO_GRAM
})

// 计算黄金市值（持仓一律按 CNY/克 计算）
const calculateGoldValue = computed(() => {
  if (!goldHolding.value || holdingPricePerGramCNY.value === null) return 0
  return goldHolding.value.grams * holdingPricePerGramCNY.value
})

// 计算黄金成本市值
const calculateGoldCost = computed(() => {
  if (!goldHolding.value) return 0
  return goldHolding.value.grams * goldHolding.value.avgPrice
})

// 计算黄金总盈亏
const calculateGoldTotalPnL = computed(() => {
  if (!goldHolding.value || holdingPricePerGramCNY.value === null) return 0
  return calculateGoldValue.value - calculateGoldCost.value
})

// 计算黄金收益率
const calculateGoldYield = computed(() => {
  if (!goldHolding.value || calculateGoldCost.value === 0) return 0
  return (calculateGoldTotalPnL.value / calculateGoldCost.value) * 100
})

// 切换货币
const toggleCurrency = async () => {
  if (isSwitchingCurrency.value) return

  const nextCurrency: Currency = currency.value === 'CNY' ? 'USD' : 'CNY'
  isSwitchingCurrency.value = true

  try {
    await fetchPrices(nextCurrency, true)
  } finally {
    isSwitchingCurrency.value = false
  }
}

// 获取单个金属价格
const fetchPrice = async (symbol: string, currencyParam?: Currency): Promise<number | null> => {
  try {
    const curr = currencyParam || currency.value
    const response = await fetch(`https://api.gold-api.com/price/${symbol}/${curr}`)
    if (!response.ok) throw new Error('Network error')
    const data = await response.json()
    return data.price
  } catch {
    return null
  }
}

// 获取黄金和白银价格
const fetchPrices = async (displayCurrency: Currency = currency.value, commitCurrency = false) => {
  const fetchVersion = ++displayFetchVersion.value

  const [goldCNY, gold, silver] = await Promise.all([
    fetchPrice('XAU', 'CNY'),
    fetchPrice('XAU', displayCurrency),
    fetchPrice('XAG', displayCurrency)
  ])

  if (fetchVersion !== displayFetchVersion.value) return

  goldPriceCNY.value = goldCNY

  if (!commitCurrency) {
    goldPrice.value = gold
    silverPrice.value = silver
  } else if (gold !== null || silver !== null) {
    currency.value = displayCurrency
    localStorage.setItem('gold_currency', displayCurrency)
    goldPrice.value = gold
    silverPrice.value = silver
  }

  fetchError.value = gold === null && silver === null && goldCNY === null
}

const OZ_TO_GRAM = 31.1035

// 格式化价格（CNY 模式下换算为克价）
const formatPrice = (price: number | null): string => {
  if (price === null || isNaN(price)) return '--'
  const displayPrice = currency.value === 'CNY' ? price / OZ_TO_GRAM : price
  const decimals = currency.value === 'CNY' ? 2 : 2
  return displayPrice.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

// 价格单位
const priceUnit = (): string => (currency.value === 'CNY' ? '¥/g' : '$/oz')

// 打开买入窗口
const openBuyModal = () => {
  if (holdingPricePerGramCNY.value === null) {
    toastRef.value?.show(t('noPriceData'), 'fail')
    return
  }
  tradeMode.value = 'buy'
  showTradeModal.value = true
}

// 打开卖出窗口
const openSellModal = () => {
  if (!goldHolding.value) {
    toastRef.value?.show(t('noGoldHolding'), 'fail')
    return
  }
  if (holdingPricePerGramCNY.value === null) {
    toastRef.value?.show(t('noPriceData'), 'fail')
    return
  }
  tradeMode.value = 'sell'
  showTradeModal.value = true
}

// 打开初始化持仓窗口
const openInitModal = () => {
  tradeMode.value = 'init'
  showTradeModal.value = true
}

const openClearModal = async () => {
  const confirmed = await confirmClearRef.value?.open(t('clearPos'), t('clearGoldConfirm'))
  if (confirmed) {
    confirmClear()
  }
}

const confirmClear = () => {
  goldHolding.value = null
  localStorage.removeItem('gold_holding')
  toastRef.value?.show(t('allCleared'), 'success')
}

const toggleHoldingDrawer = () => {
  isHoldingDrawerOpen.value = !isHoldingDrawerOpen.value
}

// closeHoldingDrawer removed as expansion is toggled via header

// 处理交易确认
const handleTradeConfirm = (
  action: 'buy' | 'sell' | 'init',
  data: { grams: number; avgPrice?: number }
) => {
  // 交易单价优先使用用户输入的值，否则回退到当前市价
  const transactionPrice = data.avgPrice || holdingPricePerGramCNY.value || 0

  if (action === 'init') {
    // 初始化持仓
    goldHolding.value = {
      grams: data.grams,
      avgPrice: transactionPrice
    }
    localStorage.setItem('gold_holding', JSON.stringify(goldHolding.value))
    toastRef.value?.show(t('initSuccess'), 'success')
    return
  }

  if (action === 'buy') {
    if (goldHolding.value) {
      // 已有持仓，以交易价格重新计算均价
      const currentTotalValue = goldHolding.value.grams * goldHolding.value.avgPrice
      const newValue = data.grams * transactionPrice
      const newAvgPrice = (currentTotalValue + newValue) / (goldHolding.value.grams + data.grams)
      goldHolding.value.grams += data.grams
      goldHolding.value.avgPrice = newAvgPrice
    } else {
      // 首次买入
      goldHolding.value = {
        grams: data.grams,
        avgPrice: transactionPrice
      }
    }
    localStorage.setItem('gold_holding', JSON.stringify(goldHolding.value))
    toastRef.value?.show(t('buySuccess'), 'success')
  } else {
    // 卖出
    if (!goldHolding.value) return

    goldHolding.value.grams -= data.grams

    if (goldHolding.value.grams < 0.0001) {
      // 全部卖出
      goldHolding.value = null
      localStorage.removeItem('gold_holding')
    } else {
      localStorage.setItem('gold_holding', JSON.stringify(goldHolding.value))
    }
    toastRef.value?.show(t('sellSuccess'), 'success')
  }
}

// 同步窗口尺寸
const syncWindowSize = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const width = Math.ceil(rect.width) + 40
  const height = Math.ceil(rect.height) + 40
  window.electron.ipcRenderer.send('resize-window', width, height)
}

const goToStockList = () => {
  router.push('/')
}

const goToFund = () => {
  router.push('/fund')
}

// 显示导航模块
const visibleModules = ref<string[]>(['stock', 'gold', 'fund'])

const goToBall = () => {
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/ball')
}

const goToSetting = () => {
  router.push('/setting')
}

onMounted(async () => {
  // 检测更新状态
  checkPendingUpdate()

  // 加载显示模块导航配置
  const moduleSaved = localStorage.getItem('show_modules')
  if (moduleSaved !== null) {
    try {
      const parsed = JSON.parse(moduleSaved)
      if (Array.isArray(parsed)) {
        visibleModules.value = parsed
      } else if (typeof parsed === 'boolean') {
        visibleModules.value = parsed ? ['stock', 'gold', 'fund'] : []
      }
    } catch {
      /* ignore */
    }
  } else {
    const fundSaved = localStorage.getItem('show_fund')
    if (fundSaved !== null) {
      const parsed = JSON.parse(fundSaved)
      visibleModules.value = parsed ? ['stock', 'gold', 'fund'] : []
    }
  }

  loadGoldHolding()
  fetchPrices()
  timer = setInterval(fetchPrices, 10000)

  await nextTick()

  if (containerRef.value) {
    syncWindowSize()
    setTimeout(syncWindowSize, 300)

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncWindowSize)
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="gold-container">
    <DragHandle>
      <template #left>
        <button class="nav-btn" :title="t('backToBall')" @click="goToBall">
          <img src="../assets/electron.svg" class="nav-icon" alt="ball" />
        </button>
      </template>
      <template #right>
        <button class="nav-btn setting-btn" :title="t('goToSetting')" @click="goToSetting">⚙️<span v-if="hasPendingUpdate" class="update-dot"></span></button>
      </template>
    </DragHandle>

    <div class="gold-content">
      <!-- 黄金卡片 (整合持仓) -->
      <div class="metal-card" :class="{ expanded: isHoldingDrawerOpen }">
        <div
          class="metal-card-header"
          :title="isHoldingDrawerOpen ? t('collapseGoldHolding') : t('viewGoldHolding')"
          @click="toggleHoldingDrawer"
        >
          <div class="metal-row gold-row">
            <span class="metal-label">
              🥇<span class="metal-label-text">{{ t('metalGold') }}</span>
            </span>
            <span class="metal-price gold">
              <span v-if="!isCensored && goldPrice !== null">
                {{ formatPrice(goldPrice) }}<small class="unit">{{ priceUnit() }}</small>
              </span>
              <span v-else-if="!isCensored">--</span>
              <span v-else>❇❇</span>
            </span>
          </div>
          <div v-if="isHoldingDrawerOpen" class="header-right">
            <span class="expand-arrow">▾</span>
          </div>
        </div>

        <div v-if="isHoldingDrawerOpen" class="metal-card-body">
          <div class="holding-section">
            <template v-if="goldHolding">
              <div class="holding-row">
                <span class="holding-label">{{ t('holdingGrams') }}</span>
                <span class="holding-value">{{ goldHolding.grams.toFixed(4) }}g</span>
              </div>
              <div
                class="holding-row pnl-toggle-row"
                :title="t('clickToTogglePnL')"
                @click="togglePnLDisplay"
              >
                <span class="holding-label">{{
                  showPnLType === 'value' ? t('goldTotalPnl') : t('goldYieldRate')
                }}</span>
                <span
                  class="holding-value"
                  :class="{ profit: calculateGoldTotalPnL > 0, loss: calculateGoldTotalPnL < 0 }"
                >
                  <template v-if="showPnLType === 'value'">
                    ¥{{ calculateGoldTotalPnL >= 0 ? '+' : ''
                    }}{{ calculateGoldTotalPnL.toFixed(2) }}
                  </template>
                  <template v-else>
                    {{ calculateGoldYield >= 0 ? '+' : '' }}{{ calculateGoldYield.toFixed(2) }}%
                  </template>
                </span>
              </div>
              <div class="holding-row">
                <span class="holding-label">{{ t('goldMarketValue') }}</span>
                <span class="holding-value">¥{{ calculateGoldValue.toFixed(2) }}</span>
              </div>
              <div class="holding-row">
                <span class="holding-label">{{ t('avgPrice') }}</span>
                <span class="holding-value">¥{{ goldHolding.avgPrice.toFixed(2) }}</span>
              </div>
            </template>
            <template v-else>
              <div class="empty-holding-compact">
                <span class="empty-label">{{ t('noGoldHolding') }}</span>
                <button class="init-btn-inline" @click.stop="openInitModal">
                  {{ t('initHolding') }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 其他金属列表 (目前只有白银) -->
      <div class="other-metals">
        <div class="metal-row silver-row">
          <span class="metal-label">
            🥈<span class="metal-label-text">{{ t('metalSilver') }}</span>
          </span>
          <span class="metal-price">
            <span v-if="!isCensored && silverPrice !== null">
              {{ formatPrice(silverPrice) }}<small class="unit">{{ priceUnit() }}</small>
            </span>
            <span v-else-if="!isCensored">--</span>
            <span v-else>❇❇</span>
          </span>
        </div>
      </div>
    </div>

    <div class="gold-footer">
      <div class="footer-left">
        <button
          v-if="visibleModules.includes('stock')"
          class="switch-btn stock-btn"
          :title="t('switchToStock')"
          @click="goToStockList"
        >
          📈
        </button>
        <button
          v-if="visibleModules.includes('fund')"
          class="switch-btn fund-btn"
          :title="t('switchToFund')"
          @click="goToFund"
        >
          💹
        </button>
        <button
          class="switch-btn currency-toggle-btn"
          :disabled="isSwitchingCurrency"
          :title="t('toggleCurrency')"
          @click="toggleCurrency"
        >
          {{ currency === 'CNY' ? '¥' : '$' }}
        </button>
      </div>

      <div class="footer-center">
        <div v-if="isHoldingDrawerOpen && goldHolding" class="action-group">
          <button class="action-btn add-btn" @click="openBuyModal">
            {{ t('addPos') }}
          </button>
          <button class="action-btn reduce-btn" @click="openSellModal">
            {{ t('reducePos') }}
          </button>
          <button class="action-btn clear-btn" @click="openClearModal">
            {{ t('clearPos') }}
          </button>
        </div>
      </div>

      <div class="footer-right">
        <span v-if="fetchError" class="fetch-error-text" :title="t('fetchError')">⚠</span>
        <span class="lock-icon" :title="t('toggleHide')" @click="toggleCensor">{{
          isCensored ? '🔒' : '🔓'
        }}</span>
      </div>
    </div>

    <Toast ref="toastRef" />
    <Confirm ref="confirmClearRef" />
    <GoldTradeModal
      :show="showTradeModal"
      :mode="tradeMode"
      :holding="goldHolding"
      :holding-price-per-gram="holdingPricePerGramCNY"
      @close="showTradeModal = false"
      @confirm="handleTradeConfirm"
    />
  </div>
</template>

<style scoped>
.gold-container {
  margin: 20px;
  padding: 2px 6px 4px 6px;
  color: #fff;
  min-width: 280px;
  width: fit-content;
  box-sizing: border-box;
  display: inline-flex;
  flex-direction: column;
  background-color: rgba(31, 34, 46, 0.95);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.nav-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
  opacity: 0.6;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover {
  opacity: 1;
  transform: scale(1.15);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.nav-btn:active {
  transform: scale(1.05);
}

.setting-btn {
  position: relative;
}

.update-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  background-color: #2ecc71;
  border-radius: 50%;
  animation: dotPulse 2s ease-in-out infinite;
}

@keyframes dotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.3); }
}

.nav-icon {
  width: 16px;
  height: 16px;
  opacity: 0.9;
  transition: opacity 0.3s ease;
}

.nav-btn:hover .nav-icon {
  opacity: 1;
}

.gold-content {
  margin-top: 4px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 整合卡片样式 */
.metal-card {
  background-color: rgba(255, 215, 0, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.metal-card:hover {
  background-color: rgba(255, 215, 0, 0.08);
  border-color: rgba(255, 215, 0, 0.2);
}

.metal-card.expanded {
  background-color: rgba(255, 215, 0, 0.05);
  border-color: rgba(255, 215, 0, 0.2);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.metal-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.expand-arrow {
  color: #888;
  font-size: 14px;
  transition: transform 0.3s ease;
  width: 16px;
  text-align: center;
}

.metal-card.expanded .expand-arrow {
  color: #f0d060;
  transform: translateY(1px);
}

.metal-card-body {
  padding: 0 8px 8px 8px;
  animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  will-change: transform, opacity;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.other-metals {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background-color: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  transition: all 0.2s;
  flex: 1;
}

.metal-card .metal-row {
  background-color: transparent;
  padding: 0;
}

.silver-row {
  opacity: 0.8;
}

.metal-label {
  font-size: 14px;
  margin-right: 8px;
}

.metal-label-text {
  margin-left: 8px;
  font-size: 12px;
}

.metal-price {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.gold {
  color: #f0d060;
}

.unit {
  font-size: 11px;
  font-weight: 400;
  color: #888;
  margin-left: 2px;
}

/* 持仓信息 (适配卡片内部) */
.holding-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(max-content, 1fr));
  gap: 8px;
  padding: 2px;
}

.holding-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s;
  gap: 12px;
}

.holding-row:hover {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 215, 0, 0.1);
}

.pnl-toggle-row {
  cursor: pointer;
  position: relative;
}

.pnl-toggle-row:active {
  transform: scale(0.98);
}

.holding-label {
  color: #888;
  font-size: 10px;
  white-space: nowrap;
}

.holding-value {
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}

.holding-value.profit {
  color: #ff4d4f;
}

.holding-value.loss {
  color: #52c41a;
}

.empty-holding-compact {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 10px;
}

.empty-label {
  font-size: 11px;
  color: #666;
}

.init-btn-inline {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 4px;
  color: #f0d060;
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 10px;
}

.init-btn-inline:hover {
  background: rgba(255, 215, 0, 0.2);
  border-color: rgba(255, 215, 0, 0.4);
  color: #fff;
}

.init-btn-inline:active {
  transform: scale(0.95);
}

.gold-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  gap: 8px;
}

.footer-left,
.footer-center,
.footer-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-center {
  flex: 1;
  justify-content: center;
}

.switch-btn {
  background-color: rgba(255, 215, 0, 0.1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.3s ease;
  font-size: 14px;
  opacity: 0.6;
}

.mode-icon {
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
}

.switch-btn:hover {
  background-color: rgba(255, 215, 0, 0.3);
  opacity: 1;
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.switch-btn:hover .mode-icon {
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.fund-btn {
  background-color: rgba(46, 204, 113, 0.1);
}

.fund-btn:hover {
  background-color: rgba(46, 204, 113, 0.3);
}

.currency-toggle-btn {
  color: #f0d060;
  min-width: 24px;
  font-weight: bold;
  padding: 3px 2px 2px 3px;
}

.currency-toggle-btn:hover {
  color: #fff;
}

.fetch-error-text {
  cursor: pointer;
  color: #e67e22;
  opacity: 0.8;
  white-space: nowrap;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.lock-icon {
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.3s ease;
  cursor: pointer;
}

.lock-icon:hover {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.action-group {
  display: flex;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 1px;
  gap: 1px;
  height: 20px;
  box-sizing: border-box;
}

.action-btn {
  background: transparent;
  border: none;
  padding: 0 8px;
  font-size: 10px;
  color: #aaa;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  height: 100%;
}

.action-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.add-btn {
  color: #f0d060;
}

.add-btn:hover {
  background-color: rgba(241, 196, 15, 0.1);
}

.reduce-btn {
  color: #e74c3c;
}

.reduce-btn:hover {
  background-color: rgba(231, 76, 60, 0.1);
}

.clear-btn {
  color: #95a5a6;
}

.clear-btn:hover {
  background-color: rgba(149, 165, 166, 0.1);
}
</style>
