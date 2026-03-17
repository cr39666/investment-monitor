import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 供渲染器使用的自定义 API
const api = {}

// 仅在启用上下文隔离的情况下，
// 使用 `contextBridge` API 将 Electron API 暴露给渲染器，
// 否则直接将其添加到 DOM 全局变量中。
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (在 dts 中定义)
  window.electron = electronAPI
  // @ts-ignore (在 dts 中定义)
  window.api = api
}
