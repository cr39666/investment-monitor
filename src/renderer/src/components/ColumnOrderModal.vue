<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import Toast from './Toast.vue'
import {
  loadStockColumnOrder,
  saveStockColumnOrder,
  loadFundColumnOrder,
  saveFundColumnOrder,
  STOCK_COLUMNS_DEFAULT,
  FUND_COLUMNS_DEFAULT,
  type StockColumnKey,
  type FundColumnKey
} from '../utils/columnOrder'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  // 'stock' = 股票列；'fund' = 基金列
  type: 'stock' | 'fund'
}>()

const emit = defineEmits<{
  close: []
}>()

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

// 拆分列（仅股票有）：'chg' | 'dpnl' | 'pnl' | 'val'
type SplitKey = 'chg' | 'dpnl' | 'pnl' | 'val'
const SPLIT_KEYS: SplitKey[] = ['chg', 'dpnl', 'pnl', 'val']

// 扁平列表项：主列或拆分列
type ColumnItem = { type: 'main'; key: StockColumnKey } | { type: 'split'; key: SplitKey }

// 编辑态扁平列表（主列+启用拆分列，可整体拖拽）
const stockItems = ref<ColumnItem[]>([])
const fundOrder = ref<FundColumnKey[]>([...FUND_COLUMNS_DEFAULT])

// 启用的拆分列 key 集合（用于判断某拆分是否启用）
const enabledSplits = ref<Set<SplitKey>>(new Set())

// 拆分列归属于哪个主列
const splitParent: Record<SplitKey, StockColumnKey> = {
  chg: 'price',
  dpnl: 'dpnl',
  pnl: 'tpnl',
  val: 'avg'
}

// 主列 chip 标签
const stockColLabel: Record<StockColumnKey, string> = {
  name: 'thName',
  price: 'thPrice',
  dpnl: 'thDPnl',
  tpnl: 'thTPnl',
  avg: 'thAvg',
  qty: 'thQty'
}

// 拆分副列 chip 标签
const splitColLabel: Record<SplitKey, string> = {
  chg: 'thChg',
  dpnl: 'thDPnlPct',
  pnl: 'thTPnlPct',
  val: 'thVal'
}

// 顶部"启用/关闭 拆分列"开关 chip 标签
const splitToggleLabel: Record<SplitKey, string> = {
  chg: 'thPriceChg',
  dpnl: 'thDPnlBoth',
  pnl: 'thTPnlBoth',
  val: 'thAvgVal'
}

const fundColLabel: Record<FundColumnKey, string> = {
  name: 'colName',
  nav: 'colNav',
  pnl: 'colPnl',
  chg: 'colChg',
  yield: 'colYield',
  last: 'colLast'
}

// ====== 拖拽（所有 chip 均可拖） ======
const draggingIndex = ref<number | null>(null)

const onDragStart = (index: number, e: DragEvent) => {
  draggingIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

// 通用 drop：在 stockItems 或 fundOrder 中重排
const onDrop = (targetIndex: number) => {
  const src = draggingIndex.value
  draggingIndex.value = null
  if (src === null || src === targetIndex) return

  if (props.type === 'stock') {
    const arr = [...stockItems.value]
    const [moved] = arr.splice(src, 1)
    arr.splice(targetIndex, 0, moved)
    stockItems.value = arr
  } else {
    const arr = [...fundOrder.value]
    const [moved] = arr.splice(src, 1)
    arr.splice(targetIndex, 0, moved)
    fundOrder.value = arr
  }
}

const onDragEnd = () => {
  draggingIndex.value = null
}

// ====== 副列点击切换拆分（仅本地状态） ======
const toggleSplit = (key: SplitKey) => {
  if (enabledSplits.value.has(key)) {
    // 禁用：从启用集合移除，并从 stockItems 移除
    enabledSplits.value.delete(key)
    stockItems.value = stockItems.value.filter(
      (item) => !(item.type === 'split' && item.key === key)
    )
  } else {
    // 启用：加入启用集合，并追加到 stockItems 末尾
    enabledSplits.value.add(key)
    stockItems.value.push({ type: 'split', key })
  }
}

// ====== 重置 ======
const reset = () => {
  if (props.type === 'stock') {
    stockItems.value = STOCK_COLUMNS_DEFAULT.map((k) => ({ type: 'main' as const, key: k }))
    enabledSplits.value = new Set()
  } else {
    fundOrder.value = [...FUND_COLUMNS_DEFAULT]
  }
  toastRef.value?.show(t('columnOrderResetDone'), 'info')
}

// 加载拆分列配置（兼容旧布尔值格式）
const loadSplitColumns = (): SplitKey[] => {
  const raw = localStorage.getItem('stock_splitColumns')
  if (raw === null) return []
  const isValidKey = (k: unknown): k is SplitKey =>
    typeof k === 'string' && (SPLIT_KEYS as string[]).includes(k)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(isValidKey)
    if (parsed === true) return ['chg', 'pnl', 'val']
    return []
  } catch {
    if (raw === 'true') return ['chg', 'pnl', 'val']
    return []
  }
}

