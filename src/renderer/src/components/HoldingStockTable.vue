<script setup lang="ts">
import { computed } from 'vue'
import type { StockColumnKey } from '../utils/columnOrder'
import type { StockItem, StockQuote } from '../types/stock'

const props = defineProps<{
  // 新格式：完整列顺序（主列+拆分列），如 ['name','price','split:chg','dpnl',...]
  fullColumnOrder?: string[]
  // 旧格式：主列顺序（向后兼容）
  columnOrder?: StockColumnKey[]
  stocks: StockItem[]
  displayStocks: StockItem[]
  selectedCodes: string[]
  quotes: Record<string, StockQuote>
  shownCodes: string[]
  nameDisplayMode: number
  priceDisplayMode: number
  dpnlDisplayMode: number
  tpnlDisplayMode: number
  avgDisplayMode: number
  qtyDisplayMode: number
  splitChg?: boolean
  splitDpnl?: boolean
  splitPnl?: boolean
  splitVal?: boolean
  sortColumn: string | null
  sortOrder: 'asc' | 'desc' | 'none'
  t: (key: string) => string
  formatName: (name: string | undefined) => string
  calculateDailyPnl: (stock: StockItem) => number | null
  calculateDailyPnlPercent: (stock: StockItem) => number | null
  calculateTotalPnl: (stock: StockItem) => number | null
  calculateTotalPnlPercent: (stock: StockItem) => number | null
  calculateMarketValue: (stock: StockItem) => number
  formatPnlPercent: (value: number | null) => string
  formatPriceAlerts: (stock: StockItem) => string
}>()

const emit = defineEmits<{
  toggleRowSelection: [code: string]
  toggleNameDisplay: [code: string]
  toggleNameDisplayMode: []
  togglePriceDisplayMode: []
  toggleDpnlDisplayMode: []
  toggleTpnlDisplayMode: []
  toggleAvgDisplayMode: []
  toggleQtyDisplayMode: []
  toggleSort: [column: string]
  adjustStock: [stock: StockItem]
  setPriceAlert: [stock: StockItem]
}>()

const effectiveSplitChg = computed(() => {
  if (props.fullColumnOrder) {
    return props.fullColumnOrder.some((k) => k === 'split:chg')
  }
  return props.splitChg || false
})
const effectiveSplitDpnl = computed(() => {
  if (props.fullColumnOrder) {
    return props.fullColumnOrder.some((k) => k === 'split:dpnl')
  }
  return props.splitDpnl || false
})
const effectiveSplitPnl = computed(() => {
  if (props.fullColumnOrder) {
    return props.fullColumnOrder.some((k) => k === 'split:pnl')
  }
  return props.splitPnl || false
})
const effectiveSplitVal = computed(() => {
  if (props.fullColumnOrder) {
    return props.fullColumnOrder.some((k) => k === 'split:val')
  }
  return props.splitVal || false
})

// 用于模板遍历的列顺序（统一为 string[] 格式，支持主列和拆分列）
const displayColumnOrder = computed<string[]>(() => {
  if (props.fullColumnOrder) return props.fullColumnOrder
  // 降级：从 columnOrder + splitXxx 构造（保持向后兼容）
  const result: string[] = []
  const order = props.columnOrder || ['name', 'price', 'dpnl', 'tpnl', 'avg', 'qty']
  const splitKeys: string[] = []
  if (props.splitChg) splitKeys.push('split:chg')
  if (props.splitDpnl) splitKeys.push('split:dpnl')
  if (props.splitPnl) splitKeys.push('split:pnl')
  if (props.splitVal) splitKeys.push('split:val')
  // 简单策略：主列按 order 排列，拆分列附在其父列后面（向后兼容的显示方式）
  const splitParent: Record<string, string> = { chg: 'price', dpnl: 'dpnl', pnl: 'tpnl', val: 'avg' }
  order.forEach((mainKey) => {
    result.push(mainKey as string)
    splitKeys.forEach((sk) => {
      const skName = sk.slice(6)
      if (splitParent[skName] === mainKey) result.push(sk)
    })
  })
  return result
})
</script>

