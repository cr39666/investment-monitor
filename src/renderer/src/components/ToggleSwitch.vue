<script setup lang="ts">
defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div class="toggle-switch" :class="{ active }" @click="emit('toggle')">
    <div class="toggle-handle"></div>
  </div>
</template>

<style scoped>
.toggle-switch {
  width: 32px;
  height: 18px;
  background: #444;
  border-radius: 9px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
  flex-shrink: 0;
}

.toggle-switch.active {
  background: #2ecc71;
}

.toggle-handle {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.3s;
}

.toggle-switch.active .toggle-handle {
  transform: translateX(14px);
}
</style>
