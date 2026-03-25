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
  // 返回悬浮球形态
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/ball')
}

const backToSetting = () => {
  // 返回设置页
  router.push('/setting')
}

// === 更新逻辑 ===
const updateStatus = ref<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle')
const updateMessage = ref('')
const downloadProgress = ref(0)
const versionInfo = ref('')

const checkForUpdates = () => {
  if (updateStatus.value === 'checking' || updateStatus.value === 'downloading') return
  updateStatus.value = 'checking'
  updateMessage.value = t('checking')
  window.electron.ipcRenderer.send('check-for-update')
}

const installUpdate = () => {
  window.electron.ipcRenderer.send('quit-and-install')
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

onMounted(async () => {
  // 监听更新事件
  window.electron.ipcRenderer.on('update-available', (_event, info: any) => {
    updateStatus.value = 'available'
    versionInfo.value = info?.version || ''
    updateMessage.value = t('newVersionAvailable')
    window.electron.ipcRenderer.send('download-update')
    updateStatus.value = 'downloading'
    updateMessage.value = t('downloading')
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

  window.electron.ipcRenderer.on('update-downloaded', () => {
    updateStatus.value = 'ready'
    updateMessage.value = t('readyToInstall')
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
        <button class="nav-btn" @click="backToSetting" :title="t('backToList')">
          ⬅️
        </button>
      </template>
    </DragHandle>
    <div class="main">
      <img
        alt="logo"
        class="logo"
        src="../assets/electron.svg"
        @click="backToBall"
        :title="t('clickToShrink')"
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
        @click="checkForUpdates"
        :title="t('checkUpdates')"
      >
        v{{ version }}
        <span class="update-icon">↻</span>
      </span>
      <div v-if="updateMessage || updateStatus !== 'idle'" class="update-section">
        <span class="update-msg" v-if="updateMessage">{{ updateMessage }}</span>
        <button
          v-if="updateStatus === 'ready'"
          class="install-btn"
          @click="installUpdate"
        >
          {{ t('install') }}
        </button>
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
  background-color: rgba(31, 34, 46, 0.85); /* 半透明暗色背景 */
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
  font-family: inherit;
  margin: 0;
  padding: 0;
}

.app-version {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background-color: rgba(255, 255, 255, 0.08); /* 淡淡的底色 */
  border-radius: 14px; /* 圆角胶囊形状 */
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
</style>
