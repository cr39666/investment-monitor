<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DragHandle from '../components/DragHandle.vue'
import Toast from '../components/Toast.vue'
import ToggleSwitch from '../components/ToggleSwitch.vue'
import FeeSettingModal from '../components/FeeSettingModal.vue'
import GoldFeeSettingModal from '../components/GoldFeeSettingModal.vue'
import ColumnOrderModal from '../components/ColumnOrderModal.vue'
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

// 手续费设置弹框
const showFeeModal = ref(false)
const showGoldFeeModal = ref(false)

// 列顺序设置弹框
const showColumnOrderModal = ref(false)
const columnOrderType = ref<'stock' | 'fund'>('stock')
const openColumnOrderModal = (type: 'stock' | 'fund') => {
  columnOrderType.value = type
  showColumnOrderModal.value = true
}

// 分组折叠状态（默认全部折叠）
type GroupKey = 'general' | 'display' | 'trade'
const expandedGroups = ref<Record<GroupKey, boolean>>({
  general: false,
  display: false,
  trade: false
})
const toggleGroup = (key: GroupKey) => {
  expandedGroups.value[key] = !expandedGroups.value[key]
  localStorage.setItem('setting_expanded_groups', JSON.stringify(expandedGroups.value))
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

  // 加载分组展开状态（默认折叠）
  const groupsSaved = localStorage.getItem('setting_expanded_groups')
  if (groupsSaved !== null) {
    try {
      const parsed = JSON.parse(groupsSaved)
      if (parsed && typeof parsed === 'object') {
        expandedGroups.value = { ...expandedGroups.value, ...parsed }
      }
    } catch {
      /* ignore */
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
      <!-- 通用 -->
      <div class="setting-group" :class="{ collapsed: !expandedGroups.general }">
        <div class="group-title" @click="toggleGroup('general')">
          <span class="group-arrow" :class="{ open: expandedGroups.general }">▶</span>
          <span>{{ t('groupGeneral') }}</span>
        </div>
        <div v-show="expandedGroups.general" class="setting-item">
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
        <div v-show="expandedGroups.general" class="setting-item">
          <span class="label">{{ t('autoLaunch') }}</span>
          <ToggleSwitch :active="autoLaunch" @toggle="toggleAutoLaunch" />
        </div>
        <div v-show="expandedGroups.general" class="setting-item hotkey-item">
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
      </div>

      <!-- 显示 -->
      <div class="setting-group" :class="{ collapsed: !expandedGroups.display }">
        <div class="group-title" @click="toggleGroup('display')">
          <span class="group-arrow" :class="{ open: expandedGroups.display }">▶</span>
          <span>{{ t('groupDisplay') }}</span>
        </div>
        <!-- 1. 置顶显示 -->
        <div v-show="expandedGroups.display" class="setting-item">
          <span class="label">{{ t('alwaysOnTop') }}</span>
          <div class="lang-select">
            <span class="lang-option" :class="{ active: ballAlwaysOnTop }" @click="toggleBallAlwaysOnTop">{{
              t('topBall')
            }}</span>
            <span class="lang-divider">|</span>
            <span
              class="lang-option"
              :class="{ active: windowAlwaysOnTop }"
              @click="toggleWindowAlwaysOnTop"
              >{{ t('topWindow') }}</span
            >
          </div>
        </div>
        <!-- 2. 悬浮球金额（原"悬浮球"分组合并而来） -->
        <div v-show="expandedGroups.display" class="setting-item">
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
        <!-- 3. 模块显示 -->
        <div v-show="expandedGroups.display" class="setting-item">
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
      </div>

      <!-- 操作 -->
      <div class="setting-group" :class="{ collapsed: !expandedGroups.trade }">
        <div class="group-title" @click="toggleGroup('trade')">
          <span class="group-arrow" :class="{ open: expandedGroups.trade }">▶</span>
          <span>{{ t('groupOperation') }}</span>
        </div>
        <!-- 列表列自定义（弹窗内拖拽列顺序 + 切换拆分列） -->
        <div v-show="expandedGroups.trade" class="setting-item">
          <span class="label">{{ t('columnCustomize') }}</span>
          <div class="lang-select">
            <span class="lang-option fee-link" @click="openColumnOrderModal('stock')">{{
              t('columnOrderStock')
            }}</span>
            <span class="lang-divider">|</span>
            <span class="lang-option fee-link" @click="openColumnOrderModal('fund')">{{
              t('columnOrderFund')
            }}</span>
          </div>
        </div>
        <div v-show="expandedGroups.trade" class="setting-item">
          <span class="label">{{ t('feeSetting') }}</span>
          <div class="lang-select">
            <span class="lang-option fee-link" @click="showFeeModal = true">{{ t('moduleStock') }}</span>
            <span class="lang-divider">|</span>
            <span class="lang-option fee-link" @click="showGoldFeeModal = true">{{ t('moduleGold') }}</span>
            <span class="lang-divider">|</span>
            <span
              class="lang-option fee-disabled"
              @click="toastRef?.show(t('fundFeeNotSupported'), 'info')"
              >{{ t('moduleFund') }}</span
            >
          </div>
        </div>
      </div>
    </div>
    <!-- 版本号：放在可滚动内容外，常驻底部 -->
    <div class="setting-item version-item" @click="goToAbout">
      <span class="label">{{ t('appVersion') }}</span>
      <div class="version-display">
        v{{ version }}
        <span v-if="hasPendingUpdate" class="update-dot"></span>
      </div>
    </div>
    <Toast ref="toastRef" />
    <FeeSettingModal :show="showFeeModal" @close="showFeeModal = false" />
    <GoldFeeSettingModal :show="showGoldFeeModal" @close="showGoldFeeModal = false" />
    <ColumnOrderModal
      :show="showColumnOrderModal"
      :type="columnOrderType"
      @close="showColumnOrderModal = false"
    />
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
  width: 270px;
  background-color: rgba(31, 34, 46, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4); /* 使阴影更聚拢以防止截断 */
  padding: 4px 8px 10px;
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
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  /* 给滚动条留出空间，避免覆盖右侧内容 */
  padding-right: 4px;
  margin-right: -4px;
}

/* 自定义滚动条样式，与整体毛玻璃风格一致 */
.setting-content::-webkit-scrollbar {
  width: 6px;
}

.setting-content::-webkit-scrollbar-track {
  background: transparent;
}

.setting-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.setting-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 6px 8px 6px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  transition: padding 0.2s ease;
}

.setting-group.collapsed {
  padding: 6px 8px;
  gap: 0;
}

.group-title {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
  transition:
    color 0.2s,
    border-color 0.2s,
    padding-bottom 0.2s;
}

.group-title:hover {
  color: rgba(255, 255, 255, 0.7);
}

.setting-group.collapsed .group-title {
  padding-bottom: 0;
  border-bottom-color: transparent;
}

.group-arrow {
  display: inline-block;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.35);
  transform: rotate(0deg);
  transition: transform 0.2s ease;
}

.group-arrow.open {
  transform: rotate(90deg);
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

.fee-link {
  color: #2ecc71 !important;
  cursor: pointer;
}

.fee-link:hover {
  text-decoration: underline;
}

.fee-disabled {
  color: rgba(255, 255, 255, 0.25) !important;
  cursor: not-allowed;
}

.fee-disabled:hover {
  color: rgba(255, 255, 255, 0.45) !important;
}

.version-item {
  cursor: pointer;
  transition: opacity 0.2s;
  padding-top: 6px;
  margin-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
