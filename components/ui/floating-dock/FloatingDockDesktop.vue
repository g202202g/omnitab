<template>
  <div :class="containerClass" @mousemove="onMouseMove" @mouseleave="resetMouse">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { useMotionValue } from 'motion-v';
import { computed, provide, type HTMLAttributes } from 'vue';
import {
  FLOATING_DOCK_MOUSE_POSITION_KEY,
  FLOATING_DOCK_ORIENTATION_KEY,
  FLOATING_DOCK_VARIANT_KEY,
} from './injectionKeys';
import type { FloatingDockDirection, FloatingDockOrientation } from './types';

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    orientation?: FloatingDockOrientation;
    direction?: FloatingDockDirection;
  }>(),
  {
    orientation: 'horizontal',
    direction: 'middle',
  },
);

const mousePosition = useMotionValue<number>(Number.POSITIVE_INFINITY);
const orientationRef = computed(() => props.orientation);

provide(FLOATING_DOCK_VARIANT_KEY, 'desktop');
provide(FLOATING_DOCK_MOUSE_POSITION_KEY, mousePosition);
provide(FLOATING_DOCK_ORIENTATION_KEY, orientationRef);

const onMouseMove = (event: MouseEvent) => {
  mousePosition.set(orientationRef.value === 'vertical' ? event.pageY : event.pageX);
};

const resetMouse = () => {
  mousePosition.set(Number.POSITIVE_INFINITY);
};

const containerClass = computed(() => {
  const orientationClass =
    orientationRef.value === 'vertical'
      ? 'h-max w-[58px] flex-col gap-4 px-2 py-4'
      : 'h-16 flex-row items-end gap-4 px-4 pb-3';

  const directionClass =
    orientationRef.value === 'vertical'
      ? {
          'justify-start': props.direction === 'top',
          'justify-center': props.direction === 'middle',
          'justify-end': props.direction === 'bottom',
        }
      : {
          'items-start': props.direction === 'top',
          'items-center': props.direction === 'middle',
          'items-end': props.direction === 'bottom',
        };

  return cn(
    'text-foreground mx-auto hidden rounded-2xl bg-gray-50 shadow-sm md:flex dark:bg-neutral-900',
    orientationClass,
    directionClass,
    props.class,
  );
});
</script>
