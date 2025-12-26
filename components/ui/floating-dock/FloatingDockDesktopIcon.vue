<template>
  <a
    :href="linkHref"
    :target="props.target"
    :rel="computedRel"
    :aria-label="ariaLabel"
    :aria-current="props.active ? 'page' : undefined"
    class="focus-visible:ring-ring/50 focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    @click="handleClick"
  >
    <div
      ref="iconRef"
      class="relative flex aspect-square items-center justify-center rounded-full bg-gray-200 text-neutral-600 transition-colors dark:bg-neutral-800 dark:text-neutral-200"
      :style="outerStyle"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @focusin="hovered = true"
      @focusout="hovered = false"
    >
      <Transition name="floating-dock-tooltip">
        <div
          v-if="hovered"
          class="break-all"
          :data-orientation="isVertical ? 'vertical' : 'horizontal'"
          :class="tooltipClass"
        >
          {{ props.title }}
        </div>
      </Transition>
      <div class="flex items-center justify-center text-inherit" :style="innerStyle">
        <slot>
          <component
            v-if="props.icon"
            :is="props.icon"
            :class="cn('h-full w-full text-neutral-500 dark:text-neutral-300', props.iconClass)"
          />
        </slot>
      </div>
      <span v-if="props.active" :class="indicatorWrapperClass">
        <span
          class="bg-primary block h-1.5 w-1.5 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.6)] dark:bg-white/90"
        />
      </span>
    </div>
  </a>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { useMotionValue, useSpring, useTransform, type MotionValue } from 'motion-v';
import { computed, inject, onBeforeUnmount, ref } from 'vue';
import {
  FLOATING_DOCK_INDICATOR_POSITION_KEY,
  FLOATING_DOCK_MOUSE_POSITION_KEY,
  FLOATING_DOCK_ORIENTATION_KEY,
} from './injectionKeys';
import type { FloatingDockItemProps } from './types';

const props = defineProps<FloatingDockItemProps>();

const injectedMouse = inject(FLOATING_DOCK_MOUSE_POSITION_KEY, null);
const orientation = inject(
  FLOATING_DOCK_ORIENTATION_KEY,
  computed(() => 'horizontal'),
);
const isVertical = computed(() => orientation.value === 'vertical');
const mouseX = injectedMouse ?? useMotionValue<number>(Number.POSITIVE_INFINITY);

const iconRef = ref<HTMLElement | null>(null);
const hovered = ref(false);

const distance = useTransform(mouseX, (val) => {
  const bounds = iconRef.value?.getBoundingClientRect() ?? { x: 0, y: 0, width: 0, height: 0 };
  if (!Number.isFinite(val)) return Number.POSITIVE_INFINITY;
  if (orientation.value === 'vertical') {
    return val - bounds.y - bounds.height / 2;
  }
  return val - bounds.x - bounds.width / 2;
});

const widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
const heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
const widthIconTransform = useTransform(distance, [-150, 0, 150], [20, 40, 20]);
const heightIconTransform = useTransform(distance, [-150, 0, 150], [20, 40, 20]);

const springConfig = { mass: 0.1, stiffness: 150, damping: 12 };
const widthSpring = useSpring(widthTransform, springConfig);
const heightSpring = useSpring(heightTransform, springConfig);
const widthIconSpring = useSpring(widthIconTransform, springConfig);
const heightIconSpring = useSpring(heightIconTransform, springConfig);

const outerWidth = useMotionNumber(widthSpring, 40);
const outerHeight = useMotionNumber(heightSpring, 40);
const innerWidth = useMotionNumber(widthIconSpring, 20);
const innerHeight = useMotionNumber(heightIconSpring, 20);

const outerStyle = computed(() => ({
  width: `${outerWidth.value}px`,
  height: `${outerHeight.value}px`,
}));

const innerStyle = computed(() => ({
  width: `${innerWidth.value}px`,
  height: `${innerHeight.value}px`,
}));

const linkHref = computed(() => props.href ?? '#');
const computedRel = computed(() => props.rel ?? (props.target === '_blank' ? 'noreferrer noopener' : undefined));
const ariaLabel = computed(() => props.ariaLabel ?? props.title);
const tooltipClass = computed(() =>
  cn(
    'pointer-events-none absolute w-fit rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-neutral-700 shadow-md dark:border-neutral-900 dark:bg-neutral-800 dark:text-white',
    isVertical.value ? 'top-1/2 left-full ml-3 -translate-y-1/2' : '-top-8 left-1/2 -translate-x-1/2',
  ),
);
const injectedIndicatorPosition = inject(FLOATING_DOCK_INDICATOR_POSITION_KEY, null);
const indicatorPosition = computed(() => {
  if (props.indicatorPosition) return props.indicatorPosition;
  const injected = injectedIndicatorPosition?.value;
  if (injected) return injected;
  return isVertical.value ? 'right' : 'bottom';
});
const indicatorWrapperClass = computed(() => {
  const base = 'pointer-events-none absolute';
  switch (indicatorPosition.value) {
    case 'top':
      return cn(base, 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2');
    case 'bottom':
      return cn(base, 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2');
    case 'left':
      return cn(base, 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2');
    case 'right':
    default:
      return cn(base, 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2');
  }
});

function useMotionNumber(motionVal: MotionValue<number>, initial: number) {
  const result = ref(initial);
  const unsubscribe = motionVal.on('change', (latest) => {
    result.value = Number.isFinite(latest) ? latest : initial;
  });
  onBeforeUnmount(() => {
    unsubscribe?.();
  });
  return result;
}

const handleClick = (event: MouseEvent) => {
  if (props.onClick) {
    event.preventDefault();
    event.stopPropagation();
    props.onClick();
  }
};
</script>

<style scoped>
.floating-dock-tooltip-enter-active,
.floating-dock-tooltip-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.floating-dock-tooltip-enter-from,
.floating-dock-tooltip-leave-to {
  opacity: 0;
}
.floating-dock-tooltip-enter-from[data-orientation='horizontal'],
.floating-dock-tooltip-leave-to[data-orientation='horizontal'] {
  transform: translate(-50%, 6px);
}
.floating-dock-tooltip-enter-from[data-orientation='vertical'],
.floating-dock-tooltip-leave-to[data-orientation='vertical'] {
  transform: translateY(-50%) translateX(-6px);
}
</style>
