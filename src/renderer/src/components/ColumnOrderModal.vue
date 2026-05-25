<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
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

// 当前编辑的列顺序（按 type 加载）
const stockOrder = ref<StockColumnKey[]>([...STOCK_COLUMNS_DEFAULT])
const fundOrder = ref<FundColumnKey[]>([...FUND_COLUMNS_DEFAULT])

// 拆分列（仅股票有）：'chg' | 'dpnl' | 'pnl' | 'val'
type SplitKey = 'chg' | 'dpnl' | 'pnl' | 'val'
const splitColumns = ref<SplitKey[]>([])

// 拆分列归属于哪个主列：决定 split chip 跟在哪个主列后面
//   chg     → 跟随 price
//   dpnl    → 跟随 dpnl
//   pnl     → 跟随 tpnl
//   val     → 跟随 avg
const splitParent: Record<SplitKey, StockColumnKey> = {
  chg: 'price',
  dpnl: 'dpnl',
  pnl: 'tpnl',
  val: 'avg'
}

// 主列 chip 标签：与 MainList 双显模式表头左半保持一致
const stockColLabel: Record<StockColumnKey, string> = {
  name: 'thName',
  price: 'thPrice',
  dpnl: 'thDPnl',
  tpnl: 'thTPnl',
  avg: 'thAvg',
  qty: 'thQty'
}

// 拆分副列 chip 标签：与 MainList 双显模式表头右半保持一致
const splitColLabel: Record<SplitKey, string> = {
  chg: 'thChg',
  dpnl: 'thDPnlPct',
  pnl: 'thTPnlPct',
  val: 'thVal'
}

// 顶部"启用/关闭 拆分列"开关 chip 标签：与 MainList 双显模式表头完整文案保持一致
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

// ===== 渲染所需：把每个主列与（如启用的）副列拼成 chip 行 =====
type MainChip = { kind: 'main'; key: StockColumnKey; idx: number; displayIndex: number }
type SplitChip = { kind: 'split'; key: SplitKey }
type StockChip = MainChip | SplitChip

const SPLIT_KEYS: SplitKey[] = ['chg', 'dpnl', 'pnl', 'val']

// 计算最终展示序列：主列按 stockOrder，命中的拆分副列紧跟其父列后面
const stockChips = computed<StockChip[]>(() => {
  const chips: StockChip[] = []
  let displayIndex = 0
  stockOrder.value.forEach((key, idx) => {
    displayIndex += 1
    chips.push({ kind: 'main', key, idx, displayIndex })
    SPLIT_KEYS.forEach((s) => {
      if (splitParent[s] === key && splitColumns.value.includes(s)) {
        displayIndex += 1
        chips.push({ kind: 'split', key: s })
      }
    })
  })
  return chips
})

// ====== 拖拽（仅主列可拖） ======
const draggingIndex = ref<number | null>(null)

const onDragStart = (index: number, e: DragEvent) => {
  draggingIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 需要 setData 才能触发拖拽
    e.dataTransfer.setData('text/plain', String(index))
  }
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

// 主列 drop：在主列序列中重排（仅本地状态，不立即持久化）
const onDropMain = (targetIndex: number) => {
  const src = draggingIndex.value
  draggingIndex.value = null
  if (src === null || src === targetIndex) return

  if (props.type === 'stock') {
    const arr = [...stockOrder.value]
    const [moved] = arr.splice(src, 1)
    arr.splice(targetIndex, 0, moved)
    stockOrder.value = arr
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
  const idx = splitColumns.value.indexOf(key)
  if (idx >= 0) splitColumns.value.splice(idx, 1)
  else splitColumns.value.push(key)
}

// ====== 重置（仅本地状态，需点击 ✅ 才生效） ======
const reset = () => {
  if (props.type === 'stock') {
    stockOrder.value = [...STOCK_COLUMNS_DEFAULT]
    splitColumns.value = []
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

// ====== 提交：点击 ✅ 时统一保存并通知 ======
const commit = () => {
  if (props.type === 'stock') {
    saveStockColumnOrder(stockOrder.value)
    localStorage.setItem('stock_splitColumns', JSON.stringify(splitColumns.value))
  } else {
    saveFundColumnOrder(fundOrder.value)
  }
  window.dispatchEvent(new Event('column-order-changed'))
}

// ❌ 关闭 = 取消（不保存）
const cancel = () => {
  emit('close')
}

// ✅ 关闭 = 提交（保存）
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

watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      // 每次打开都从存储重新加载，避免外部其他入口修改后状态不同步
      stockOrder.value = loadStockColumnOrder()
      fundOrder.value = loadFundColumnOrder()
      splitColumns.value = loadSplitColumns()
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
                    :class="{ active: splitColumns.includes(sk) }"
                    @click="toggleSplit(sk)"
                    >{{ t(splitToggleLabel[sk]) }}</span
                  >
                </div>
              </div>

              <!-- 下方主列拖拽提示 + 右侧重置按钮 -->
              <div class="hint-row">
                <p class="modal-hint-text">{{ t('columnOrderHintReorder') }}</p>
                <span class="reset-inline-btn" :title="t('columnOrderReset')" @click="reset">↺</span>
              </div>

              <!-- 股票列：主列可拖，副列紧跟其后，可点击切换 -->
              <div class="col-list">
                <template v-for="(chip, i) in stockChips" :key="`s-${i}-${chip.kind}-${chip.key}`">
                  <span
                    v-if="chip.kind === 'main'"
                    class="col-chip"
                    :class="{ dragging: draggingIndex === chip.idx }"
                    draggable="true"
                    @dragstart="onDragStart(chip.idx, $event)"
                    @dragover="onDragOver"
                    @drop="onDropMain(chip.idx)"
                    @dragend="onDragEnd"
                  >
                    <span class="col-chip-index">{{ chip.displayIndex }}</span>
                    {{ t(stockColLabel[chip.key]) }}
                  </span>
                  <span
                    v-else
                    class="col-chip col-chip-split active"
                    :title="t('columnOrderSplitToggle')"
                    @click="toggleSplit(chip.key)"
                  >
                    <span class="col-chip-marker">+</span>
                    {{ t(splitColLabel[chip.key]) }}
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
                  @drop="onDropMain(idx)"
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
