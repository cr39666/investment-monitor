<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Toast from './components/Toast.vue'
import { getLastMainView } from './router'

const { t } = useI18n()
const router = useRouter()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)

const handleNavigate = (_event, path: string) => {
  router.push(path)
}

const handleNavigateBack = () => {
  router.push(getLastMainView())
}

const handleUpdateAvailable = (_event, info: any) => {
  const version = info?.version || ''
  // 存储更新信息到 localStorage，供 About 页读取
  const updateData: any = { version }
  if (info?.releaseNotes) {
    updateData.releaseNotes = typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n: any) => n.note).join('\n')
        : ''
  }
  localStorage.setItem('pending_update', JSON.stringify(updateData))

  const msg = version
    ? t('newVersionFound', { version })
    : t('newVersionFoundGeneric')
  toastRef.value?.show(msg, 'alert')
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
