<script setup lang="ts">
import { computed } from 'vue';
import type { PageInfo } from '@/composables/usePageStore';
import { usePageBackground } from '@/composables/usePageBackground';

const props = defineProps<{
  page: PageInfo | null;
}>();

const current = computed(() => props.page);
const { pageBgStyle, overlayStyle } = usePageBackground(current);
</script>

<template>
  <div class="pointer-events-none absolute inset-0">
    <div class="absolute inset-0 scale-[1.02] object-cover transition-opacity duration-700" :style="pageBgStyle" />
    <div class="absolute inset-0" :style="overlayStyle" />
  </div>
</template>
