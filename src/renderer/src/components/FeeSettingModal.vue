<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
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

// 手续费配置项
const commissionRate = ref('') // 佣金费率 (万分之X)
const minCommission = ref('') // 最低佣金 (元)
const transferFeeRate = ref('') // 过户费费率 (万分之X)
const stampTaxRate = ref('') // 印花税费率 (万分之X)

// localStorage key
const STORAGE_KEY = 'stock_fee_config'

// 加载配置
const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const config = JSON.parse(saved)
      commissionRate.value = config.commissionRate?.toString() || '2.5'
      minCommission.value = config.minCommission?.toString() || '5'
      transferFeeRate.value = config.transferFeeRate?.toString() || '0.2'
      stampTaxRate.value = config.stampTaxRate?.toString() || '5'
    } else {
      // 默认值
      commissionRate.value = '2.5'
      minCommission.value = '5'
      transferFeeRate.value = '0.2'
      stampTaxRate.value = '5'
    }
  } catch {
    commissionRate.value = '2.5'
    minCommission.value = '5'
    transferFeeRate.value = '0.2'
    stampTaxRate.value = '5'
  }
}

const close = () => {
  emit('close')
}

const save = () => {
  const config = {
    commissionRate: parseFloat(commissionRate.value) || 2.5,
    minCommission: parseFloat(minCommission.value) || 5,
    transferFeeRate: parseFloat(transferFeeRate.value) || 0.2,
    stampTaxRate: parseFloat(stampTaxRate.value) || 5
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  toastRef.value?.show(t('feeSaved'), 'success')
  setTimeout(() => {
    close()
  }, 300)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.show) return
  if (e.key === 'Enter') {
    const target = e.target as HTMLElement | null
    if (target?.tagName === 'TEXTAREA' || (e as KeyboardEvent & { isComposing?: boolean }).isComposing) return
    e.preventDefault()
    e.stopPropagation()
    save()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}

watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      loadConfig()
      window.addEventListener('keydown', handleKeydown, true)
      nextTick(() => {
        firstInput.value?.focus()
        firstInput.value?.select()
      })
    } else {
      window.removeEventListener('keydown', handleKeydown, true)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-btn" @click="close">❌</span>
          <span>{{ t('feeSettingTitle') }}</span>
          <span class="modal-btn" @click="save">✔️</span>
        </div>

        <div class="modal-body">
          <div class="modal-form">
            <!-- 佣金费率 -->
            <div class="modal-input-group">
              <span class="input-label">{{ t('feeCommissionRate') }}</span>
              <input ref="firstInput" v-model="commissionRate" type="number" class="modal-input" step="0.1" />
              <span class="input-unit">{{ t('feeCommissionRateUnit') }}</span>
            </div>

            <!-- 最低佣金 -->
            <div class="modal-input-group">
              <span class="input-label">{{ t('feeMinCommission') }}</span>
              <input v-model="minCommission" type="number" class="modal-input" step="1" />
              <span class="input-unit">{{ t('feeMinCommissionUnit') }}</span>
            </div>

            <!-- 过户费 -->
            <div class="modal-input-group">
              <span class="input-label">{{ t('feeTransferRate') }}</span>
              <input v-model="transferFeeRate" type="number" class="modal-input" step="0.01" />
              <span class="input-unit">{{ t('feeTransferRateUnit') }}</span>
            </div>

            <!-- 印花税 -->
            <div class="modal-input-group">
              <span class="input-label">{{ t('feeStampTaxRate') }}</span>
              <input v-model="stampTaxRate" type="number" class="modal-input" step="0.1" />
              <span class="input-unit">{{ t('feeStampTaxRateUnit') }}</span>
            </div>

            <!-- 计算公式说明 -->
            <div class="formula-section">
              <div class="formula-item">{{ t('feeBuyFormula') }}</div>
              <div class="formula-item">{{ t('feeSellFormula') }}</div>
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
  min-width: 48px;
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
