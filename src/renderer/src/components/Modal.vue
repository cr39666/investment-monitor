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
        <div class="modal-header">{{ modalTitle }}</div>
        <div class="modal-body">
          <p v-if="modalMessage" class="modal-msg">{{ modalMessage }}</p>
          
          <div class="modal-form">
            <div class="modal-input-group">
              <label>{{ modalType === 'add' ? '初始成本' : '成交价格' }}</label>
              <input 
                type="number" 
                v-model.number="tradePrice" 
                class="modal-input" 
                step="0.001"
                ref="priceInput"
                @keyup.enter="handleConfirm"
              />
            </div>
            <div class="modal-input-group">
              <label>{{ modalType === 'add' ? '持仓手数 (1手=100股)' : '变动手数 (正加负减)' }}</label>
              <input 
                type="number" 
                v-model.number="amount" 
                class="modal-input" 
                ref="qtyInput"
                @keyup.enter="handleConfirm"
              />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel-btn" @click="handleCancel">取消</button>
          <button class="modal-btn confirm-btn" @click="handleConfirm">确定</button>
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
  background-color: rgba(0, 0, 0, 0.7);
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
  border-radius: 12px;
  width: 260px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-header {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #fff;
  text-align: center;
}

.modal-msg {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 15px;
  text-align: center;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.modal-input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.modal-input-group label {
  font-size: 11px;
  color: #888;
}

.modal-input {
  background-color: #242736;
  border: 1px solid #3a3d4a;
  border-radius: 6px;
  color: #fff;
  padding: 8px 10px;
  outline: none;
  font-size: 14px;
}

.modal-input:focus {
  border-color: #2ecc71; /* 使用应用绿 */
  background-color: #2a2e42;
}

.modal-footer {
  display: flex;
  gap: 10px;
}

.modal-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #3a3d4a;
  transition: all 0.2s;
}

.cancel-btn {
  background-color: transparent;
  color: #aaa;
}

.cancel-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.confirm-btn {
  background-color: #2ecc71;
  border-color: #2ecc71;
  color: #fff;
}

.confirm-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
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
