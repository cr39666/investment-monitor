<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import Toast from '../components/Toast.vue'
import ToggleSwitch from '../components/ToggleSwitch.vue'
import { getLastMainView } from '../router'
import { appVersion as version, useUpdateCheck } from '../composables/useUpdateCheck'

const { t, locale } = useI18n()
const router = useRouter()
const { hasPendingUpdate, checkPendingUpdate } = useUpdateCheck()

const containerRef = ref<HTMLElement | null>(null)
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
let resizeObserver: ResizeObserver | null = null

const ballAlwaysOnTop = ref(true)
const windowAlwaysOnTop = ref(false)
const autoLaunch = ref(false)

// 悬浮球显示模式：'stock'=股票盈亏, 'gold'=黄金实时价, 'none'=不显示
const ballDisplayMode = ref('stock')

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
    'Tab',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'Insert',
    'Delete',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'F1',
    'F2',
    'F3',
    'F4',
    'F5',
    'F6',
    'F7',
    'F8',
    'F9',
    'F10',
    'F11',
    'F12',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Enter',
    'Backspace',
    'Space',
    'ContextMenu',
    'Pause',
    'PrintScreen'
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

const changeBallDisplayMode = (mode: string) => {
  ballDisplayMode.value = mode
  localStorage.setItem('ball_display_mode', mode)
}

// 拆分列（涨跌幅/总盈比/市值）— 多选数组
const splitColumns = ref<string[]>([])
const toggleSplitColumn = (col: string) => {
  if (splitColumns.value.includes(col)) {
    splitColumns.value = splitColumns.value.filter((c) => c !== col)
  } else {
    splitColumns.value.push(col)
  }
  localStorage.setItem('stock_splitColumns', JSON.stringify(splitColumns.value))
}

const showModules = ref<string[]>(['stock', 'gold', 'fund'])
const toggleModule = (module: string) => {
  if (showModules.value.includes(module)) {
    // 限制至少选中一个
    if (showModules.value.length <= 1) {
      toastRef.value?.show(t('selectionRequired'), 'warn')
      return
    }
    showModules.value = showModules.value.filter((m) => m !== module)
  } else {
    showModules.value.push(module)
  }
  localStorage.setItem('show_modules', JSON.stringify(showModules.value))
}

const goBack = () => {
  router.push(getLastMainView())
}

const goToAbout = () => {
  router.push('/about')
}

const changeLanguage = (lang: string) => {
  locale.value = lang
  localStorage.setItem('lang', lang)
  window.electron.ipcRenderer.send('set-language', lang)
}

