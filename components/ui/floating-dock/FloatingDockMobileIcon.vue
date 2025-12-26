<template>
  <Transition name="floating-dock-mobile">
    <a
      v-if="open"
      :href="linkHref"
      :target="props.target"
      :rel="computedRel"
      :aria-label="computedAriaLabel"
      class="floating-dock-mobile-item flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-neutral-600 shadow-sm transition dark:bg-neutral-900 dark:text-neutral-200"
      :style="{ transitionDelay }"
      @click="handleClick"
    >
      <slot>
        <component
          v-if="props.icon"
          :is="props.icon"
          :class="cn('h-4 w-4 text-neutral-500 dark:text-neutral-300', props.iconClass)"
        />
      </slot>
    </a>
  </Transition>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { computed, inject, onBeforeUpdate, ref } from 'vue';
import {
  FLOATING_DOCK_MOBILE_CLOSE_KEY,
  FLOATING_DOCK_MOBILE_INDEX_KEY,
  FLOATING_DOCK_MOBILE_OPEN_KEY,
} from './injectionKeys';
import type { FloatingDockItemProps } from './types';

const props = defineProps<FloatingDockItemProps>();

const closeMobile = inject(FLOATING_DOCK_MOBILE_CLOSE_KEY, () => {});
const registerIndex = inject(FLOATING_DOCK_MOBILE_INDEX_KEY, null);
const open = inject(FLOATING_DOCK_MOBILE_OPEN_KEY, ref(false));

const itemIndex = ref(registerIndex ? registerIndex() : 0);

onBeforeUpdate(() => {
  itemIndex.value = registerIndex ? registerIndex() : 0;
});

const linkHref = computed(() => props.href ?? '#');
const computedRel = computed(() => props.rel ?? (props.target === '_blank' ? 'noreferrer noopener' : undefined));
const computedAriaLabel = computed(() => props.ariaLabel ?? props.title);
const transitionDelay = computed(() => `${itemIndex.value * 50}ms`);

const handleClick = (event: MouseEvent) => {
  if (props.onClick) {
    event.preventDefault();
    event.stopPropagation();
    props.onClick();
  }
  closeMobile?.();
};
</script>
