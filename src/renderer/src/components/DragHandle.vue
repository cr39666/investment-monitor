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
  
  const onMouseMove = (moveEvent: MouseEvent) => {
    // 发送绝对屏幕坐标和点击时的初始偏移
    window.electron.ipcRenderer.send('window-move', { 
      screenX: moveEvent.screenX, 
      screenY: moveEvent.screenY,
      offsetX,
      offsetY
    })
    isDragging.value = true
  }
  
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div class="drag-handle-container" @mousedown="onMouseDown">
    <div class="drag-bar"></div>
  </div>
</template>

<style scoped>
.drag-handle-container {
  width: 100%;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  /* 弃用 -webkit-app-region: drag，因为在透明无边框窗口下可能由于层级问题失效 */
  /* 改用手动监听鼠标位移并通过 IPC 实时通知主进程移动窗口 */
}

.drag-handle-container:active {
  cursor: grabbing;
}

.drag-bar {
  width: 40px;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  transition: background-color 0.3s;
  pointer-events: none; /* 让事件穿透到容器 */
}

.drag-handle-container:hover .drag-bar {
  background-color: rgba(255, 255, 255, 0.4);
}
</style>
