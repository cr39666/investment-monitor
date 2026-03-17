<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const handleNavigate = (_event, path: string) => {
  router.push(path)
}

onMounted(() => {
  window.electron.ipcRenderer.on('navigate', handleNavigate)
  
  // 初始化全局设置
  const ballAlwaysOnTop = localStorage.getItem('ball_always_on_top')
  const windowAlwaysOnTop = localStorage.getItem('window_always_on_top')
  
  window.electron.ipcRenderer.send('set-always-on-top-config', {
    ball: ballAlwaysOnTop !== null ? JSON.parse(ballAlwaysOnTop) : true,
    window: windowAlwaysOnTop !== null ? JSON.parse(windowAlwaysOnTop) : false
  })
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('navigate')
})
</script>

<template>
  <router-view />
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
