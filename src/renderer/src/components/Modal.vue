<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isVisible = ref(false)
const modalType = ref<'transaction' | 'add' | 'alert'>('transaction')
const modalTitle = ref('')
const modalMessage = ref('')
const tradePrice = ref(0)
const amount = ref(0)
const currentAmount = ref(0) // 当前持仓手数（调仓模式下使用）
const alertDirection = ref<'up' | 'down'>('up')
const tradeDirection = ref<'buy' | 'sell' | 'clear'>('buy')
const isTodayNewPosition = ref(false) // 是否当日新建仓
const shakeHint = ref('') // 临时提示
let shakeTimer: ReturnType<typeof setTimeout> | null = null
let resolvePromise: ((value: any) => void) | null = null

const priceInput = ref<HTMLInputElement | null>(null)

// 解析 modalMessage 中的股票名称和当前价格
const parsedMessage = computed(() => {
  if (modalType.value !== 'alert' || !modalMessage.value) {
    return { stockName: modalMessage.value, currentPrice: null }
  }
  // 解析格式: "股票名称 (当前价: 100.00)"
  const match = modalMessage.value.match(/^(.+?)\s*\((.+?):\s*([\d.]+)\)$/)
  if (match) {
    return {
      stockName: match[1],
      currentPriceText: match[2],
      currentPrice: parseFloat(match[3])
    }
  }
  return { stockName: modalMessage.value, currentPrice: null }
})

// 当前价格是否上涨（需要从外部传入涨跌信息）
const isPriceUp = ref<boolean | null>(null)

const open = (
  type: 'transaction' | 'add' | 'alert',
  title: string,
  message: string,
  defaults: { price?: number; amount?: number; direction?: 'up' | 'down'; isUp?: boolean; currentAmount?: number } = {}
) => {
  modalType.value = type
  modalTitle.value = title
  modalMessage.value = message
  tradePrice.value = defaults.price || 0
  amount.value = defaults.amount || 0
  currentAmount.value = defaults.currentAmount || 0
  alertDirection.value = defaults.direction || 'up'
  isPriceUp.value = defaults.isUp ?? null
  tradeDirection.value = 'buy' // 默认买入
  isTodayNewPosition.value = false // 默认不是当日新建仓
  isVisible.value = true

  nextTick(() => {
    if (modalType.value === 'alert') {
      priceInput.value?.focus()
      priceInput.value?.select()
    } else {
      priceInput.value?.focus()
      priceInput.value?.select()
    }
  })

  return new Promise<any>((resolve) => {
    resolvePromise = resolve
  })
}

const showHint = (msg: string) => {
  shakeHint.value = msg
  if (shakeTimer) clearTimeout(shakeTimer)
  shakeTimer = setTimeout(() => { shakeHint.value = '' }, 1500)
}

const handleConfirm = () => {
  // 添加股票时，验证手数必须大于0
  if (modalType.value === 'add' && amount.value <= 0) {
    showHint(t('amountCannotBeNegative'))
    return
  }
  // 调仓时，变动手数不能为0（清仓除外）
  if (modalType.value === 'transaction' && tradeDirection.value !== 'clear' && amount.value === 0) {
    showHint(t('tradeAmountZero'))
    return
  }
  isVisible.value = false
  // 清仓模式
  if (modalType.value === 'transaction' && tradeDirection.value === 'clear') {
    resolvePromise?.({
      confirmed: true,
      clearPosition: true,
      price: tradePrice.value,
      amount: -currentAmount.value
    })
    return
  }
  // 调仓模式：根据买入/卖出方向自动添加正负号
  const finalAmount = modalType.value === 'transaction'
    ? (tradeDirection.value === 'buy' ? Math.abs(amount.value) : -Math.abs(amount.value))
    : amount.value
  resolvePromise?.({
    confirmed: true,
    price: tradePrice.value,
    amount: finalAmount,
    direction: alertDirection.value,
    isTodayNewPosition: isTodayNewPosition.value
  })
}

const handleClear = () => {
  isVisible.value = false
  resolvePromise?.({
    confirmed: true,
    clear: true,
    direction: alertDirection.value
  })
}

