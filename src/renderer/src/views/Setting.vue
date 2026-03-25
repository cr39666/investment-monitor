<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import ToggleSwitch from '../components/ToggleSwitch.vue'

const { t, locale } = useI18n()
const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const ballAlwaysOnTop = ref(true)
const windowAlwaysOnTop = ref(false)
const showBallPnl = ref(true)

// 快捷键设置
const globalHotkey = ref('')
const isRecording = ref(false)

const startRecording = () => {
  isRecording.value = true
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (!isRecording.value) return
  e.preventDefault()

  // Escape 清除快捷键
  if (e.key === 'Escape') {
    globalHotkey.value = ''
    isRecording.value = false
    localStorage.setItem('global_hotkey', '')
    window.electron.ipcRenderer.send('set-global-hotkey', '')
    return
  }

  // 忽略单独的控制键
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  // 忽略不适合作为快捷键的按键
  const ignoredKeys = [
    'Tab', 'CapsLock', 'NumLock', 'ScrollLock',
    'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Enter', 'Backspace', 'Space',
    'ContextMenu', 'Pause', 'PrintScreen'
  ]
  if (ignoredKeys.includes(e.key)) return

  // 必须包含至少一个修饰键
  if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return

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

const toggleShowBallPnl = () => {
  showBallPnl.value = !showBallPnl.value
  localStorage.setItem('show_ball_pnl', JSON.stringify(showBallPnl.value))
}

const goBack = () => {
  router.push('/')
}

const goToAbout = () => {
  router.push('/about')
}

const changeLanguage = (lang: string) => {
  locale.value = lang
  localStorage.setItem('lang', lang)
  window.electron.ipcRenderer.send('set-language', lang)
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
  const pnlSaved = localStorage.getItem('show_ball_pnl')
  if (pnlSaved !== null) {
    showBallPnl.value = JSON.parse(pnlSaved)
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
      <span class="back-icon" :title="t('backToList')" @click="goBack">⬅️</span>
      <span class="title">{{ t('settings') }}</span>
      <span class="about-icon" :title="t('about')" @click="goToAbout">ℹ️</span>
    </div>
    <div class="divider"></div>
    <div class="setting-content">
      <div class="setting-item">
        <span class="label">{{ t('ballAlwaysOnTop') }}</span>
        <ToggleSwitch :active="ballAlwaysOnTop" @toggle="toggleBallAlwaysOnTop" />
      </div>
      <div class="setting-item">
        <span class="label">{{ t('windowAlwaysOnTop') }}</span>
        <ToggleSwitch :active="windowAlwaysOnTop" @toggle="toggleWindowAlwaysOnTop" />
      </div>
      <div class="setting-item">
        <span class="label">{{ t('showBallPnl') }}</span>
        <ToggleSwitch :active="showBallPnl" @toggle="toggleShowBallPnl" />
      </div>
      <div class="setting-item hotkey-item">
        <span class="label">{{ t('hotkeyLabel') }}</span>
        <div class="hotkey-display" :class="{ recording: isRecording, empty: !globalHotkey && !isRecording }" @click="startRecording">
          <span v-if="isRecording">{{ t('pressKeys') }}</span>
          <span v-else-if="globalHotkey">{{ globalHotkey }}</span>
          <span v-else class="placeholder">{{ t('clickToSet') }}</span>
        </div>
      </div>
      <div class="setting-item">
        <span class="label">{{ t('language') }}</span>
        <div class="lang-select">
          <span class="lang-option" :class="{ active: locale === 'default' }" @click="changeLanguage('default')">{{ t('default') }}</span>
          <span class="lang-divider">|</span>
          <span class="lang-option" :class="{ active: locale === 'en' }" @click="changeLanguage('en')">{{ t('english') }}</span>
          <span class="lang-divider">|</span>
          <span class="lang-option" :class="{ active: locale === 'zh' }" @click="changeLanguage('zh')">{{ t('chinese') }}</span>
        </div>
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
  min-height: 26px;
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

.hotkey-display.empty .placeholder {
  color: rgba(255, 255, 255, 0.4);
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

.lang-select {
  display: flex;
  align-items: center;
  font-size: 11px;
}

.lang-option {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  transition: color 0.2s;
}

.lang-option:hover {
  color: rgba(255, 255, 255, 0.8);
}

.lang-option.active {
  color: #2ecc71;
}

.lang-divider {
  margin: 0 6px;
  color: rgba(255, 255, 255, 0.3);
}
</style>
