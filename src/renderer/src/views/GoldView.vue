<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import Toast from '../components/Toast.vue'

const { t } = useI18n()
const router = useRouter()

interface MetalQuote {
  symbol: string
  name: string
  price: number | null
  currencySymbol: string
}

const METALS = [
  { symbol: 'XAU', labelKey: 'metalGold', emoji: '🥇' },
  { symbol: 'XAG', labelKey: 'metalSilver', emoji: '🥈' },
  { symbol: 'XPT', labelKey: 'metalPlatinum', emoji: '⚪' },
  { symbol: 'XPD', labelKey: 'metalPalladium', emoji: '⚫' }
] as const

type Currency = 'CNY' | 'USD'

const currency = ref<Currency>((localStorage.getItem('gold_currency') as Currency) || 'CNY')
const quotes = ref<MetalQuote[]>([])
const loading = ref(false)
const fetchError = ref(false)
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

// 隐私模式
const isCensored = ref(false)
const toggleCensor = () => {
  isCensored.value = !isCensored.value
}

// 切换货币
const toggleCurrency = () => {
  currency.value = currency.value === 'CNY' ? 'USD' : 'CNY'
  localStorage.setItem('gold_currency', currency.value)
  quotes.value = []
  fetchAllPrices()
}

// 获取单个金属价格
const fetchPrice = async (symbol: string): Promise<MetalQuote | null> => {
  try {
    const response = await fetch(`https://api.gold-api.com/price/${symbol}/${currency.value}`)
    if (!response.ok) throw new Error('Network error')
    const data = await response.json()
    return {
      symbol: data.symbol,
      name: data.name,
      price: data.price,
      currencySymbol: data.currencySymbol
    }
  } catch {
    return null
  }
}

// 并发获取所有金属价格
const fetchAllPrices = async () => {
  loading.value = true
  fetchError.value = false
  const results = await Promise.all(METALS.map(m => fetchPrice(m.symbol)))
  fetchError.value = results.every(r => r === null)
  quotes.value = results.map((r, i) => ({
    symbol: METALS[i].symbol,
    name: r?.name ?? t(METALS[i].labelKey),
    price: r?.price ?? null,
    currencySymbol: r?.currencySymbol ?? (currency.value === 'CNY' ? '¥' : '$')
  }))
  loading.value = false
}

const OZ_TO_GRAM = 31.1035

// 格式化价格（CNY 模式下换算为克价）
const formatPrice = (price: number | null): string => {
  if (price === null || isNaN(price)) return '--'
  const displayPrice = currency.value === 'CNY' ? price / OZ_TO_GRAM : price
  const decimals = currency.value === 'CNY' ? 2 : 2
  return displayPrice.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// 价格单位
const priceUnit = (): string => currency.value === 'CNY' ? '/g' : '/oz'

// 复制价格
const copyPrice = (price: number | null) => {
  if (price === null) return
  const copyVal = currency.value === 'CNY' ? (price / OZ_TO_GRAM).toFixed(2) : price.toString()
  navigator.clipboard.writeText(copyVal).then(() => {
    toastRef.value?.show(t('priceCopied'), 'success')
  })
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

// 是否显示基金按钮
const showFund = ref(false)

const goToBall = () => {
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/ball')
}

const goToSetting = () => {
  router.push('/setting')
}

onMounted(async () => {
  // 加载基金显示配置
  const fundSaved = localStorage.getItem('show_fund')
  showFund.value = fundSaved !== null ? JSON.parse(fundSaved) : false

  fetchAllPrices()
  timer = setInterval(fetchAllPrices, 10000)

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
        <button class="nav-btn" @click="goToBall" :title="t('backToBall')">
          <img src="../assets/electron.svg" class="nav-icon" alt="ball" />
        </button>
      </template>
      <template #right>
        <button class="nav-btn" @click="goToSetting" :title="t('goToSetting')">
          ⚙️
        </button>
      </template>
    </DragHandle>

    <div class="gold-content">
      <div class="metal-list">
        <div
          v-for="(metal, index) in METALS"
          :key="metal.symbol"
          class="metal-row"
          :class="{ highlight: index === 0 }"
        >
          <span class="metal-label">
            <span class="metal-emoji">{{ metal.emoji }}</span>
            {{ t(metal.labelKey) }}
          </span>
          <span
            class="metal-price clickable"
            :class="{ gold: index === 0 }"
            @click="copyPrice(quotes[index]?.price)"
            :title="t('clickToCopy')"
          >
            <span v-if="!isCensored && quotes[index]?.price !== null">
              {{ formatPrice(quotes[index]?.price) }}<small class="unit">{{ priceUnit() }}</small>
            </span>
            <span v-else-if="!isCensored">--</span>
            <span v-else>❇❇</span>
          </span>
        </div>
      </div>
    </div>

    <div class="gold-footer">
      <button class="switch-btn" @click="goToStockList" :title="t('switchToStock')">
        <span class="mode-icon">📈</span>
      </button>
      <button v-if="showFund" class="switch-btn fund-btn" @click="goToFund" :title="t('switchToFund')">
        <span class="mode-icon">💹</span>
      </button>
      <button class="currency-btn" @click="toggleCurrency">
        {{ currency === 'CNY' ? '¥ CNY' : '$ USD' }}
      </button>
      <span v-if="fetchError" class="fetch-error-text">⚠ {{ t('fetchError') }}</span>
      <div class="footer-right">
        <span class="lock-icon" @click="toggleCensor" :title="t('toggleHide')">{{ isCensored ? '🔒' : '🔓' }}</span>
      </div>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.gold-container {
  margin: 20px;
  padding: 2px 6px 4px 6px;
  color: #fff;
  min-width: 280px;
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
  margin-top: 2px;
  flex: 1;
}

.metal-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}

.metal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  background-color: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  transition: background-color 0.2s;
}

.metal-row:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.metal-row.highlight {
  background-color: rgba(255, 215, 0, 0.08);
}

.metal-label {
  font-size: 11px;
  color: #888;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.metal-emoji {
  font-size: 11px;
}

.metal-price {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.metal-row.highlight .metal-price {
  font-size: 14px;
  font-weight: 700;
}

.metal-price.clickable {
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.metal-price.clickable:hover {
  background-color: rgba(255, 255, 255, 0.12);
}

.metal-price.clickable:active {
  opacity: 0.6;
}

.gold {
  color: #f0d060;
}

.unit {
  font-size: 10px;
  font-weight: 400;
  color: #666;
  margin-left: 1px;
}

.gold-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  padding-top: 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  gap: 4px;
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

.currency-btn {
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ccc;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0.7;
}

.currency-btn:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.currency-btn:active {
  transform: scale(0.95);
}

.fetch-error-text {
  font-size: 10px;
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
</style>
