<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

type ToastType = 'info' | 'warn' | 'success' | 'fail' | 'alert'

interface ToastItem {
  message: string
  type: ToastType
  onClick?: () => void
}

const alertQueue = ref<ToastItem[]>([])
const currentAlert = ref<ToastItem | null>(null)
const isVisible = ref(false)
const msg = ref('')
const toastType = ref<ToastType>('info')
let timer: ReturnType<typeof setTimeout> | null = null

const show = (message: string, type: ToastType = 'info', duration = 2000, onClick?: () => void) => {
  // alert 类型加入队列
  if (type === 'alert') {
    alertQueue.value.push({ message, type, onClick })
    // 如果当前没有显示中的alert，开始显示队列
    if (!currentAlert.value) {
      showNextAlert()
    }
    return
  }

  // 其他类型直接显示
  msg.value = message
  toastType.value = type
  isVisible.value = true

  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    isVisible.value = false
  }, duration)
}

const showNextAlert = () => {
  if (alertQueue.value.length === 0) {
    currentAlert.value = null
    return
  }

  const nextAlert = alertQueue.value.shift()!
  currentAlert.value = nextAlert
  msg.value = nextAlert.message
  toastType.value = nextAlert.type
  isVisible.value = true
}

const handleClick = () => {
  if (toastType.value === 'alert') {
    if (currentAlert.value?.onClick) {
      currentAlert.value.onClick()
    }
    hide()
  }
}

const hide = () => {
  isVisible.value = false
  // 显示下一个alert
  setTimeout(() => {
    showNextAlert()
  }, 300) // 等待动画完成
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

defineExpose({ show, hide })

const icon = computed(() => {
  switch (toastType.value) {
    case 'success':
      return '✅'
    case 'fail':
      return '❌'
    case 'warn':
      return '⚠️'
    case 'alert':
      return '🔔'
    default:
      return 'ℹ️'
  }
})

const typeClass = computed(() => `toast-${toastType.value}`)
const queueInfo = computed(() =>
  alertQueue.value.length > 0 ? `(${alertQueue.value.length + 1})` : ''
)
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="isVisible"
        :class="['toast-container', typeClass, { 'toast-interactive': toastType === 'alert' }]"
        @click="handleClick"
      >
        <span class="toast-message"><span class="toast-icon">{{ icon }}</span>{{ msg }}</span>
        <span v-if="toastType === 'alert'" class="toast-queue">{{ queueInfo }}</span>
        <span v-if="toastType === 'alert'" class="toast-close">✕</span>
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 11000;
  pointer-events: none;
  font-size: 11px;
  font-weight: 500;
  color: white;
  max-width: 80vw;
  width: max-content;
}

.toast-message {
  white-space: normal;
  word-break: break-all;
  text-align: left;
  flex: 1;
  min-width: 0;
}

.toast-interactive {
  pointer-events: auto;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.toast-interactive:hover {
  transform: translateX(-50%) scale(1.02);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
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

.toast-alert {
  background-color: rgba(243, 156, 18, 0.85); /* Orange for alerts */
}

.toast-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.toast-close {
  margin-left: 8px;
  font-size: 10px;
  opacity: 0.7;
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
