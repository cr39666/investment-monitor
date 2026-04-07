<script setup lang="ts">
import DragHandle from '../components/DragHandle.vue'
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()

// @ts-ignore
import pkg from '../../../../package.json'
const version = pkg.version

const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const backToBall = () => {
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/ball')
}

const backToSetting = () => {
  router.push('/setting')
}

// === 更新逻辑 ===
const updateStatus = ref<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle')
const updateMessage = ref('')
const downloadProgress = ref(0)
const versionInfo = ref('')
const releaseNotes = ref('')
const showUpdateDialog = ref(false)
const hasPendingUpdate = ref(false)

// 点击版本号
const onVersionClick = () => {
  if (hasPendingUpdate.value) {
    // 有待更新 → 显示 release notes + 确认下载弹窗
    showUpdateDialog.value = true
  } else {
    // 没有待更新 → 手动检查
    checkForUpdates()
  }
}

const checkForUpdates = () => {
  if (updateStatus.value === 'checking' || updateStatus.value === 'downloading') return
  updateStatus.value = 'checking'
  updateMessage.value = t('checking')
  window.electron.ipcRenderer.send('check-for-update')
}

// 用户确认下载
const confirmDownload = () => {
  showUpdateDialog.value = false
  window.electron.ipcRenderer.send('download-update')
  updateStatus.value = 'downloading'
  updateMessage.value = t('downloading')
}

const dismissUpdate = () => {
  showUpdateDialog.value = false
}

const installUpdate = () => {
  window.electron.ipcRenderer.send('quit-and-install')
}

// 格式化 release notes（Markdown → 结构化数组）
interface ReleaseNoteLine {
  type: 'h2' | 'h3' | 'h4' | 'li' | 'p'
  text: string
}

const parseReleaseNotes = (notes: string): ReleaseNoteLine[] => {
  if (!notes) return []
  return notes
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      if (line.startsWith('### ')) return { type: 'h4' as const, text: line.slice(4) }
      if (line.startsWith('## ')) return { type: 'h3' as const, text: line.slice(3) }
      if (line.startsWith('# ')) return { type: 'h2' as const, text: line.slice(2) }
      if (line.startsWith('- ') || line.startsWith('* '))
        return { type: 'li' as const, text: line.slice(2) }
      return { type: 'p' as const, text: line }
    })
}

// 通用窗口尺寸同步：测量容器实际尺寸并通知主进程
const syncWindowSize = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  // 增加到 4px 的 buffer，确保投影和边框在各种缩放倍率下都不被裁切
  const width = Math.ceil(rect.width) + 4
  const height = Math.ceil(rect.height) + 4
  window.electron.ipcRenderer.send('resize-window', width, height)
}

const isNewerVersion = (newVer: string, oldVer: string): boolean => {
  if (!newVer || !oldVer) return false
  const v1Parts = newVer.split('.').map(Number)
  const v2Parts = oldVer.split('.').map(Number)
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1 = v1Parts[i] || 0
    const v2 = v2Parts[i] || 0
    if (v1 > v2) return true
    if (v1 < v2) return false
  }
  return false
}

