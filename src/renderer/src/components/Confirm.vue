<script setup lang="ts">
import { ref } from 'vue'

const isVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let resolvePromise: ((value: boolean) => void) | null = null

const open = (title: string, message: string) => {
  confirmTitle.value = title
  confirmMessage.value = message
  isVisible.value = true
  
  return new Promise<boolean>((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  isVisible.value = false
  resolvePromise?.(true)
}

const handleCancel = () => {
  isVisible.value = false
  resolvePromise?.(false)
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="confirm-overlay" @click.self="handleCancel">
      <div class="confirm-content">
        <div class="confirm-header">{{ confirmTitle }}</div>
        <div class="confirm-body">
          <p class="confirm-msg">{{ confirmMessage }}</p>
        </div>
        <div class="confirm-footer">
          <button class="confirm-btn-base cancel-btn" @click="handleCancel">取消</button>
          <button class="confirm-btn-base confirm-btn" @click="handleConfirm">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
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
  z-index: 10000; /* 确保在 Modal 之上或同级 */
  animation: confirmFadeIn 0.2s ease-out;
}

.confirm-content {
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: 240px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: confirmSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.confirm-header {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #fff;
  text-align: center;
}

.confirm-msg {
  font-size: 13px;
  color: #ccc;
  margin-bottom: 20px;
  text-align: center;
  line-height: 1.5;
}

.confirm-footer {
  display: flex;
  gap: 10px;
}

.confirm-btn-base {
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
  color: #fff;
}

.confirm-btn {
  background-color: #ff4d4f; /* 删除确认通常用红色 */
  border-color: #ff4d4f;
  color: #fff;
}

.confirm-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

@keyframes confirmSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes confirmFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
