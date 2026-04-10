import { ref } from 'vue'
// @ts-ignore
import pkg from '../../../../package.json'

/** 当前应用版本号 */
export const appVersion: string = pkg.version

/**
 * 比较两个语义化版本号，判断 newVer 是否高于 oldVer
 */
export const isNewerVersion = (newVer: string, oldVer: string): boolean => {
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

/**
 * 从 localStorage 检测是否有待更新版本
 * @returns hasPendingUpdate 响应式引用 + 手动 check 方法
 */
export function useUpdateCheck() {
  const hasPendingUpdate = ref(false)

  const checkPendingUpdate = () => {
    const pendingRaw = localStorage.getItem('pending_update')
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw)
        if (pending.version && isNewerVersion(pending.version, appVersion)) {
          hasPendingUpdate.value = true
        }
      } catch {
        /* ignore */
      }
    }
  }

  return {
    hasPendingUpdate,
    checkPendingUpdate
  }
}
