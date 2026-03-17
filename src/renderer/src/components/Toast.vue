<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

type ToastType = 'info' | 'warn' | 'success' | 'fail'

const isVisible = ref(false)
const msg = ref('')
const toastType = ref<ToastType>('info')
let timer: ReturnType<typeof setTimeout> | null = null

const show = (message: string, type: ToastType = 'info', duration = 2000) => {
  msg.value = message
  toastType.value = type
  isVisible.value = true

  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    isVisible.value = false
  }, duration)
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

defineExpose({ show })

const icon = computed(() => {
  switch (toastType.value) {
    case 'success': return '✅'
    case 'fail': return '❌'
    case 'warn': return '⚠️'
    default: return 'ℹ️'
  }
})

const typeClass = computed(() => `toast-${toastType.value}`)
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="isVisible" :class="['toast-container', typeClass]">
        <span class="toast-icon">{{ icon }}</span>
        <span class="toast-message">{{ msg }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px;
  border-radius: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 11000;
  pointer-events: none;
  font-size: 13px;
  font-weight: 500;
  color: white;
}

.toast-info {
  background-color: rgba(128, 128, 128, 0.85); /* Gray */
}

.toast-success {
  background-color: rgba(46, 204, 113, 0.85); /* Green */
}

.toast-warn {
  background-color: rgba(241, 196, 15, 0.85); /* Yellow/Orange */
  color: #333;
}

.toast-fail {
  background-color: rgba(231, 76, 60, 0.85); /* Red */
}

.toast-icon {
  font-size: 14px;
}

/* Animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
