<script setup lang="ts">
import { reactive } from 'vue'

const versions = reactive({ ...window.electron.process.versions })

</script>

<template>
  <ul class="versions">
    <li class="electron-version color-green">Electron v{{ versions.electron }}</li>
    <li class="chrome-version color-pink">Chromium v{{ versions.chrome }}</li>
    <li class="node-version color-blue">Node v{{ versions.node }}</li>
  </ul>
</template>

<style scoped>
.color-green {
  color: var(--ev-c-green);
}

.color-blue {
  color: var(--ev-c-blue);
}

.color-pink {
  color: var(--ev-c-pink);
}
</style>
