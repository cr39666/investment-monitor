<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let resolvePromise: ((value: boolean) => void) | null = null

const handleKeydown = (e: KeyboardEvent) => {
  if (!isVisible.value) return
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    handleConfirm()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    handleCancel()
  }
}

const open = (title: string, message: string) => {
  confirmTitle.value = title
  confirmMessage.value = message
  isVisible.value = true
  // 使用 capture 以便先于其他全局快捷键响应
  window.addEventListener('keydown', handleKeydown, true)

  return new Promise<boolean>((resolve) => {
    resolvePromise = resolve
  })
}

const close = () => {
  isVisible.value = false
  window.removeEventListener('keydown', handleKeydown, true)
}

const handleConfirm = () => {
  close()
  resolvePromise?.(true)
}

const handleCancel = () => {
  close()
  resolvePromise?.(false)
}

// 兜底：组件卸载时（例如父级路由切换且弹窗未关闭），
// 移除全局 keydown 监听并 resolve 永挂的 promise，避免闭包泄漏
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
  if (resolvePromise) {
    resolvePromise(false)
    resolvePromise = null
  }
})

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="confirm-overlay" @click.self="handleCancel">
      <div class="confirm-content">
        <div class="confirm-header">
          <span class="confirm-btn-icon cancel" :title="t('cancel')" @click="handleCancel">❌</span>
          <span class="confirm-title">{{ confirmTitle }}</span>
          <span class="confirm-btn-icon confirm" :title="t('confirm')" @click="handleConfirm">✅</span>
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
  padding: 6px 10px;
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
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes confirmFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
