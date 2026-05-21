<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import DragHandle from './DragHandle.vue'
import { useUpdateCheck } from '../composables/useUpdateCheck'

type ModuleKey = 'stock' | 'fund' | 'gold'

const props = defineProps<{
  /** 当前所处模块，用于在切换按钮中排除自身 */
  current: ModuleKey
}>()

const { t } = useI18n()
const router = useRouter()
const { hasPendingUpdate, checkPendingUpdate } = useUpdateCheck()

// 显示模块导航配置：与 Setting 中保持一致，从 localStorage 读取
const visibleModules = ref<ModuleKey[]>(['stock', 'gold', 'fund'])

// 其它两个模块（按 fund -> gold 的固定顺序展示，与原 UI 一致）
const otherModules = computed<ModuleKey[]>(() => {
  const order: ModuleKey[] = ['stock', 'fund', 'gold']
  return order.filter((m) => m !== props.current && visibleModules.value.includes(m))
})

const meta: Record<ModuleKey, { icon: string; titleKey: string; route: string }> = {
  stock: { icon: '📈', titleKey: 'switchToStock', route: '/' },
  fund: { icon: '💹', titleKey: 'switchToFund', route: '/fund' },
  gold: { icon: '🟨', titleKey: 'switchToGold', route: '/gold' }
}

const goBack = (): void => {
  // 收缩为悬浮球大小并回到 ball 路由
  window.electron.ipcRenderer.send('resize-window', 60, 60)
  router.push('/ball')
}

const goToSetting = (): void => {
  router.push('/setting')
}

const goTo = (m: ModuleKey): void => {
  router.push(meta[m].route)
}

onMounted(() => {
  // 检测更新状态
  checkPendingUpdate()

  // 加载显示模块导航配置（兼容旧的 show_fund 布尔值）
  const moduleSaved = localStorage.getItem('show_modules')
  if (moduleSaved !== null) {
    try {
      const parsed = JSON.parse(moduleSaved)
      if (Array.isArray(parsed)) {
        visibleModules.value = parsed as ModuleKey[]
      } else if (typeof parsed === 'boolean') {
        visibleModules.value = parsed ? ['stock', 'gold', 'fund'] : []
      }
    } catch {
      /* ignore */
    }
  } else {
    const fundSaved = localStorage.getItem('show_fund')
    if (fundSaved !== null) {
      try {
        const parsed = JSON.parse(fundSaved)
        visibleModules.value = parsed ? ['stock', 'gold', 'fund'] : []
      } catch {
        /* ignore */
      }
    }
  }
})
</script>

<template>
  <DragHandle>
    <template #left>
      <button class="nav-btn" :title="t('backToBall')" @click="goBack">
        <img src="../assets/icon.svg" class="nav-icon" alt="ball" />
      </button>
    </template>
    <template #right>
      <button
        v-for="m in otherModules"
        :key="m"
        class="nav-btn"
        :title="t(meta[m].titleKey)"
        @click="goTo(m)"
      >
        {{ meta[m].icon }}
      </button>
      <button class="nav-btn setting-btn" :title="t('goToSetting')" @click="goToSetting">
        ⚙️<span v-if="hasPendingUpdate" class="update-dot"></span>
      </button>
    </template>
  </DragHandle>
</template>

<style scoped>
:deep(.right-button) {
  gap: 4px;
}

.nav-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
  opacity: 0.6;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover {
  opacity: 1;
  transform: scale(1.15);
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
}

.nav-btn:active {
  transform: scale(1.05);
}

.nav-icon {
  width: 16px;
  height: 16px;
  filter: brightness(1.3);
  transition: filter 0.3s ease;
  animation: iconSpin 6s linear infinite;
}

.nav-btn:hover .nav-icon {
  animation-duration: 1.5s;
}

@keyframes iconSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.setting-btn {
  position: relative;
}

.update-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  background-color: #2ecc71;
  border-radius: 50%;
  animation: dotPulse 2s ease-in-out infinite;
}

@keyframes dotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
</style>