const handleCancel = () => {
  isVisible.value = false
  resolvePromise?.({ confirmed: false })
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="modal-overlay" @click.self="handleCancel">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-btn" @click="handleCancel">❌</span>
          <span>{{ modalTitle }}</span>
          <span class="modal-btn" @click="handleConfirm">✔️</span>
        </div>
        <div class="modal-body">
          <div class="modal-form">
            <!-- 价格提醒模式 -->
            <template v-if="modalType === 'alert'">
              <div class="modal-input-group">
                <input
                  type="number"
                  v-model.number="tradePrice"
                  class="modal-input"
                  step="0.01"
                  ref="priceInput"
                  @keyup.enter="handleConfirm"
                />
                <label>{{ t('targetPrice') }}</label>
                <button class="clear-icon-btn" @click="handleClear" :title="t('clearAlert')">🗑️</button>
              </div>
              <div class="alert-direction-group">
                <button
                  class="direction-btn"
                  :class="{ active: alertDirection === 'up' }"
                  @click="alertDirection = 'up'"
                >
                  ↑ {{ t('alertUp') }}
                </button>
                <button
                  class="direction-btn"
                  :class="{ active: alertDirection === 'down' }"
                  @click="alertDirection = 'down'"
                >
                  ↓ {{ t('alertDown') }}
                </button>
              </div>
            </template>

            <!-- 添加/交易模式 -->
            <template v-else>
              <!-- 添加模式：显示股票名称 -->
              <div v-if="modalType === 'add' && modalMessage" class="modal-stock-name">{{ modalMessage }}</div>
              <!-- 调仓模式：先选方向 -->
              <div v-if="modalType === 'transaction'" class="trade-direction-group">
                <button
                  class="direction-btn buy"
                  :class="{ active: tradeDirection === 'buy' }"
                  @click="tradeDirection = 'buy'"
                >
                  ➕ {{ t('tradeBuy') }}
                </button>
                <button
                  class="direction-btn sell"
                  :class="{ active: tradeDirection === 'sell' }"
                  @click="tradeDirection = 'sell'"
                >
                  ➖ {{ t('tradeSell') }}
                </button>
                <button
                  v-if="currentAmount > 0"
                  class="clear-position-btn"
                  :class="{ active: tradeDirection === 'clear' }"
                  @click="tradeDirection = 'clear'"
                >🧹 {{ t('clearPosition') }}</button>
              </div>
              <!-- 选完方向后显示价格输入 -->
              <div class="modal-input-group">
                <input
                  type="number"
                  v-model.number="tradePrice"
                  class="modal-input"
                  step="0.001"
                  ref="priceInput"
                  @keyup.enter="handleConfirm"
                />
                <label>{{ modalType === 'add' ? t('initialCost') : t('tradePrice') }}</label>
              </div>
              <!-- 添加模式或有持仓时显示手数输入（清仓不需要） -->
              <div v-if="modalType === 'add' || tradeDirection !== 'clear'" class="modal-input-group">
                <input
                  type="number"
                  v-model.number="amount"
                  class="modal-input"
                  ref="qtyInput"
                  @keyup.enter="handleConfirm"
                  :min="0"
                />
                <label>{{ modalType === 'add' ? t('lotsHint') : t('deltaLots') }}</label>
              </div>
              <!-- 当日新建仓选项 -->
              <div v-if="modalType === 'add'" class="modal-checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="isTodayNewPosition" class="checkbox-input" />
                  <span class="checkbox-custom"></span>
                  <span class="checkbox-text">{{ t('isTodayNewPosition') }}</span>
                </label>
              </div>
            </template>

            <transition name="hint-fade">
              <p v-if="shakeHint" class="modal-hint">{{ shakeHint }}</p>
            </transition>
            <p v-if="modalMessage && modalType !== 'add'" class="modal-msg">
              <template v-if="modalType === 'alert' && parsedMessage.currentPrice !== null">
                {{ parsedMessage.stockName }} ({{ parsedMessage.currentPriceText }}:
                <span :class="['current-price', isPriceUp === true ? 'price-up' : isPriceUp === false ? 'price-down' : '']">
                  {{ parsedMessage.currentPrice.toFixed(2) }}
                </span>)
              </template>
              <template v-else-if="modalType === 'transaction'">
                {{ modalMessage }}--{{ t('currentLots') }} <span class="current-amount">{{ currentAmount }}</span> {{ t('lotsUnit') }}
              </template>
              <template v-else>{{ modalMessage }}</template>
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: modalFadeIn 0.2s ease-out;
}

.modal-content {
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  width: 210px; /* Shrunk from 260px */
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  padding: 8px 12px; /* Shrunk from 16px */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: bold;
  padding-bottom: 8px;
  margin-bottom: 10px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.modal-btn {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.modal-body {
  padding-right: 6px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.modal-body::-webkit-scrollbar {
  width: 4px;
}
.modal-body::-webkit-scrollbar-track {
  background: transparent;
}
.modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}
.modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.modal-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.modal-msg {
  font-size: 11px;
  color: #aaa;
  text-align: left;
}

.modal-hint {
  font-size: 11px;
  color: #e74c3c;
  text-align: center;
  animation: hint-shake 0.3s ease;
}

@keyframes hint-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.3s;
}

.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 8px; /* Shrunk from 12px */
}

