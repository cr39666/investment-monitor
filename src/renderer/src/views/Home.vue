<script setup lang="ts">
import Versions from '../components/Versions.vue'
import DragHandle from '../components/DragHandle.vue'
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const goToDetail = () => {
  // 跳转到详情页
  router.push('/detail')
}

const goToSetting = () => {
  // 跳转到设置页
  router.push('/setting')
}

const backToBall = () => {
  // 返回悬浮球形态
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/')
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
        <span class="ts">Croyell</span>
      </div>
      <p class="tip">Please try clicking <code>the logo above</code> to display your stocks</p>
      <div class="actions">
        <div class="action">
          <a href="javascript:void(0)" @click="goToDetail">View</a>
        </div>
        <div class="action">
          <a href="javascript:void(0)" @click="goToSetting">Setting</a>
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
