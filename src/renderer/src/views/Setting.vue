<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import DragHandle from '../components/DragHandle.vue'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const ballAlwaysOnTop = ref(true)
const windowAlwaysOnTop = ref(false)

// 快捷键设置
const globalHotkey = ref('Alt+Z')
const isRecording = ref(false)

const startRecording = () => {
  isRecording.value = true
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (!isRecording.value) return
  e.preventDefault()

  // 忽略单独的控制键
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  const modifiers: string[] = []
  if (e.ctrlKey) modifiers.push('Ctrl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')
  if (e.metaKey) modifiers.push('Command')

  const key = e.key.toUpperCase()
  const combination = [...modifiers, key].join('+')

  globalHotkey.value = combination
  isRecording.value = false

  localStorage.setItem('global_hotkey', combination)
  window.electron.ipcRenderer.send('set-global-hotkey', combination)
}

// 通用窗口尺寸同步
const syncWindowSize = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  // 增加 32px 的 buffer 用于容纳外阴影（上下左右各 16px）
  const width = Math.ceil(rect.width) + 32
  const height = Math.ceil(rect.height) + 32
  window.electron.ipcRenderer.send('resize-window', width, height)
}

const toggleBallAlwaysOnTop = () => {
  ballAlwaysOnTop.value = !ballAlwaysOnTop.value
  localStorage.setItem('ball_always_on_top', JSON.stringify(ballAlwaysOnTop.value))
  window.electron.ipcRenderer.send('set-always-on-top-config', {
    ball: ballAlwaysOnTop.value,
    window: windowAlwaysOnTop.value
  })
}

const toggleWindowAlwaysOnTop = () => {
  windowAlwaysOnTop.value = !windowAlwaysOnTop.value
  localStorage.setItem('window_always_on_top', JSON.stringify(windowAlwaysOnTop.value))
  window.electron.ipcRenderer.send('set-always-on-top-config', {
    ball: ballAlwaysOnTop.value,
    window: windowAlwaysOnTop.value
  })
}

const goBack = () => {
  router.push('/main-list')
}

const goToAbout = () => {
  router.push('/about')
}

onMounted(async () => {
  // 加载配置
  const ballSaved = localStorage.getItem('ball_always_on_top')
  if (ballSaved !== null) {
    ballAlwaysOnTop.value = JSON.parse(ballSaved)
  }
  const windowSaved = localStorage.getItem('window_always_on_top')
  if (windowSaved !== null) {
    windowAlwaysOnTop.value = JSON.parse(windowSaved)
  }
  const hotkeySaved = localStorage.getItem('global_hotkey')
  if (hotkeySaved !== null) {
    globalHotkey.value = hotkeySaved
  }

  window.addEventListener('keydown', handleKeyDown)

  await nextTick()
  if (containerRef.value) {
    syncWindowSize()
    setTimeout(syncWindowSize, 300)
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncWindowSize)
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div ref="containerRef" class="setting-container">
    <DragHandle />
    <div class="setting-header">
      <span class="back-icon" title="Back to list" @click="goBack">⬅️</span>
      <span class="title">Settings</span>
      <span class="about-icon" title="About" @click="goToAbout">ℹ️</span>
    </div>
    <div class="divider"></div>
    <div class="setting-content">
      <div class="setting-item">
        <span class="label">Ball Always on Top</span>
        <div class="switch" :class="{ active: ballAlwaysOnTop }" @click="toggleBallAlwaysOnTop">
          <div class="handle"></div>
        </div>
      </div>
      <div class="setting-item">
        <span class="label">Window Always on Top</span>
        <div class="switch" :class="{ active: windowAlwaysOnTop }" @click="toggleWindowAlwaysOnTop">
          <div class="handle"></div>
        </div>
      </div>
      <div class="setting-item hotkey-item">
        <span class="label">Toggle Window Hotkey</span>
        <div class="hotkey-display" :class="{ recording: isRecording }" @click="startRecording">
          {{ isRecording ? 'Press keys...' : globalHotkey }}
        </div>
      </div>
      <div class="setting-item">
        <span class="label">Other settings are under development ...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hotkey-display {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  min-width: 60px;
  text-align: center;
  transition: all 0.2s;
}

.hotkey-display:hover {
  background: rgba(255, 255, 255, 0.1);
}

.hotkey-display.recording {
  background: rgba(231, 76, 60, 0.2);
  border-color: #e74c3c;
  color: #e74c3c;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}

.setting-container {
  width: 250px;
  background-color: rgba(31, 34, 46, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4); /* 使阴影更聚拢以防止截断 */
  padding: 0 12px 12px 12px;
  margin: 16px; /* 给阴影留出空间 */
  color: #eee;
  display: inline-block;
}

.setting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
}

.back-icon {
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

.back-icon:hover {
  opacity: 0.7;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
}

.about-icon {
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

.about-icon:hover {
  opacity: 0.7;
}

.placeholder {
  width: 14px;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin-bottom: 12px;
}

.setting-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-size: 12px;
  color: #ccc;
}

.switch {
  width: 32px;
  height: 18px;
  background: #444;
  border-radius: 9px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
}

.switch.active {
  background: #2ecc71;
}

.handle {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.3s;
}

.switch.active .handle {
  transform: translateX(14px);
}
</style>
