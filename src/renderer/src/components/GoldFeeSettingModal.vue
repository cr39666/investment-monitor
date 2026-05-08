<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Toast from './Toast.vue'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const firstInput = ref<HTMLInputElement | null>(null)

// 黄金手续费配置项 (百分比)
const buyFeeRate = ref('') // 买入费率 (%)
const sellFeeRate = ref('') // 卖出费率 (%)

// localStorage key
const STORAGE_KEY = 'gold_fee_config'

// 加载配置
const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const config = JSON.parse(saved)
      buyFeeRate.value = config.buyFeeRate?.toString() || '0'
      sellFeeRate.value = config.sellFeeRate?.toString() || '0.4'
    } else {
      // 默认值
      buyFeeRate.value = '0'
      sellFeeRate.value = '0.4'
    }
  } catch {
    buyFeeRate.value = '0'
    sellFeeRate.value = '0.4'
  }
}

watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      loadConfig()
      nextTick(() => {
        firstInput.value?.focus()
        firstInput.value?.select()
      })
    }
  },
  { immediate: true }
)

const close = () => {
  emit('close')
}

const save = () => {
  const config = {
    buyFeeRate: parseFloat(buyFeeRate.value) || 0,
    sellFeeRate: parseFloat(sellFeeRate.value) || 0.4
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  toastRef.value?.show(t('goldFeeSaved'), 'success')
  setTimeout(() => {
    close()
  }, 300)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-btn" @click="close">❌</span>
          <span>{{ t('goldFeeSettingTitle') }}</span>
          <span class="modal-btn" @click="save">✔️</span>
        </div>

        <div class="modal-body">
          <div class="modal-form">
            <!-- 买入费率 -->
            <div class="modal-input-group">
              <span class="input-label">{{ t('goldBuyFeeRate') }}</span>
              <input
                ref="firstInput"
                v-model="buyFeeRate"
                type="number"
                class="modal-input"
                step="0.01"
              />
              <span class="input-unit">%</span>
            </div>
            <div class="input-hint">{{ t('goldBuyFeeHint') }}</div>

            <!-- 卖出费率 -->
            <div class="modal-input-group">
              <span class="input-label">{{ t('goldSellFeeRate') }}</span>
              <input
                v-model="sellFeeRate"
                type="number"
                class="modal-input"
                step="0.01"
                @keydown.enter="save"
              />
              <span class="input-unit">%</span>
            </div>
            <div class="input-hint">{{ t('goldSellFeeHint') }}</div>

            <!-- 计算公式说明 -->
            <div class="formula-section">
              <div class="formula-item">{{ t('goldBuyFeeFormula') }}</div>
              <div class="formula-item">{{ t('goldSellFeeFormula') }}</div>
            </div>
          </div>
        </div>
      </div>
      <Toast ref="toastRef" />
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
  animation: modalFadeIn 0.2s ease-out forwards;
}

.modal-content {
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  width: 230px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  will-change: transform, opacity;
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
  overflow-y: auto;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-label {
  font-size: 11px;
  color: #ccc;
  white-space: nowrap;
  min-width: 56px;
}

.modal-input {
  width: 70px;
  background-color: #242736;
  border: 1px solid #3a3d4a;
  border-radius: 4px;
  color: #fff;
  padding: 5px 6px;
  outline: none;
  font-size: 12px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.modal-input:focus {
  border-color: #f0d060;
  background-color: #2a2e42;
}

.input-unit {
  font-size: 10px;
  color: #888;
  white-space: nowrap;
}

.input-hint {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
  padding-left: 2px;
  margin-top: -4px;
}

.formula-section {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.formula-item {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  padding: 2px 0;
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
