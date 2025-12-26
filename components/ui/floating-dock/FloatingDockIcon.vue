<template>
  <FloatingDockDesktopIcon v-if="variant === 'desktop'" v-bind="props">
    <slot />
  </FloatingDockDesktopIcon>
  <FloatingDockMobileIcon v-else v-bind="props">
    <slot />
  </FloatingDockMobileIcon>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import FloatingDockDesktopIcon from './FloatingDockDesktopIcon.vue';
import FloatingDockMobileIcon from './FloatingDockMobileIcon.vue';
import { FLOATING_DOCK_VARIANT_KEY } from './injectionKeys';
import type { FloatingDockItemProps } from './types';

const props = defineProps<FloatingDockItemProps>();
const variant = inject(FLOATING_DOCK_VARIANT_KEY, 'desktop');
</script>
