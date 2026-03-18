<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, onMounted } from 'vue'

const router = useRouter()
const isDragging = ref(false)
let offsetX = 0
let offsetY = 0

// 用 rAF 节流，只在每帧提交一次 IPC，避免 mousemove 洪泛导致延迟
let rafId: number | null = null
let latestScreenX = 0
let latestScreenY = 0

const flushMove = () => {
  rafId = null
  window.electron.ipcRenderer.send('window-move', {
    screenX: latestScreenX,
    screenY: latestScreenY,
    offsetX,
    offsetY
  })
}

const onMouseMove = (moveEvent: MouseEvent) => {
  latestScreenX = moveEvent.screenX
  latestScreenY = moveEvent.screenY
  isDragging.value = true
  if (rafId === null) {
    rafId = requestAnimationFrame(flushMove)
  }
}

const stopDragging = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    // 确保最终位置被提交
    flushMove()
  }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', stopDragging)
}

const onMouseDown = (e: MouseEvent) => {
  isDragging.value = false
  // 记录鼠标点击位置相对于窗口左下角的偏移 (在 80x80 坐标系内)
  offsetX = e.clientX
  offsetY = e.clientY

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', stopDragging)
}

onMounted(() => {
  // 初始收缩为 80x80
  window.electron.ipcRenderer.send('resize-window', 80, 80)
})

const goToDetail = () => {
  if (isDragging.value) return // 如果是拖拽结束，不触发点击
  // 展开时调整窗口大小并跳转
  window.electron.ipcRenderer.send('resize-window', 480, 400)
  router.push('/main-list')
}
</script>

<template>
  <div
    ref="containerRef"
    class="floating-ball-container"
    @mousedown="onMouseDown"
    @click="goToDetail"
    title="Drag to move, click to show list"
  >
    <img src="../assets/electron.svg" class="ball-icon" alt="logo" />
  </div>
</template>

<style scoped>
.floating-ball-container {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
}

.floating-ball-container:active {
  cursor: grabbing;
}

.ball-icon {
  width: 48px;
  height: 48px;
  opacity: 0.7;
  filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.5));
  pointer-events: none; /* 让事件穿透到容器 */
  animation: ball-rotate 6s linear infinite;
  transition:
    opacity 0.4s ease,
    filter 0.4s ease,
    animation-duration 0.6s ease;
  will-change: transform, opacity, filter;
}

.floating-ball-container:hover .ball-icon {
  opacity: 1;
  animation-duration: 2s;
  filter: drop-shadow(0 0 8px #6988e6aa);
}

@keyframes ball-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
