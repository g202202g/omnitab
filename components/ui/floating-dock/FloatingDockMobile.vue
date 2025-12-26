<template>
  <div class="relative block md:hidden" :class="props.class">
    <div
      class="absolute inset-x-0 bottom-full mb-2 flex flex-col items-center gap-2"
      :class="open ? 'pointer-events-auto' : 'pointer-events-none'"
    >
      <slot />
    </div>

    <button
      type="button"
      class="focus-visible:ring-ring/50 focus-visible:ring-offset-background flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-neutral-600 shadow-sm transition hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
      aria-label="切换 Dock 菜单"
      title="切换 Dock 菜单"
      :aria-expanded="open"
      @click="toggle"
    >
      <IconLayoutNavbarCollapse class="h-5 w-5 text-neutral-500 dark:text-neutral-300" />
      <span class="sr-only">切换 Dock 菜单</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { IconLayoutNavbarCollapse } from '@tabler/icons-vue';
import { computed, onBeforeUpdate, provide, ref, type HTMLAttributes } from 'vue';
import {
  FLOATING_DOCK_MOBILE_CLOSE_KEY,
  FLOATING_DOCK_MOBILE_INDEX_KEY,
  FLOATING_DOCK_MOBILE_OPEN_KEY,
  FLOATING_DOCK_ORIENTATION_KEY,
  FLOATING_DOCK_VARIANT_KEY,
} from './injectionKeys';
import type { FloatingDockOrientation } from './types';

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    orientation?: FloatingDockOrientation;
  }>(),
  {
    orientation: 'horizontal',
  },
);

const open = ref(false);
const counter = ref(0);
const orientationRef = computed(() => props.orientation);

const registerIndex = () => counter.value++;
const close = () => {
  open.value = false;
};
const toggle = () => {
  open.value = !open.value;
};

provide(FLOATING_DOCK_VARIANT_KEY, 'mobile');
provide(FLOATING_DOCK_ORIENTATION_KEY, orientationRef);
provide(FLOATING_DOCK_MOBILE_OPEN_KEY, open);
provide(FLOATING_DOCK_MOBILE_CLOSE_KEY, close);
provide(FLOATING_DOCK_MOBILE_INDEX_KEY, registerIndex);

onBeforeUpdate(() => {
  counter.value = 0;
});
</script>

<style>
.floating-dock-mobile-enter-active,
.floating-dock-mobile-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.floating-dock-mobile-enter-from,
.floating-dock-mobile-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
