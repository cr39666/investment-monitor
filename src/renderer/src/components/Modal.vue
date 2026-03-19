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
const alertDirection = ref<'up' | 'down'>('up')
let resolvePromise: ((value: any) => void) | null = null

const priceInput = ref<HTMLInputElement | null>(null)
const qtyInput = ref<HTMLInputElement | null>(null)

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
  defaults: { price?: number; amount?: number; direction?: 'up' | 'down'; isUp?: boolean } = {}
) => {
  modalType.value = type
  modalTitle.value = title
  modalMessage.value = message
  tradePrice.value = defaults.price || 0
  amount.value = defaults.amount || 0
  alertDirection.value = defaults.direction || 'up'
  isPriceUp.value = defaults.isUp ?? null
  isVisible.value = true

  nextTick(() => {
    if (type === 'add') {
      qtyInput.value?.focus()
    } else {
      priceInput.value?.focus()
      priceInput.value?.select()
    }
  })

  return new Promise<any>((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  isVisible.value = false
  resolvePromise?.({
    confirmed: true,
    price: tradePrice.value,
    amount: amount.value,
    direction: alertDirection.value
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
              <div class="modal-input-group">
                <input
                  type="number"
                  v-model.number="amount"
                  class="modal-input"
                  ref="qtyInput"
                  @keyup.enter="handleConfirm"
                />
                <label>{{ modalType === 'add' ? t('lotsHint') : t('deltaLots') }}</label>
              </div>
            </template>

            <p v-if="modalMessage" class="modal-msg">
              <template v-if="modalType === 'alert' && parsedMessage.currentPrice !== null">
                {{ parsedMessage.stockName }} ({{ parsedMessage.currentPriceText }}:
                <span :class="['current-price', isPriceUp === true ? 'price-up' : isPriceUp === false ? 'price-down' : '']">
                  {{ parsedMessage.currentPrice.toFixed(2) }}
                </span>)
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

.modal-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.modal-msg {
  font-size: 11px;
  color: #aaa;
  text-align: left;
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
