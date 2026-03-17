<script setup lang="ts">
import Versions from '../components/Versions.vue'
import DragHandle from '../components/DragHandle.vue'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const goToDetail = () => {
  // 跳转到详情页
  router.push('/detail')
}

const backToBall = () => {
  // 返回悬浮球形态
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/')
}

onMounted(() => {
  // 监听内容高度变化并调整窗口大小
  if (containerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // 使用 getBoundingClientRect 获取精确的物理尺寸
        const rect = entry.target.getBoundingClientRect()
        const width = Math.ceil(rect.width)
        const height = Math.ceil(rect.height)
        // 发送精确尺寸到主进程，不再额外加偏移量，彻底消除透明边框
        window.electron.ipcRenderer.send('resize-window', width, height)
      }
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="home-container">
    <DragHandle />
    <div class="main">
      <img alt="logo" class="logo" src="../assets/electron.svg" @click="backToBall" title="Click to shrink to ball" />
      <div class="text">
        <span class="vue">A-share</span>
        market watcher designed by 
        <span class="ts">Moon Buffett</span>
      </div>
      <p class="tip">Please try clicking <code>the logo above</code> to display your stocks</p>
      <div class="actions">
        <div class="action">
          <a href="javascript:void(0)" @click="goToDetail">Go try it</a>
        </div>
        <div class="action">
          <a href="javascript:void(0)" @click="ipcHandle">Setting...</a>
        </div>
      </div>
    </div>
    <Versions />
  </div>
</template>

<style scoped>
.home-container {
  width: 650px;
  height: 600px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: 0 25px 25px 25px; /* Top 0 for DragHandle */
  background-color: rgba(31, 34, 46, 0.8); /* 半透明暗色背景 */
  border-radius: 12px;
  overflow: hidden;
}

.main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  cursor: pointer;
  transform-origin: center;
  scale: 1;
  animation: logo-rotate 6s linear infinite;
  transition: scale 0.4s ease, animation-duration 0.6s ease;
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
</style>
