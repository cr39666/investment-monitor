<script setup lang="ts">
import type { StockQuote, WatchStockItem } from '../types/stock'

defineProps<{
  watchStocks: WatchStockItem[]
  displayWatchStocks: WatchStockItem[]
  selectedWatchCodes: string[]
  quotes: Record<string, StockQuote>
  shownCodes: string[]
  nameDisplayMode: number
  t: (key: string) => string
  formatName: (name: string | undefined) => string
}>()

const emit = defineEmits<{
  toggleRowSelection: [code: string]
  toggleNameDisplay: [code: string]
}>()
</script>

<template>
  <table class="stock-table watch-table">
    <thead v-if="watchStocks.length > 0">
      <tr>
        <th :title="t('name')" class="col-name">{{ t('thName') }}</th>
        <th :title="t('currentPrice')" class="col-price">{{ t('thPrice') }}</th>
        <th :title="t('change')" class="col-num">{{ t('thChg') }}</th>
        <th :title="t('changeAmount')" class="col-num">{{ t('thChangeAmount') }}</th>
        <th :title="t('stockCode')" class="col-code">{{ t('thCode') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="stock in displayWatchStocks"
        :key="stock.code"
        :class="{ 'row-selected': selectedWatchCodes.includes(stock.code) }"
        @click="emit('toggleRowSelection', stock.code)"
      >
        <td
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
        <td class="col-price" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
          {{ quotes[stock.code]?.currentPrice?.toFixed(2) || '--' }}
        </td>
        <td class="col-num" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
          <span v-if="quotes[stock.code]">
            {{ quotes[stock.code].changePercent > 0 ? '+' : '' }}{{ quotes[stock.code].changePercent }}%
          </span>
          <span v-else>--</span>
        </td>
        <td class="col-num" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
          <span v-if="quotes[stock.code]">
            {{ quotes[stock.code].changeAmount > 0 ? '+' : ''
            }}{{ quotes[stock.code].changeAmount.toFixed(2) }}
          </span>
          <span v-else>--</span>
        </td>
        <td class="col-code" :class="[(quotes[stock.code]?.changeAmount || 0) >= 0 ? 'red' : 'green']">
          {{ stock.code }}
        </td>
      </tr>
      <tr v-if="watchStocks.length === 0">
        <td colspan="5" class="empty-row">{{ t('noWatchStocks') }}</td>
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
.stock-table td.col-code,
.stock-table td:last-child {
  text-align: center;
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

.stock-table td {
  font-size: 12px;
}

.name-cell {
  white-space: nowrap;
  text-align: center !important;
  font-size: 10px;
}

.stock-table td.col-price,
.stock-table td.col-num,
.stock-table td.col-code {
  font-size: 14px;
}

.stock-table td.col-code {
  font-size: 12px;
  color: #aaa;
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
</style>
