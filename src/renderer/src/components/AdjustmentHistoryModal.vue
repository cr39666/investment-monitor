<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StockAdjustmentDirection, StockAdjustmentRecord } from '../types/stock'

type HistoryResult = 'close' | 'undo'

const { t } = useI18n()
const isVisible = ref(false)
const stockName = ref('')
const records = ref<StockAdjustmentRecord[]>([])
let resolvePromise: ((value: HistoryResult) => void) | null = null

const displayRecords = computed(() => [...records.value].reverse())

const directionLabel = (direction: StockAdjustmentDirection): string => {
  if (direction === 'buy') return t('tradeBuy')
  if (direction === 'sell') return t('tradeSell')
  return t('clearPosition')
}

const formatTime = (createdAt: string): string => {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatPrice = (value: number): string => value.toFixed(3)
const formatFee = (value: number): string => value.toFixed(2)

const close = (result: HistoryResult = 'close') => {
  isVisible.value = false
  window.removeEventListener('keydown', handleKeydown, true)
  resolvePromise?.(result)
  resolvePromise = null
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isVisible.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}

const open = (name: string, nextRecords: StockAdjustmentRecord[]) => {
  stockName.value = name
  records.value = [...nextRecords]
  isVisible.value = true
  window.addEventListener('keydown', handleKeydown, true)

  return new Promise<HistoryResult>((resolve) => {
    resolvePromise = resolve
  })
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
  if (resolvePromise) {
    resolvePromise('close')
    resolvePromise = null
  }
})

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="history-overlay" @click.self="close()">
      <div class="history-content">
        <div class="history-header">
          <span class="history-btn-icon" :title="t('cancel')" @click="close()">❌</span>
          <span class="history-title">{{ t('adjustmentRecordsTitle') }}</span>
          <span
            v-if="records.length > 0"
            class="history-btn-icon history-undo-btn"
            :title="t('undoLastAdjustment')"
            @click="close('undo')"
            >↩️</span
          >
          <span v-else class="history-btn-icon history-btn-placeholder"></span>
        </div>

        <div class="history-body">
          <p class="history-msg">{{ stockName }}</p>
          <div v-if="records.length === 0" class="empty-text">{{ t('adjustmentRecordsEmpty') }}</div>
          <div v-else class="record-list">
            <div v-for="(record, index) in displayRecords" :key="record.id" class="record-item">
              <div class="record-main">
                <span class="record-direction" :class="record.direction">{{
                  directionLabel(record.direction)
                }}</span>
                <span v-if="index === 0" class="latest-badge">{{ t('latestAdjustment') }}</span>
                <span class="record-time">{{ formatTime(record.createdAt) }}</span>
              </div>
              <div class="record-detail">
                <span>{{ t('tradePrice') }} {{ formatPrice(record.price) }}</span>
                <span>{{ t('deltaLots') }} {{ record.amount }} {{ t('lotsUnit') }}</span>
                <div class="record-fee-row">
                  <span>{{ record.isTodayTrade ? t('isTodayTrade') : t('notTodayTrade') }}</span>
                  <span class="record-meta">{{ t('estFee') }} ¥{{ formatFee(record.fee) }}</span>
                </div>
              </div>
            </div>
          </div>
          <p class="history-tip">{{ t('adjustmentHistoryTip') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.history-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: historyFadeIn 0.2s ease-out;
}

.history-content {
  width: 236px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  color: #fff;
  animation: historySlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: bold;
  padding-bottom: 2px;
  margin-bottom: 2px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.history-btn-icon {
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  line-height: 1;
  font-size: 12px;
  transition: background-color 0.2s;
}

.history-btn-icon:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.history-undo-btn:hover {
  background-color: rgba(231, 76, 60, 0.18);
}

.history-btn-placeholder {
  visibility: hidden;
  pointer-events: none;
}

.history-title {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.history-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
}

.history-body::-webkit-scrollbar {
  width: 4px;
}

.history-body::-webkit-scrollbar-track {
  background: transparent;
}

.history-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.history-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.history-msg {
  margin: 4px 0 8px;
  color: #aaa;
  text-align: center;
  font-size: 11px;
  line-height: 1.4;
}

.empty-text {
  padding: 18px 0;
  text-align: center;
  color: #666;
  font-size: 11px;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-item {
  padding: 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}

.record-main {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 5px;
}

.record-direction {
  font-size: 12px;
  font-weight: bold;
  color: var(--ev-c-green);
}

.record-direction.buy {
  color: var(--ev-c-pink);
}

.record-direction.sell {
  color: var(--ev-c-blue);
}

.latest-badge {
  padding: 1px 5px;
  border: 1px solid rgba(241, 196, 15, 0.22);
  border-radius: 999px;
  background: rgba(241, 196, 15, 0.18);
  color: #f1c40f;
  font-size: 9px;
  line-height: 1.2;
}

.record-time {
  margin-left: auto;
  color: #888;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.record-detail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #ccc;
  font-size: 11px;
  line-height: 1.35;
}

.record-fee-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.record-meta {
  color: #888;
  font-size: 10px;
  text-align: right;
  white-space: nowrap;
}

.history-tip {
  margin: 8px 0 2px;
  color: #888;
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
}

@keyframes historyFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes historySlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
