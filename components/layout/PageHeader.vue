<script lang="ts" setup>
import type { Component } from 'vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    icon?: Component;
    title: string;
    description?: string;
    variant?: 'default' | 'subtle';
  }>(),
  {
    variant: 'default',
  },
);

const containerClass = computed(() =>
  props.variant === 'subtle'
    ? 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3 text-muted-foreground shadow-sm backdrop-blur'
    : 'flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card/80 px-5 py-4 text-card-foreground shadow-sm backdrop-blur',
);

const iconWrapperClass = computed(() =>
  props.variant === 'subtle'
    ? 'flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-background/70'
    : 'flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground',
);

const iconClass = computed(() =>
  props.variant === 'subtle' ? 'h-5 w-5 text-muted-foreground/80' : 'h-6 w-6 text-primary',
);
const titleClass = computed(() =>
  props.variant === 'subtle' ? 'text-base font-medium text-muted-foreground' : 'text-xl font-semibold text-foreground',
);
const descriptionClass = computed(() =>
  props.variant === 'subtle' ? 'text-xs text-muted-foreground/70' : 'text-sm text-muted-foreground',
);
</script>

<template>
  <div :class="containerClass">
    <div class="flex items-center gap-3">
      <div v-if="icon" :class="iconWrapperClass">
        <component :is="icon" class="shrink-0" :class="iconClass" />
      </div>
      <div class="leading-tight">
        <p :class="titleClass">{{ title }}</p>
        <p v-if="description" :class="descriptionClass">{{ description }}</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
