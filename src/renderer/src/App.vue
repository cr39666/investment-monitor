<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Toast from './components/Toast.vue'
import { getLastMainView } from './router'

const { t } = useI18n()
const router = useRouter()
// @ts-ignore
import pkg from '../../../package.json'
const version = pkg.version

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

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

const handleNavigate = (_event, path: string) => {
  router.push(path)
}

const handleNavigateBack = () => {
  router.push(getLastMainView())
}

const handleUpdateAvailable = (_event, info: any) => {
  const newVersion = info?.version || ''
  
  // 核心修复：只有新版本确实高于当前版本时，才记录并提示
  if (!isNewerVersion(newVersion, version)) {
    // 如果已经升级，则清理之前的残留记录
    localStorage.removeItem('pending_update')
    return
  }
  
  // 存储更新信息到 localStorage，供 About 页读取
  const updateData: any = { version: newVersion }
  if (info?.releaseNotes) {
    updateData.releaseNotes = typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n: any) => n.note).join('\n')
        : ''
  }
  localStorage.setItem('pending_update', JSON.stringify(updateData))

  const msg = newVersion
    ? t('newVersionFound', { version: newVersion })
    : t('newVersionFoundGeneric')
  
  toastRef.value?.show(msg, 'alert', 5000, () => {
    router.push('/about')
  })
}

onMounted(() => {
  window.electron.ipcRenderer.on('navigate', handleNavigate)
  window.electron.ipcRenderer.on('navigate-back', handleNavigateBack)
  window.electron.ipcRenderer.on('update-available', handleUpdateAvailable)

  // 初始化全局设置
  const ballAlwaysOnTop = localStorage.getItem('ball_always_on_top')
  const windowAlwaysOnTop = localStorage.getItem('window_always_on_top')

  window.electron.ipcRenderer.send('set-always-on-top-config', {
    ball: ballAlwaysOnTop !== null ? JSON.parse(ballAlwaysOnTop) : true,
    window: windowAlwaysOnTop !== null ? JSON.parse(windowAlwaysOnTop) : false
  })

  // 同步快捷键
  const hotkey = localStorage.getItem('global_hotkey')
  if (hotkey) {
    window.electron.ipcRenderer.send('set-global-hotkey', hotkey)
  }

  // 同步语言到主进程托盘
  const lang = localStorage.getItem('lang')
  if (lang) {
    window.electron.ipcRenderer.send('set-language', lang)
  }
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('navigate')
  window.electron.ipcRenderer.removeAllListeners('navigate-back')
  window.electron.ipcRenderer.removeAllListeners('update-available')
})
</script>

<template>
  <router-view />
  <Toast ref="toastRef" />
</template>

<style>
body {
  margin: 0;
  padding: 0;
  background: transparent !important;
  overflow: hidden;
}

html {
  background: transparent !important;
}
</style>
