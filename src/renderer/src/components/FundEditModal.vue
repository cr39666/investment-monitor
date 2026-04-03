<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export interface FundEditResult {
  code: string
  cost: number
  shares: number
  buyDate?: string
  isNew: boolean
}

const visible = ref(false)
const editCode = ref('')
const editCost = ref(0)
const editShares = ref(0)
const editName = ref('')
const editBuyDate = ref('')
const editIsNew = ref(true)
const costInput = ref<HTMLInputElement | null>(null)

let resolvePromise: ((result: FundEditResult | null) => void) | null = null

/**
 * 打开编辑弹窗，返回 Promise
 * resolve FundEditResult 表示确认，null 表示取消
 */
const open = (
  code: string,
  name: string,
  cost: number,
  shares: number,
  buyDate: string,
  isNew: boolean
): Promise<FundEditResult | null> => {
  editCode.value = code
  editName.value = name
  editCost.value = cost
  editShares.value = shares
  editBuyDate.value = buyDate
  editIsNew.value = isNew
  visible.value = true

  nextTick(() => {
    costInput.value?.focus()
    costInput.value?.select()
  })

  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  visible.value = false
  resolvePromise?.({
    code: editCode.value,
    cost: editCost.value,
    shares: editShares.value,
    buyDate: editBuyDate.value || undefined,
    isNew: editIsNew.value
  })
  resolvePromise = null
}

const handleCancel = () => {
  visible.value = false
  resolvePromise?.(null)
  resolvePromise = null
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="edit-overlay" @click.self="handleCancel">
      <div class="edit-modal">
        <div class="edit-header">
          <span class="edit-cancel" @click="handleCancel">❌</span>
          <span class="edit-title">{{
            editIsNew ? t('addFundPosition') : t('editFundPosition')
          }}</span>
          <span class="edit-confirm" @click="handleConfirm">✅</span>
        </div>
        <div class="edit-body">
          <div class="edit-name">{{ editName }}</div>
          <div class="edit-row">
            <label>{{ t('fundCostNav') }}</label>
            <input 
              v-model.number="editCost" 
              type="number" 
              step="0.0001" 
              class="edit-input" 
              ref="costInput"
              @keyup.enter="handleConfirm"
            />
          </div>
          <div class="edit-row">
            <label>{{ t('fundShares') }}</label>
            <input v-model.number="editShares" type="number" step="100" class="edit-input" @keyup.enter="handleConfirm" />
          </div>
          <div class="edit-row">
            <label>{{ t('fundBuyDate') }}</label>
            <input v-model="editBuyDate" type="date" class="edit-input date-input" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.edit-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: editFadeIn 0.2s ease-out;
}
.edit-modal {
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  width: 220px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: editSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: bold;
  padding-bottom: 8px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.edit-title {
  flex: 1;
  text-align: center;
}
.edit-cancel,
.edit-confirm {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
  font-size: 14px;
}
.edit-cancel:hover,
.edit-confirm:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
.edit-body {
  padding: 8px 6px 0 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.edit-body::-webkit-scrollbar {
  width: 4px;
}
.edit-body::-webkit-scrollbar-track {
  background: transparent;
}
.edit-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}
.edit-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
.edit-name {
  font-size: 12px;
  color: #aaa;
  text-align: center;
  margin-bottom: 8px;
}
.edit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.edit-row label {
  font-size: 11px;
  color: #ccc;
}
.edit-input {
  width: 100px;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #3a3d4a;
  background-color: #2f3241;
  color: white;
  outline: none;
  text-align: right;
}
.edit-input::-webkit-outer-spin-button,
.edit-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.edit-input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}
.date-input {
  font-size: 11px;
  color-scheme: dark;
}

@keyframes editSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes editFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