.modal-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.modal-input-group label {
  font-size: 11px;
  color: #888;
}

.modal-stock-name {
  font-size: 12px;
  color: #aaa;
  text-align: center;
  margin-bottom: 2px;
}

.modal-input {
  width: 90px;
  background-color: #242736;
  border: 1px solid #3a3d4a;
  border-radius: 4px; /* Shrunk from 6px */
  color: #fff;
  padding: 6px 8px; /* Shrunk from 8px 10px */
  outline: none;
  font-size: 12px; /* Shrunk from 14px */
}

.modal-input:focus {
  border-color: #2ecc71; /* 使用应用绿 */
  background-color: #2a2e42;
}

/* 价格提醒方向选择 */
.alert-direction-group {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.direction-btn {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid #3a3d4a;
  border-radius: 4px;
  background-color: #242736;
  color: #888;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.direction-btn:hover {
  background-color: #2a2e42;
  color: #fff;
}

.direction-btn.active {
  background-color: rgba(241, 196, 15, 0.2);
  border-color: #f1c40f;
  color: #f1c40f;
}

.direction-btn.buy.active {
  background-color: rgba(231, 76, 60, 0.15);
  border-color: var(--ev-c-pink);
  color: var(--ev-c-pink);
}

.direction-btn.sell.active {
  background-color: rgba(52, 152, 219, 0.15);
  border-color: var(--ev-c-blue);
  color: var(--ev-c-blue);
}

/* 当前价格涨跌颜色 */
.trade-direction-group {
  display: flex;
  margin-top: 2px;
  border: 1px solid #3a3d4a;
  border-radius: 6px;
  overflow: hidden;
}

.trade-direction-group .direction-btn,
.trade-direction-group .clear-position-btn {
  flex: 1;
  border: none;
  border-radius: 0;
  border-right: 1px solid #3a3d4a;
  padding: 5px 0;
  text-align: center;
  background-color: #242736;
  color: #888;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 0;
  position: relative;
}

.trade-direction-group > :last-child {
  border-right: none;
}

.trade-direction-group .direction-btn:hover,
.trade-direction-group .clear-position-btn:hover {
  background-color: #2a2e42;
  color: #ccc;
}

.trade-direction-group .direction-btn.active {
  background-color: rgba(241, 196, 15, 0.1);
  border-color: transparent;
  color: #f1c40f;
}

.trade-direction-group .direction-btn.buy.active {
  background-color: rgba(231, 76, 60, 0.1);
  color: var(--ev-c-pink);
  box-shadow: inset 0 -2px 0 var(--ev-c-pink);
}

.trade-direction-group .direction-btn.sell.active {
  background-color: rgba(52, 152, 219, 0.1);
  color: var(--ev-c-blue);
  box-shadow: inset 0 -2px 0 var(--ev-c-blue);
}

.trade-direction-group .clear-position-btn.active {
  background-color: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  box-shadow: inset 0 -2px 0 #e74c3c;
}

/* 当前价格涨跌颜色 */
.current-price {
  font-weight: bold;
}

.current-price.price-up {
  color: var(--ev-c-pink);
}

.current-price.price-down {
  color: var(--ev-c-blue);
}

/* 清除图标按钮 */
.clear-icon-btn {
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: all 0.2s;
  line-height: 1;
}

.clear-icon-btn:hover {
  opacity: 1;
  background-color: rgba(231, 76, 60, 0.2);
}

/* 清仓按钮（tab 外的基础样式，被 .trade-direction-group 内样式覆盖） */
.clear-position-btn {
  padding: 4px 6px;
  border: 1px solid rgba(231, 76, 60, 0.4);
  border-radius: 4px;
  background-color: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.clear-position-btn:hover {
  background-color: rgba(231, 76, 60, 0.3);
  border-color: #e74c3c;
}

.clear-position-btn.active {
  background-color: rgba(231, 76, 60, 0.25);
  border-color: #e74c3c;
  color: #e74c3c;
}

/* 复选框样式 */
.modal-checkbox-group {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 11px;
  color: #aaa;
  user-select: none;
}

.checkbox-input {
  display: none;
}

.checkbox-custom {
  width: 14px;
  height: 14px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  margin-right: 6px;
  position: relative;
  transition: all 0.2s;
  background: transparent;
}

.checkbox-input:checked + .checkbox-custom {
  background: #2ecc71;
  border-color: #2ecc71;
}

.checkbox-input:checked + .checkbox-custom::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
}

.checkbox-text {
  transition: color 0.2s;
}

.checkbox-label:hover .checkbox-text {
  color: #fff;
}

/* 当前持仓手数高亮 */
.current-amount {
  color: var(--ev-c-green);
  font-weight: bold;
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
