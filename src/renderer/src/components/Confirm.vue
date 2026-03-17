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
        <div class="confirm-header">
          <span class="confirm-btn-icon cancel" @click="handleCancel" title="取消">❌</span>
          <span class="confirm-title">{{ confirmTitle }}</span>
          <span class="confirm-btn-icon confirm" @click="handleConfirm" title="确定">✅</span>
        </div>
        <div class="confirm-body">
          <p class="confirm-msg">{{ confirmMessage }}</p>
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
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: confirmFadeIn 0.2s ease-out;
}

.confirm-content {
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  width: 220px;
  padding: 8px 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: confirmSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.confirm-header {
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

.confirm-btn-icon {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 14px;
}

.confirm-btn-icon:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.confirm-msg {
  font-size: 11px;
  color: #ccc;
  text-align: center;
  line-height: 1.5;
  margin: 4px 0;
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
