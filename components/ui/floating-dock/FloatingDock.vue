<template>
  <div class="contents">
    <FloatingDockDesktop :class="props.desktopClassName" :orientation="props.orientation" :direction="props.direction">
      <slot />
    </FloatingDockDesktop>
    <FloatingDockMobile :class="props.mobileClassName" :orientation="props.orientation">
      <slot />
    </FloatingDockMobile>
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue';
import type { HTMLAttributes } from 'vue';
import FloatingDockDesktop from './FloatingDockDesktop.vue';
import FloatingDockMobile from './FloatingDockMobile.vue';
import { FLOATING_DOCK_INDICATOR_POSITION_KEY } from './injectionKeys';
import type { FloatingDockDirection, FloatingDockIndicatorPosition, FloatingDockOrientation } from './types';

const props = withDefaults(
  defineProps<{
    desktopClassName?: HTMLAttributes['class'];
    mobileClassName?: HTMLAttributes['class'];
    orientation?: FloatingDockOrientation;
    direction?: FloatingDockDirection;
    indicatorPosition?: FloatingDockIndicatorPosition;
  }>(),
  {
    orientation: 'horizontal',
    direction: 'middle',
  },
);

const indicatorPositionRef = computed(() => props.indicatorPosition);
provide(FLOATING_DOCK_INDICATOR_POSITION_KEY, indicatorPositionRef);
</script>