<template>
  <table class="stock-table">
    <thead v-if="stocks.length > 0">
      <tr>
        <template v-for="key in displayColumnOrder" :key="`th-${key}`">
          <th
            v-if="key === 'name'"
            :title="nameDisplayMode === 0 ? t('name') : t('stockCode')"
            class="clickable-th col-name"
          >
            <span class="th-text" @click="emit('toggleNameDisplayMode')">{{
              nameDisplayMode === 0 ? t('thName') : t('thCode')
            }}</span>
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'name' }]"
              @click="emit('toggleSort', 'name')"
              >{{ sortColumn === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th
            v-else-if="key === 'price'"
            :title="
              effectiveSplitChg
                ? t('currentPrice')
                : priceDisplayMode === 0
                  ? t('currentPrice')
                  : priceDisplayMode === 1
                    ? t('change')
                    : t('priceAndChange')
            "
            class="clickable-th col-price"
          >
            <span
              :class="effectiveSplitChg ? 'th-text-static' : 'th-text'"
              @click="effectiveSplitChg ? undefined : emit('togglePriceDisplayMode')"
              >{{
                effectiveSplitChg
                  ? t('thPrice')
                  : priceDisplayMode === 0
                    ? t('thPrice')
                    : priceDisplayMode === 1
                      ? t('thChg')
                      : t('thPriceChg')
              }}</span
            >
            <span
              :class="[
                'sort-icon',
                {
                  'sort-active':
                    sortColumn ===
                    (effectiveSplitChg ? 'curPrice' : priceDisplayMode === 1 ? 'change' : 'curPrice')
                }
              ]"
              @click="
                emit(
                  'toggleSort',
                  effectiveSplitChg ? 'curPrice' : priceDisplayMode === 1 ? 'change' : 'curPrice'
                )
              "
              >{{
                sortColumn === 'curPrice' || sortColumn === 'change' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
              }}</span
            >
          </th>

          <th v-else-if="key === 'split:chg'" :title="t('change')" class="clickable-th col-num">
            <span class="th-text-static">{{ t('thChg') }}</span>
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'change' }]"
              @click="emit('toggleSort', 'change')"
              >{{ sortColumn === 'change' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th
            v-else-if="key === 'dpnl'"
            :title="
              effectiveSplitDpnl
                ? t('dailyPnl')
                : dpnlDisplayMode === 0
                  ? t('dailyPnl')
                  : dpnlDisplayMode === 1
                    ? t('dailyPnlPercent')
                    : t('dailyPnl') + ' / ' + t('dailyPnlPercent')
            "
            class="clickable-th col-num"
          >
            <span
              :class="effectiveSplitDpnl ? 'th-text-static' : 'th-text'"
              @click="effectiveSplitDpnl ? undefined : emit('toggleDpnlDisplayMode')"
              >{{
                effectiveSplitDpnl
                  ? t('thDPnl')
                  : dpnlDisplayMode === 0
                    ? t('thDPnl')
                    : dpnlDisplayMode === 1
                      ? t('thDPnlPct')
                      : t('thDPnlBoth')
              }}</span
            >
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'dpnl' }]"
              @click="emit('toggleSort', 'dpnl')"
              >{{ sortColumn === 'dpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th v-else-if="key === 'split:dpnl'" :title="t('dailyPnlPercent')" class="clickable-th col-num">
            <span class="th-text-static">{{ t('thDPnlPct') }}</span>
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'dpnlPct' }]"
              @click="emit('toggleSort', 'dpnlPct')"
              >{{ sortColumn === 'dpnlPct' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th
            v-else-if="key === 'tpnl'"
            :title="
              effectiveSplitPnl
                ? t('totalPnl')
                : tpnlDisplayMode === 0
                  ? t('totalPnl')
                  : tpnlDisplayMode === 1
                    ? t('totalPnlPercent')
                    : t('totalPnl') + ' / ' + t('totalPnlPercent')
            "
            class="clickable-th col-num"
          >
            <span
              :class="effectiveSplitPnl ? 'th-text-static' : 'th-text'"
              @click="effectiveSplitPnl ? undefined : emit('toggleTpnlDisplayMode')"
              >{{
                effectiveSplitPnl
                  ? t('thTPnl')
                  : tpnlDisplayMode === 0
                    ? t('thTPnl')
                    : tpnlDisplayMode === 1
                      ? t('thTPnlPct')
                      : t('thTPnlBoth')
              }}</span
            >
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'tpnl' }]"
              @click="emit('toggleSort', 'tpnl')"
              >{{ sortColumn === 'tpnl' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th v-else-if="key === 'split:pnl'" :title="t('totalPnlPercent')" class="clickable-th col-num">
            <span class="th-text-static">{{ t('thTPnlPct') }}</span>
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'tpnlPct' }]"
              @click="emit('toggleSort', 'tpnlPct')"
              >{{ sortColumn === 'tpnlPct' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th
            v-else-if="key === 'avg'"
            :title="
              effectiveSplitVal
                ? t('avgBuyPrice')
                : avgDisplayMode === 0
                  ? t('avgBuyPrice')
                  : avgDisplayMode === 1
                    ? t('marketValue')
                    : t('avgBuyPrice') + ' / ' + t('marketValue')
            "
            class="clickable-th col-avg"
          >
            <span
              :class="effectiveSplitVal ? 'th-text-static' : 'th-text'"
              @click="effectiveSplitVal ? undefined : emit('toggleAvgDisplayMode')"
              >{{
                effectiveSplitVal
                  ? t('thAvg')
                  : avgDisplayMode === 0
                    ? t('thAvg')
                    : avgDisplayMode === 1
                      ? t('thVal')
                      : t('thAvgVal')
              }}</span
            >
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'avg' }]"
              @click="emit('toggleSort', 'avg')"
              >{{ sortColumn === 'avg' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th v-else-if="key === 'split:val'" :title="t('marketValue')" class="clickable-th col-avg">
            <span class="th-text-static">{{ t('thVal') }}</span>
            <span
              :class="['sort-icon', { 'sort-active': sortColumn === 'marketVal' }]"
              @click="emit('toggleSort', 'marketVal')"
              >{{ sortColumn === 'marketVal' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span
            >
          </th>

          <th
            v-else-if="key === 'qty'"
            :title="qtyDisplayMode === 0 ? t('amount') : t('priceAlert')"
            class="clickable-th col-qty"
          >
            <span class="th-text" @click="emit('toggleQtyDisplayMode')">{{
              qtyDisplayMode === 0 ? t('thQty') : t('thAlert')
            }}</span>
          </th>
        </template>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="stock in displayStocks"
        :key="stock.code"
        :class="{ 'row-selected': selectedCodes.includes(stock.code) }"
        @click="emit('toggleRowSelection', stock.code)"
      >
        <template v-for="key in displayColumnOrder" :key="`td-${stock.code}-${key}`">
          <td
            v-if="key === 'name'"
            :class="['name-cell', (quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
            :title="quotes[stock.code]?.name || stock.code"
            @click.stop="emit('toggleNameDisplay', stock.code)"
          >
            <div class="clickable-tag">
              <span
                v-if="
                  (nameDisplayMode === 0 && !shownCodes.includes(stock.code)) ||
                  (nameDisplayMode === 1 && shownCodes.includes(stock.code))
                "
                >{{ formatName(quotes[stock.code]?.name) }}</span
              >
              <span v-else>{{ stock.code }}</span>
            </div>
          </td>

          <td
            v-else-if="key === 'price'"
            class="col-price"
            :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
          >
            <template v-if="effectiveSplitChg || priceDisplayMode === 0">
              {{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}
            </template>
            <template v-else-if="priceDisplayMode === 1">
              <span v-if="quotes[stock.code]">
                {{ quotes[stock.code].changeAmount > 0 ? '+' : '' }}{{ quotes[stock.code].changePercent }}%
              </span>
              <span v-else>--</span>
            </template>
            <template v-else>
              <div class="price-dual">
                <span class="price-main">{{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}</span>
                <span v-if="quotes[stock.code]" class="price-chg">
                  {{ quotes[stock.code].changeAmount > 0 ? '+' : '' }}{{ quotes[stock.code].changePercent }}%
                </span>
              </div>
            </template>
          </td>

          <td
            v-else-if="key === 'split:chg'"
            class="chg-cell col-num"
            :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']"
          >
            <span v-if="quotes[stock.code]">
              {{ quotes[stock.code].changeAmount > 0 ? '+' : '' }}{{ quotes[stock.code].changePercent }}%
            </span>
            <span v-else>--</span>
          </td>

          <td
            v-else-if="key === 'dpnl'"
            class="col-num"
            :class="(calculateDailyPnl(stock) ?? 0) >= 0 ? 'red' : 'green'"
          >
            <span>
              <template v-if="effectiveSplitDpnl || dpnlDisplayMode === 0">
                {{ calculateDailyPnl(stock) !== null ? calculateDailyPnl(stock)!.toFixed(2) : '--' }}
              </template>
              <template v-else-if="dpnlDisplayMode === 1">
                {{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}
              </template>
              <template v-else>
                <div class="price-dual">
                  <span class="price-main">
                    {{ calculateDailyPnl(stock) !== null ? calculateDailyPnl(stock)!.toFixed(2) : '--' }}
                  </span>
                  <span class="price-chg">{{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}</span>
                </div>
              </template>
            </span>
          </td>

          <td
            v-else-if="key === 'split:dpnl'"
            class="col-num"
            :class="(calculateDailyPnlPercent(stock) ?? 0) >= 0 ? 'red' : 'green'"
          >
            <span>{{ formatPnlPercent(calculateDailyPnlPercent(stock)) }}</span>
          </td>

          <td
            v-else-if="key === 'tpnl'"
            class="tpnl-cell col-num"
            :class="(calculateTotalPnl(stock) || 0) >= 0 ? 'red' : 'green'"
          >
            <span>
              <template v-if="effectiveSplitPnl || tpnlDisplayMode === 0">
                {{ calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(2) : '--' }}
              </template>
              <template v-else-if="tpnlDisplayMode === 1">
                {{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}
              </template>
              <template v-else>
                <div class="price-dual">
                  <span class="price-main">{{
                    calculateTotalPnl(stock) !== null ? calculateTotalPnl(stock)!.toFixed(2) : '--'
                  }}</span>
                  <span class="price-chg">{{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}</span>
                </div>
              </template>
            </span>
          </td>

          <td
            v-else-if="key === 'split:pnl'"
            class="tpnl-cell col-num"
            :class="(calculateTotalPnlPercent(stock) || 0) >= 0 ? 'red' : 'green'"
          >
            <span>{{ formatPnlPercent(calculateTotalPnlPercent(stock)) }}</span>
          </td>

          <td v-else-if="key === 'avg'" class="col-avg">
            <span>
              <template v-if="effectiveSplitVal || avgDisplayMode === 0">
                {{ stock.cost?.toFixed(3) }}
              </template>
              <template v-else-if="avgDisplayMode === 1">
                {{
                  calculateMarketValue(stock).toLocaleString(undefined, {
                    maximumFractionDigits: 0
                  })
                }}
              </template>
              <template v-else>
                <div class="price-dual">
                  <span class="price-main">{{ stock.cost?.toFixed(3) }}</span>
                  <span class="price-chg">{{
                    calculateMarketValue(stock).toLocaleString(undefined, {
                      maximumFractionDigits: 0
                    })
                  }}</span>
                </div>
              </template>
            </span>
          </td>

          <td v-else-if="key === 'split:val'" class="col-avg">
            <span>
              {{
                calculateMarketValue(stock).toLocaleString(undefined, {
                  maximumFractionDigits: 0
                })
              }}
            </span>
          </td>

          <td
            v-else-if="key === 'qty'"
            class="clickable-cell col-qty"
            :title="qtyDisplayMode === 0 ? t('clickToAdjust') : t('setPriceAlert')"
            @click.stop="qtyDisplayMode === 0 ? emit('adjustStock', stock) : emit('setPriceAlert', stock)"
          >
            <div
              class="clickable-tag"
              :class="{ 'alert-active': qtyDisplayMode === 1 && stock.priceAlerts?.length }"
            >
              <template v-if="qtyDisplayMode === 0">
                {{ stock.amount }}
              </template>
              <template v-else>
                <span v-if="stock.priceAlerts?.length" class="alert-text">
                  {{ formatPriceAlerts(stock) }}
                </span>
                <span v-else class="alert-placeholder">➕</span>
              </template>
            </div>
          </td>
        </template>
      </tr>
      <tr v-if="stocks.length === 0">
        <td :colspan="displayColumnOrder.length" class="empty-row">
          {{ t('noStocks') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.stock-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  border-bottom: 1px solid #3a3d4a;
}

.stock-table th,
.stock-table td {
  padding: 1px 4px;
}

.stock-table th {
  border-bottom: 1px solid #3a3d4a;
  text-align: center;
  color: #aaa;
  font-size: 11px;
}

.stock-table th:first-child,
.stock-table td:first-child,
.stock-table td.col-name,
.stock-table td.col-price,
.stock-table td.col-avg,
.stock-table td.col-qty,
.stock-table td:last-child {
  text-align: center;
}

.price-dual {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.price-main {
  font-size: 13px;
}

.price-chg {
  font-size: 9px;
  opacity: 0.75;
}

.empty-row {
  text-align: center !important;
  color: #666;
  padding: 30px !important;
}

.red {
  color: var(--ev-c-pink);
}

.green {
  color: var(--ev-c-blue);
}

.clickable-th {
  cursor: default;
  user-select: none;
  white-space: nowrap;
}

.clickable-th:hover {
  color: #ccc;
}

.th-text {
  position: relative;
  cursor: pointer;
  text-decoration: underline dotted color-mix(in srgb, var(--ev-c-pink) 70%, transparent);
  text-underline-offset: 2px;
  display: inline-block;
  transition:
    color 0.2s,
    text-shadow 0.2s,
    text-decoration-color 0.2s,
    transform 0.2s;
}

.th-text:hover {
  color: var(--ev-c-pink);
  text-decoration-color: transparent;
  text-shadow: 0 0 5px color-mix(in srgb, var(--ev-c-pink) 55%, transparent);
  transform: scale(1.08);
}

.th-text-static {
  cursor: default;
}

.sort-icon {
  font-size: 10px;
  opacity: 0.55;
  margin-left: 2px;
  cursor: pointer;
  display: inline-block;
  width: 10px;
  color: #fff;
  transition:
    opacity 0.2s,
    transform 0.2s,
    color 0.2s;
  vertical-align: middle;
}

.sort-icon:hover,
.sort-icon.sort-active {
  opacity: 1;
  transform: scale(1.5);
  color: var(--ev-c-pink);
}

.clickable-th:hover .sort-icon:not(.sort-active) {
  opacity: 0.8;
}

.stock-table td {
  font-size: 12px;
}

.name-cell {
  white-space: nowrap;
  text-align: center !important;
  font-size: 10px;
}

.stock-table td.col-price,
.stock-table td.col-num {
  font-size: 14px;
}

.chg-cell {
  text-align: center;
  font-size: 14px !important;
}

.tpnl-cell {
  font-size: 14px !important;
}

.clickable-cell {
  cursor: pointer;
}

.stock-table tr {
  transition: background-color 0.2s;
  cursor: default;
}

.stock-table tbody tr:nth-child(even) {
  background-color: rgba(255, 255, 255, 0.03);
}

.stock-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.row-selected {
  background-color: rgba(46, 204, 113, 0.1) !important;
  border-radius: 6px;
}

.row-selected td {
  border-bottom-color: rgba(46, 204, 113, 0.3);
}

.row-selected td:first-child {
  border-radius: 6px 0 0 6px;
}

.row-selected td:last-child {
  border-radius: 0 6px 6px 0;
}

.clickable-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 18px;
  background-color: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  min-width: 22px;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.clickable-tag:hover {
  cursor: pointer;
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.clickable-cell .clickable-tag {
  color: #c084fc;
}

.alert-active {
  color: #f1c40f !important;
  background-color: rgba(241, 196, 15, 0.15);
  border-color: rgba(241, 196, 15, 0.3);
}

.alert-text {
  font-size: 10px;
}

.alert-placeholder {
  font-size: 10px;
  font-weight: bold;
  opacity: 0.8;
  color: #f1c40f;
}

.clickable-cell .alert-active:hover {
  background-color: rgba(241, 196, 15, 0.25);
  border-color: rgba(241, 196, 15, 0.5);
  color: #ffd700 !important;
}
</style>
