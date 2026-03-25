<script setup lang="ts">
import { ref } from 'vue'

const isDragging = ref(false)
let offsetX = 0
let offsetY = 0

const onMouseDown = (e: MouseEvent) => {
  isDragging.value = false
  // 记录鼠标点击位置相对于窗口左上角的偏移
  offsetX = e.clientX
  offsetY = e.clientY

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

  const onMouseUp = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      // 确保最终位置被提交
      flushMove()
    }
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div class="drag-handle-container">
    <div class="nav-button left-button">
      <slot name="left"></slot>
    </div>
    <div class="drag-area" @mousedown="onMouseDown">
      <div class="drag-bar"></div>
    </div>
    <div class="nav-button right-button">
      <slot name="right"></slot>
    </div>
  </div>
</template>

<style scoped>
.drag-handle-container {
  width: 100%;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;
  flex-shrink: 0;
  position: relative;
}

.drag-area {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
  height: 100%;
  z-index: 0;
}

.drag-area:active {
  cursor: grabbing;
}

.drag-bar {
  width: 40px;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  transition: background-color 0.3s;
  pointer-events: none;
}

.drag-area:hover .drag-bar {
  background-color: rgba(255, 255, 255, 0.4);
}

.nav-button {
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.left-button {
  position: absolute;
  left: 0;
}

.right-button {
  position: absolute;
  right: 0;
}
</style>
