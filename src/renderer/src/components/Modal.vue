<script setup lang="ts">
import { ref, nextTick } from 'vue'

const isVisible = ref(false)
const modalType = ref<'transaction' | 'add'>('transaction')
const modalTitle = ref('')
const modalMessage = ref('')
const tradePrice = ref(0)
const amount = ref(0)
let resolvePromise: ((value: any) => void) | null = null

const priceInput = ref<HTMLInputElement | null>(null)
const qtyInput = ref<HTMLInputElement | null>(null)

const open = (
  type: 'transaction' | 'add',
  title: string,
  message: string,
  defaults: { price?: number; amount?: number } = {}
) => {
  modalType.value = type
  modalTitle.value = title
  modalMessage.value = message
  tradePrice.value = defaults.price || 0
  amount.value = defaults.amount || 0
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
    amount: amount.value
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
            <div class="modal-input-group">
              <input 
                type="number" 
                v-model.number="tradePrice" 
                class="modal-input" 
                step="0.001"
                ref="priceInput"
                @keyup.enter="handleConfirm"
              />
              <label>{{ modalType === 'add' ? '初始成本' : '成交价格' }}</label>
            </div>
            <div class="modal-input-group">
              <input 
                type="number" 
                v-model.number="amount" 
                class="modal-input" 
                ref="qtyInput"
                @keyup.enter="handleConfirm"
              />
              <label>{{ modalType === 'add' ? '手数(1手=100股)' : '变动手数' }}</label>
            </div>

            <p v-if="modalMessage" class="modal-msg">{{ modalMessage }}</p>
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

@keyframes modalSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes modalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