const toggleAutoLaunch = async () => {
  autoLaunch.value = !autoLaunch.value
  window.electron.ipcRenderer.send('set-auto-launch', autoLaunch.value)
  localStorage.setItem('auto_launch', JSON.stringify(autoLaunch.value))
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
  const modeSaved = localStorage.getItem('ball_display_mode')
  if (modeSaved !== null) {
    ballDisplayMode.value = modeSaved
  }
  const moduleSaved = localStorage.getItem('show_modules')
  if (moduleSaved !== null) {
    try {
      const parsed = JSON.parse(moduleSaved)
      if (Array.isArray(parsed)) {
        showModules.value = parsed
      } else if (typeof parsed === 'boolean') {
        showModules.value = parsed ? ['stock', 'gold', 'fund'] : []
      }
    } catch {
      /* ignore */
    }
  } else {
    // fallback to old key
    const fundSaved = localStorage.getItem('show_fund')
    if (fundSaved !== null) {
      const parsed = JSON.parse(fundSaved)
      showModules.value = parsed ? ['stock', 'gold', 'fund'] : []
    }
  }
  const hotkeySaved = localStorage.getItem('global_hotkey')
  if (hotkeySaved !== null) {
    globalHotkey.value = hotkeySaved
  }

  // 加载拆分列配置（兼容旧布尔值格式）
  const splitSaved = localStorage.getItem('stock_splitColumns')
  if (splitSaved !== null) {
    try {
      const parsed = JSON.parse(splitSaved)
      if (Array.isArray(parsed)) {
        splitColumns.value = parsed
      } else if (parsed === true) {
        // 旧格式兼容：布尔 true 迁移为全选
        splitColumns.value = ['chg', 'pnl', 'val']
        localStorage.setItem('stock_splitColumns', JSON.stringify(splitColumns.value))
      }
    } catch {
      // 旧格式 'true'/'false' 字符串
      if (splitSaved === 'true') {
        splitColumns.value = ['chg', 'pnl', 'val']
        localStorage.setItem('stock_splitColumns', JSON.stringify(splitColumns.value))
      }
    }
  }

  // 初始化自启动状态：优先从系统读取实际状态
  try {
    const sysAutoLaunch = await window.electron.ipcRenderer.invoke('get-auto-launch')
    autoLaunch.value = sysAutoLaunch
    localStorage.setItem('auto_launch', JSON.stringify(sysAutoLaunch))
  } catch {
    const saved = localStorage.getItem('auto_launch')
    if (saved !== null) {
      autoLaunch.value = JSON.parse(saved)
    }
  }

  // 检测更新状态 (用于设置页下方的绿点提示)
  checkPendingUpdate()

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
    <DragHandle>
      <template #left>
        <button class="nav-btn" :title="t('goBack')" @click="goBack">⬅️</button>
      </template>
      <template #right>
        <button class="nav-btn" :title="t('about')" @click="goToAbout">ℹ️</button>
      </template>
    </DragHandle>
    <div class="setting-content">
      <div class="setting-item">
        <span class="label">{{ t('language') }}</span>
        <div class="lang-select">
          <span
            class="lang-option"
            :class="{ active: locale === 'default' }"
            @click="changeLanguage('default')"
            >{{ t('default') }}</span
          >
          <span class="lang-divider">|</span>
          <span class="lang-option" :class="{ active: locale === 'en' }" @click="changeLanguage('en')">{{
            t('english')
          }}</span>
          <span class="lang-divider">|</span>
          <span class="lang-option" :class="{ active: locale === 'zh' }" @click="changeLanguage('zh')">{{
            t('chinese')
          }}</span>
        </div>
      </div>
      <div class="setting-item">
        <span class="label">{{ t('alwaysOnTop') }}</span>
        <div class="lang-select">
          <span class="lang-option" :class="{ active: ballAlwaysOnTop }" @click="toggleBallAlwaysOnTop">{{
            t('topBall')
          }}</span>
          <span class="lang-divider">|</span>
          <span class="lang-option" :class="{ active: windowAlwaysOnTop }" @click="toggleWindowAlwaysOnTop">{{
            t('topWindow')
          }}</span>
        </div>
      </div>
      <div class="setting-item">
        <span class="label">{{ t('ballDisplayMode') }}</span>
        <div class="lang-select">
          <span
            class="lang-option"
            :class="{ active: ballDisplayMode === 'stock' }"
            @click="changeBallDisplayMode('stock')"
            >{{ t('ballModeStock') }}</span
          >
          <span class="lang-divider">|</span>
          <span
            class="lang-option"
            :class="{ active: ballDisplayMode === 'gold' }"
            @click="changeBallDisplayMode('gold')"
            >{{ t('ballModeGold') }}</span
          >
          <span class="lang-divider">|</span>
          <span
            class="lang-option"
            :class="{ active: ballDisplayMode === 'none' }"
            @click="changeBallDisplayMode('none')"
            >{{ t('ballModeNone') }}</span
          >
        </div>
      </div>
      <div class="setting-item">
        <span class="label">{{ t('showModules') }}</span>
        <div class="lang-select">
          <span
            class="lang-option"
            :class="{ active: showModules.includes('stock') }"
            @click="toggleModule('stock')"
            >{{ t('moduleStock') }}</span
          >
          <span class="lang-divider">|</span>
          <span
            class="lang-option"
            :class="{ active: showModules.includes('gold') }"
            @click="toggleModule('gold')"
            >{{ t('moduleGold') }}</span
          >
          <span class="lang-divider">|</span>
          <span
            class="lang-option"
            :class="{ active: showModules.includes('fund') }"
            @click="toggleModule('fund')"
            >{{ t('moduleFund') }}</span
          >
        </div>
      </div>
      <div class="setting-item">
        <span class="label">{{ t('splitColumns') }}</span>
        <div class="lang-select">
          <span
            class="lang-option"
            :class="{ active: splitColumns.includes('chg') }"
            @click="toggleSplitColumn('chg')"
            >{{ t('splitChg') }}</span
          >
          <span class="lang-divider">|</span>
          <span
            class="lang-option"
            :class="{ active: splitColumns.includes('pnl') }"
            @click="toggleSplitColumn('pnl')"
            >{{ t('splitPnl') }}</span
          >
          <span class="lang-divider">|</span>
          <span
            class="lang-option"
            :class="{ active: splitColumns.includes('val') }"
            @click="toggleSplitColumn('val')"
            >{{ t('splitVal') }}</span
          >
        </div>
      </div>
      <div class="setting-item">
        <span class="label">{{ t('autoLaunch') }}</span>
        <ToggleSwitch :active="autoLaunch" @toggle="toggleAutoLaunch" />
      </div>
      <div class="setting-item hotkey-item">
        <span class="label">{{ t('hotkeyLabel') }}</span>
        <div
          class="hotkey-display"
          :class="{ recording: isRecording, empty: !globalHotkey && !isRecording }"
          @click="startRecording"
        >
          <span v-if="isRecording">{{ t('pressKeys') }}</span>
          <span v-else-if="globalHotkey">{{ globalHotkey }}</span>
          <span v-else class="placeholder">{{ t('clickToSet') }}</span>
        </div>
      </div>
      <div class="setting-item version-item" @click="goToAbout">
        <span class="label">{{ t('appVersion') }}</span>
        <div class="version-display">
          v{{ version }}
          <span v-if="hasPendingUpdate" class="update-dot"></span>
        </div>
      </div>
    </div>
    <Toast ref="toastRef" />
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
  width: 260px;
  background-color: rgba(31, 34, 46, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4); /* 使阴影更聚拢以防止截断 */
  padding: 4px 12px 12px 12px;
  margin: 16px; /* 给阴影留出空间 */
  color: #eee;
  display: inline-block;
}

.nav-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
  opacity: 0.6;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover {
  opacity: 1;
  transform: scale(1.15);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.nav-btn:active {
  transform: scale(1.05);
}

.setting-content {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 6px;
  padding-top: 6px;
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

.version-item {
  cursor: pointer;
  transition: opacity 0.2s;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.version-item:hover {
  opacity: 0.8;
}

.version-display {
  position: relative;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  gap: 6px;
}

.update-dot {
  width: 6px;
  height: 6px;
  background-color: #2ecc71;
  border-radius: 50%;
  animation: dotPulse 2s ease-in-out infinite;
}

@keyframes dotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.3);
  }
}
</style>