// 从 stockItems 提取 stockOrder（主列顺序）和 splitColumns（启用的拆分列）
const extractStockState = (): { order: StockColumnKey[]; splits: SplitKey[] } => {
  const order: StockColumnKey[] = []
  const splits: SplitKey[] = []
  stockItems.value.forEach((item) => {
    if (item.type === 'main') order.push(item.key)
    else splits.push(item.key)
  })
  return { order, splits }
}

// ====== 提交 ======
const commit = () => {
  if (props.type === 'stock') {
    // 保存完整列顺序（主列+拆分列）到 stock_columnOrderFull
    // 格式：['name', 'price', 'split:chg', 'dpnl', ...]
    const fullOrder = stockItems.value.map((item) =>
      item.type === 'main' ? item.key : `split:${item.key}`
    )
    localStorage.setItem('stock_columnOrderFull', JSON.stringify(fullOrder))
    // 同时保存主列顺序（兼容旧逻辑）和启用拆分列
    const { order, splits } = extractStockState()
    saveStockColumnOrder(order)
    localStorage.setItem('stock_splitColumns', JSON.stringify(splits))
  } else {
    saveFundColumnOrder(fundOrder.value)
  }
  window.dispatchEvent(new Event('column-order-changed'))
}

// ❌ 关闭 = 取消
const cancel = () => {
  emit('close')
}

// ✅ 关闭 = 提交
const confirm = () => {
  commit()
  emit('close')
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.show) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancel()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    confirm()
  }
}

// 初始化 stockItems：从存储加载完整列顺序（主列+拆分列）
const initStockItems = () => {
  // 优先从 stock_columnOrderFull 加载完整顺序
  const fullRaw = localStorage.getItem('stock_columnOrderFull')
  if (fullRaw) {
    try {
      const fullOrder: string[] = JSON.parse(fullRaw)
      const items: ColumnItem[] = []
      const splits = new Set<SplitKey>()
      fullOrder.forEach((key) => {
        if (key.startsWith('split:')) {
          const sk = key.slice(6) as SplitKey
          if (SPLIT_KEYS.includes(sk)) {
            items.push({ type: 'split', key: sk })
            splits.add(sk)
          }
        } else if (STOCK_COLUMNS_DEFAULT.includes(key as StockColumnKey)) {
          items.push({ type: 'main', key: key as StockColumnKey })
        }
      })
      stockItems.value = items
      enabledSplits.value = splits
      return
    } catch {
      // 解析失败，降级使用旧格式
    }
  }
  // 降级：从旧格式加载（主列顺序 + 启用拆分列）
  const order = loadStockColumnOrder()
  const splitsArr = loadSplitColumns()
  enabledSplits.value = new Set(splitsArr)
  const items: ColumnItem[] = []
  order.forEach((mainKey) => {
    items.push({ type: 'main', key: mainKey })
    splitsArr.forEach((sk) => {
      if (splitParent[sk] === mainKey) {
        items.push({ type: 'split', key: sk })
      }
    })
  })
  stockItems.value = items
}

watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      if (props.type === 'stock') {
        initStockItems()
      } else {
        fundOrder.value = loadFundColumnOrder()
      }
      window.addEventListener('keydown', handleKeydown, true)
    } else {
      window.removeEventListener('keydown', handleKeydown, true)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="cancel">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-btn" @click="cancel">❌</span>
          <span>{{
            type === 'stock' ? t('columnOrderModalStockTitle') : t('columnOrderModalFundTitle')
          }}</span>
          <span class="modal-btn" :title="t('confirm')" @click="confirm">✅</span>
        </div>

        <div class="modal-body">
          <div class="modal-form">
            <!-- 股票：上方为拆分提示，紧跟拆分开关行 -->
            <template v-if="type === 'stock'">
              <p class="modal-hint-text">{{ t('columnOrderHintStockSplit') }}</p>

              <div class="split-toggle-row">
                <div class="split-toggle-list">
                  <span
                    v-for="sk in SPLIT_KEYS"
                    :key="`tg-${sk}`"
                    class="split-toggle-chip"
                    :class="{ active: enabledSplits.has(sk) }"
                    @click="toggleSplit(sk)"
                    >{{ t(splitToggleLabel[sk]) }}</span
                  >
                </div>
              </div>

              <!-- 下方拖拽提示 + 右侧重置按钮 -->
              <div class="hint-row">
                <p class="modal-hint-text">{{ t('columnOrderHintReorder') }}</p>
                <span class="reset-inline-btn" :title="t('columnOrderReset')" @click="reset">↺</span>
              </div>

              <!-- 股票列：主列和拆分列均可拖拽 -->
              <div class="col-list">
                <template v-for="(item, i) in stockItems" :key="`si-${i}-${item.type}-${item.key}`">
                  <span
                    v-if="item.type === 'main'"
                    class="col-chip"
                    :class="{ dragging: draggingIndex === i }"
                    draggable="true"
                    @dragstart="onDragStart(i, $event)"
                    @dragover="onDragOver"
                    @drop="onDrop(i)"
                    @dragend="onDragEnd"
                  >
                    <span class="col-chip-index">{{ i + 1 }}</span>
                    {{ t(stockColLabel[item.key]) }}
                  </span>
                  <span
                    v-else
                    class="col-chip col-chip-split active"
                    :title="t('columnOrderSplitToggle')"
                    draggable="true"
                    @dragstart="onDragStart(i, $event)"
                    @dragover="onDragOver"
                    @drop="onDrop(i)"
                    @dragend="onDragEnd"
                    @click="toggleSplit(item.key)"
                  >
                    <span class="col-chip-marker">+</span>
                    {{ t(splitColLabel[item.key]) }}
                  </span>
                </template>
              </div>
            </template>

            <!-- 基金：提示 + 右侧重置按钮 -->
            <template v-else>
              <div class="hint-row">
                <p class="modal-hint-text">{{ t('columnOrderHintReorder') }}</p>
                <span class="reset-inline-btn" :title="t('columnOrderReset')" @click="reset">↺</span>
              </div>

              <div class="col-list">
                <span
                  v-for="(key, idx) in fundOrder"
                  :key="key"
                  class="col-chip"
                  :class="{ dragging: draggingIndex === idx }"
                  draggable="true"
                  @dragstart="onDragStart(idx, $event)"
                  @dragover="onDragOver"
                  @drop="onDrop(idx)"
                  @dragend="onDragEnd"
                >
                  <span class="col-chip-index">{{ idx + 1 }}</span>
                  {{ t(fundColLabel[key]) }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <Toast ref="toastRef" />
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: modalFadeIn 0.2s ease-out forwards;
}

.modal-content {
  background-color: #1a1c26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  width: 250px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  will-change: transform, opacity;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: bold;
  padding-bottom: 8px;
  margin-bottom: 8px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.modal-btn {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.modal-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-hint-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  padding: 0;
  line-height: 1.4;
}

/* 描述行：左侧描述 + 右侧重置按钮 */
.hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hint-row .modal-hint-text {
  flex: 1;
  min-width: 0;
}

.reset-inline-btn {
  cursor: pointer;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.reset-inline-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.col-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.col-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  cursor: grab;
  user-select: none;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s,
    opacity 0.15s;
}

.col-chip:hover {
  background: rgba(46, 204, 113, 0.18);
  border-color: rgba(46, 204, 113, 0.4);
  color: #fff;
}

.col-chip:active {
  cursor: grabbing;
}

.col-chip.dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

.col-chip-index {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  min-width: 10px;
  text-align: center;
}

/* 副列 chip：依附主列、虚线边框、不可拖、点击移除 */
.col-chip-split {
  cursor: pointer;
  background: rgba(46, 204, 113, 0.08);
  border: 1px dashed rgba(46, 204, 113, 0.45);
  color: rgba(46, 204, 113, 0.9);
  padding: 4px 6px;
  font-size: 10px;
}

.col-chip-split:hover {
  background: rgba(231, 76, 60, 0.18);
  border-color: rgba(231, 76, 60, 0.55);
  color: #ff8b80;
}

.col-chip-marker {
  font-size: 10px;
  opacity: 0.7;
  font-weight: bold;
}

/* 拆分开关行（未启用的可一键添加；已启用的也可在这里关闭） */
.split-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}

.split-toggle-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.split-toggle-chip {
  display: inline-block;
  padding: 2px 8px;
  font-size: 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.split-toggle-chip:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.split-toggle-chip.active {
  background: rgba(46, 204, 113, 0.18);
  border-color: rgba(46, 204, 113, 0.5);
  color: #2ecc71;
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
