<template>
  <div v-if="isDesktop" :class="separatorClass" aria-hidden="true"></div>
  <Transition v-else name="floating-dock-mobile">
    <div v-if="mobileOpen" :class="mobileSeparatorClass" :style="{ transitionDelay }" aria-hidden="true"></div>
  </Transition>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { computed, inject, onBeforeUpdate, ref, type HTMLAttributes } from 'vue';
import {
  FLOATING_DOCK_MOBILE_INDEX_KEY,
  FLOATING_DOCK_MOBILE_OPEN_KEY,
  FLOATING_DOCK_ORIENTATION_KEY,
  FLOATING_DOCK_VARIANT_KEY,
} from './injectionKeys';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();

const variant = inject(FLOATING_DOCK_VARIANT_KEY, 'desktop');
const orientation = inject(
  FLOATING_DOCK_ORIENTATION_KEY,
  computed(() => 'horizontal'),
);
const registerIndex = inject(FLOATING_DOCK_MOBILE_INDEX_KEY, null);
const mobileOpen = inject(FLOATING_DOCK_MOBILE_OPEN_KEY, ref(false));

const itemIndex = ref(registerIndex ? registerIndex() : 0);
onBeforeUpdate(() => {
  itemIndex.value = registerIndex ? registerIndex() : 0;
});

const isDesktop = computed(() => variant === 'desktop');

const separatorClass = computed(() =>
  cn(
    'rounded-full bg-gray-200/70 dark:bg-white/20',
    orientation.value === 'vertical' ? 'h-0.5 w-4/5 self-center' : 'h-4/5 w-0.5',
    props.class,
  ),
);

const mobileSeparatorClass = computed(() => cn('h-px w-8 rounded-full bg-gray-200/70 dark:bg-white/15', props.class));

const transitionDelay = computed(() => `${itemIndex.value * 50}ms`);
</script>
