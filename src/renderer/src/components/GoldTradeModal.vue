<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Toast from './Toast.vue'

const { t } = useI18n()

interface GoldHolding {
  grams: number
  avgPrice: number
}

const props = defineProps<{
  show: boolean
  mode: 'buy' | 'sell' | 'init'
  holding: GoldHolding | null
  holdingPricePerGram: number | null
}>()

const emit = defineEmits<{
  close: []
  confirm: [action: 'buy' | 'sell' | 'init', data: {
    grams: number
    avgPrice?: number
  }]
}>()

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const tradeMode = ref<'grams' | 'amount'>('grams')
const tradeGrams = ref('')
const tradeAmount = ref('')
const tradePrice = ref('') // 成本均价
const mainInput = ref<HTMLInputElement | null>(null)

// 初始化和重置
watch(() => props.show, (newShow) => {
  if (newShow) {
    tradeGrams.value = ''
    tradeAmount.value = ''
    tradePrice.value = props.mode === 'init' ? '' : (props.holdingPricePerGram?.toFixed(2) || '')
    tradeMode.value = 'grams'
    nextTick(() => {
      mainInput.value?.focus()
      mainInput.value?.select()
    })
  }
}, { immediate: true })

// 辅助计算结果 (仅用于显示提示)
const calculationResult = computed(() => {
  const p = parseFloat(tradePrice.value)
  if (isNaN(p) || p <= 0) return null

  if (tradeMode.value === 'grams') {
    const g = parseFloat(tradeGrams.value)
    if (isNaN(g) || g <= 0) return null
    return { type: 'amount', value: (g * p).toFixed(2) }
  } else {
    const a = parseFloat(tradeAmount.value)
    if (isNaN(a) || a <= 0) return null
    return { type: 'grams', value: (a / p).toFixed(4) }
  }
})

const close = () => {
  emit('close')
}

const confirm = () => {
  const p = parseFloat(tradePrice.value)
  if (isNaN(p) || p <= 0) {
    toastRef.value?.show(t('invalidAvgPrice'), 'fail')
    return
  }

  let finalGrams = 0
  if (tradeMode.value === 'grams') {
    finalGrams = parseFloat(tradeGrams.value)
  } else {
    const a = parseFloat(tradeAmount.value)
    finalGrams = a / p
  }

  if (isNaN(finalGrams) || finalGrams <= 0) {
    toastRef.value?.show(t('invalidGrams'), 'fail')
    return
  }

  if (props.mode === 'sell') {
    if (!props.holding || finalGrams > props.holding.grams) {
      toastRef.value?.show(t('insufficientHolding'), 'fail')
      return
    }
  }

  // 统一提交克数和成交价格
  emit('confirm', props.mode, {
    grams: finalGrams,
    avgPrice: p
  })

  close()
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-btn" @click="close">❌</span>
        <span>{{ mode === 'buy' ? t('addPos') : mode === 'sell' ? t('reducePos') : t('initHolding') }}</span>
        <span class="modal-btn" @click="confirm">✔️</span>
      </div>
      
      <div class="modal-body">
        <div class="modal-form">
          <!-- Tag-style Mode Switcher (Hidden in init mode) -->
          <div v-if="mode !== 'init'" class="mode-switcher">
            <button 
              :class="{ active: tradeMode === 'grams' }" 
              @click="tradeMode = 'grams'"
            >{{ t('grams') }}</button>
            <button 
              :class="{ active: tradeMode === 'amount' }" 
              @click="tradeMode = 'amount'"
            >{{ t('estimatedCost') }}</button>
          </div>

          <!-- Main Input (Grams or Value) -->
          <div class="modal-input-group">
            <input
              v-if="tradeMode === 'grams'"
              type="number"
              v-model="tradeGrams"
              class="modal-input"
              :placeholder="t('enterGrams')"
              step="0.0001"
              ref="mainInput"
            />
            <input
              v-else
              type="number"
              v-model="tradeAmount"
              class="modal-input"
              :placeholder="t('enterAmount')"
              step="0.01"
              ref="mainInput"
            />
            <label>{{ tradeMode === 'grams' ? t('gramsLabel') : t('valLabel') }}</label>
          </div>

          <!-- Price Input (Avg Cost Price) -->
          <div class="modal-input-group">
            <input
              type="number"
              v-model="tradePrice"
              class="modal-input"
              :placeholder="t('avgCostPrice')"
              step="0.01"
              @keydown.enter="confirm"
            />
            <label>{{ t('avgCostPrice') }}</label>
            
            <!-- Real-time Hint based on Price Input (Hidden in init mode) -->
            <div class="inline-hint" v-if="mode !== 'init' && calculationResult">
              <template v-if="calculationResult.type === 'amount'">
                ≈ ¥{{ calculationResult.value }}
              </template>
              <template v-else>
                ≈ {{ calculationResult.value }}g
              </template>
            </div>
          </div>

          <!-- Final Summary (Fee hint for sell) -->
          <div v-if="mode === 'sell' && calculationResult" class="modal-summary">
            <span class="fee-text">{{ t('feeHint', { rate: '0.4%' }) }}</span>
          </div>
        </div>
      </div>
    </div>
    <Toast ref="toastRef" />
  </div>
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
  width: 210px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
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
  margin-bottom: 8px;
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

.modal-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.modal-body {
  flex: 1;
  min-height: 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-switcher {
  display: flex;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 2px;
  margin-bottom: 4px;
}

.mode-switcher button {
  flex: 1;
  border: none;
  background: none;
  padding: 3px 0;
  font-size: 10px;
  color: #666;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.mode-switcher button.active {
  background-color: rgba(240, 208, 96, 0.1);
  color: #f0d060;
  font-weight: 600;
}

.modal-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.modal-input {
  width: 109px;
  background-color: #242736;
  border: 1px solid #3a3d4a;
  border-radius: 4px;
  color: #fff;
  padding: 6px 8px;
  outline: none;
  font-size: 12px;
  transition: all 0.2s;
}

.modal-input:focus {
  border-color: #f0d060;
  background-color: #2a2e42;
}

.modal-input-group label {
  font-size: 11px;
  color: #888;
}

.inline-hint {
  font-size: 9px;
  color: #f0d060;
  opacity: 0.6;
  width: 100%;
  padding-left: 2px;
  margin-top: -2px;
}

.modal-summary {
  font-size: 10px;
  color: #aaa;
  margin-top: 2px;
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.05);
}

.fee-text {
  font-size: 8px;
  color: #666;
}

@keyframes modalSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes modalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