onMounted(async () => {
  // 读取启动时检测到的更新信息
  const pendingRaw = localStorage.getItem('pending_update')
  if (pendingRaw) {
    try {
      const pending = JSON.parse(pendingRaw)
      if (pending.version && isNewerVersion(pending.version, version)) {
        hasPendingUpdate.value = true
        versionInfo.value = pending.version || ''
        releaseNotes.value = pending.releaseNotes || ''
      } else {
        // 如果版本已经一致或更低，清理缓存，不显示绿点
        localStorage.removeItem('pending_update')
        hasPendingUpdate.value = false
      }
    } catch {
      localStorage.removeItem('pending_update')
    }
  }

  // 监听更新事件 — update-available 不再自动下载
  window.electron.ipcRenderer.on('update-available', (_event, info: any) => {
    updateStatus.value = 'available'
    hasPendingUpdate.value = true
    versionInfo.value = info?.version || ''
    updateMessage.value = ''
    if (info?.releaseNotes) {
      if (typeof info.releaseNotes === 'string') {
        releaseNotes.value = info.releaseNotes
      } else if (Array.isArray(info.releaseNotes)) {
        releaseNotes.value = info.releaseNotes.map((n: any) => n.note).join('\n')
      }
    }
    // 弹出确认弹窗
    showUpdateDialog.value = true
  })

  window.electron.ipcRenderer.on('update-not-available', () => {
    updateStatus.value = 'idle'
    updateMessage.value = t('upToDate')
    setTimeout(() => {
      if (updateStatus.value === 'idle') updateMessage.value = ''
    }, 3000)
  })

  window.electron.ipcRenderer.on('update-error', (_event, err) => {
    updateStatus.value = 'idle'
    updateMessage.value = typeof err === 'string' ? err : t('updateError')
    setTimeout(() => {
      if (updateStatus.value === 'idle') updateMessage.value = ''
    }, 3000)
  })

  window.electron.ipcRenderer.on('download-progress', (_event, progressObj: any) => {
    updateStatus.value = 'downloading'
    downloadProgress.value = Math.round(progressObj.percent || 0)
    updateMessage.value = `Downloading... ${downloadProgress.value}%`
  })

  window.electron.ipcRenderer.on('update-downloaded', (_event, info: any) => {
    updateStatus.value = 'ready'
    updateMessage.value = t('readyToInstall')
    hasPendingUpdate.value = false
    localStorage.removeItem('pending_update')
    // 提取 release notes（如果 update-available 中没有）
    if (!releaseNotes.value && info?.releaseNotes) {
      if (typeof info.releaseNotes === 'string') {
        releaseNotes.value = info.releaseNotes
      } else if (Array.isArray(info.releaseNotes)) {
        releaseNotes.value = info.releaseNotes.map((n: any) => n.note).join('\n')
      }
    }
  })

  // 等待 Vue DOM 更新完毕后再测量
  await nextTick()

  // 监听内容高度变化并调整窗口大小
  if (containerRef.value) {
    // 1. nextTick 之后立即同步一次窗口尺寸
    syncWindowSize()

    // 2. 延迟再同步一次，作为安全网
    setTimeout(syncWindowSize, 300)
    resizeObserver = new ResizeObserver(() => {
      // 使用 rAF 确保在浏览器完成布局/绘制后再读取尺寸
      requestAnimationFrame(syncWindowSize)
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  window.electron.ipcRenderer.removeAllListeners('update-available')
  window.electron.ipcRenderer.removeAllListeners('update-not-available')
  window.electron.ipcRenderer.removeAllListeners('update-error')
  window.electron.ipcRenderer.removeAllListeners('download-progress')
  window.electron.ipcRenderer.removeAllListeners('update-downloaded')
})
</script>

<template>
  <div ref="containerRef" class="about-container">
    <DragHandle>
      <template #left>
        <button class="nav-btn" :title="t('goBack')" @click="backToSetting">⬅️</button>
      </template>
    </DragHandle>
    <div class="main">
      <img
        alt="logo"
        class="logo"
        src="../assets/electron.svg"
        :title="t('clickToShrink')"
        @click="backToBall"
      />
      <div class="text">
        <span class="vue">{{ t('investment') }}</span>
        {{ t('monitor') }}
        <span class="ts">Croyell</span>
        {{ t('designedBy') }}
      </div>
    </div>
    <div class="version-container">
      <span
        class="app-version"
        :class="{ 'has-update': hasPendingUpdate }"
        :title="t('checkUpdates')"
        @click="onVersionClick"
      >
        v{{ version }}
        <span class="update-icon">↻</span>
        <span v-if="hasPendingUpdate" class="update-dot"></span>
      </span>
      <div
        v-if="updateMessage || updateStatus === 'downloading' || updateStatus === 'ready'"
        class="update-section"
      >
        <span v-if="updateMessage" class="update-msg">{{ updateMessage }}</span>
        <span
          v-if="versionInfo && (updateStatus === 'downloading' || updateStatus === 'ready')"
          class="version-badge"
          >v{{ versionInfo }}</span
        >
        <button v-if="updateStatus === 'ready'" class="install-btn" @click="installUpdate">
          {{ t('install') }}
        </button>
      </div>

      <!-- 更新确认弹窗（含 release notes） -->
      <div v-if="showUpdateDialog" class="release-notes-overlay" @click.self="dismissUpdate">
        <div class="release-notes-modal">
          <div class="release-notes-header">
            <span class="dismiss-btn" @click="dismissUpdate">✕</span>
            <span>{{ t('whatsNew') }} {{ versionInfo ? 'v' + versionInfo : '' }}</span>
            <span class="confirm-btn" :title="t('confirmUpdate')" @click="confirmDownload">✅</span>
          </div>
          <div v-if="releaseNotes" class="release-notes-content">
            <template v-for="(line, i) in parseReleaseNotes(releaseNotes)" :key="i">
              <component :is="'h' + line.type.slice(1)" v-if="line.type.startsWith('h')">
                {{ line.text }}
              </component>
              <li v-else-if="line.type === 'li'">{{ line.text }}</li>
              <p v-else>{{ line.text }}</p>
            </template>
          </div>
          <div v-else class="release-notes-content">
            <p class="no-notes">{{ t('newVersionFoundGeneric') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-container {
  width: 320px;
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: 10px 20px 20px 20px;
  background-color: rgba(31, 34, 46, 0.85);
  border-radius: 16px;
  overflow: hidden;
  box-sizing: border-box;
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

.main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  width: 70px;
  height: 70px;
  margin-bottom: 20px;
  cursor: pointer;
  transform-origin: center;
  scale: 1;
  animation: logo-rotate 6s linear infinite;
  transition:
    scale 0.4s ease,
    animation-duration 0.6s ease;
  will-change: transform, scale;
}

.logo:hover {
  scale: 1.1;
  animation-duration: 2s;
}

@keyframes logo-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.text {
  font-size: 14px;
  text-align: center;
}

.version-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  padding: 0;
}

.app-version {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background-color: rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.8);
}

.app-version:hover {
  background-color: rgba(255, 255, 255, 0.15);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
}

.app-version.has-update {
  border-color: rgba(46, 204, 113, 0.4);
}

.update-dot {
  position: absolute;
  top: 0;
  right: 0;
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

.update-icon {
  font-size: 14px;
  opacity: 0.8;
  display: inline-block;
  transition: transform 0.4s ease;
}

.app-version:hover .update-icon {
  opacity: 1;
}

.app-version:active .update-icon {
  transform: rotate(180deg);
}

.update-section {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 20px;
}

.update-msg {
  font-size: 11px;
  color: var(--ev-c-green);
  opacity: 0.8;
}

.install-btn {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #2ecc71;
  background: rgba(46, 204, 113, 0.2);
  cursor: pointer;
  color: #2ecc71;
  transition: all 0.2s;
}

.install-btn:hover {
  background: rgba(46, 204, 113, 0.4);
}

.version-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
}

/* 更新确认弹窗 */
.release-notes-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.release-notes-modal {
  background: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 280px;
  max-height: 220px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  animation: modalSlideUp 0.3s ease-out forwards;
  will-change: transform, opacity;
}

.release-notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
}

.dismiss-btn,
.confirm-btn {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.dismiss-btn:hover,
.confirm-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.release-notes-content {
  padding: 10px 14px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
}

.release-notes-content::-webkit-scrollbar {
  width: 4px;
}

.release-notes-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.release-notes-content :deep(h2),
.release-notes-content :deep(h3),
.release-notes-content :deep(h4) {
  margin: 6px 0 3px;
  color: #2ecc71;
}

.release-notes-content h2 {
  font-size: 14px;
}
.release-notes-content h3 {
  font-size: 13px;
}
.release-notes-content h4 {
  font-size: 12px;
}

.release-notes-content p {
  margin: 3px 0;
}

.release-notes-content li {
  margin: 2px 0 2px 12px;
  list-style-type: disc;
}

.no-notes {
  text-align: center;
  color: #aaa;
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
