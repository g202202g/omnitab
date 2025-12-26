<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DEFAULT_ICON_NAME, fetchIconSvg, normalizeIconName } from '@/lib/iconify';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    name?: string;
    height?: number;
    color?: string;
    fallbackText?: string;
  }>(),
  {
    height: 24,
    color: 'currentColor',
  },
);

const svgContent = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
let loadToken = 0;

const resolvedName = computed(() => normalizeIconName(props.name, DEFAULT_ICON_NAME));
const fallbackLabel = computed(
  () => props.fallbackText ?? resolvedName.value.split(':')[1]?.slice(0, 1)?.toUpperCase() ?? '?',
);
const showSpinner = computed(() => isLoading.value && !svgContent.value && !errorMessage.value);
const showFallback = computed(() => !svgContent.value && !showSpinner.value);

const loadIcon = async () => {
  const token = ++loadToken;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const svg = await fetchIconSvg(resolvedName.value, { height: props.height, color: props.color });
    if (token !== loadToken) return;
    svgContent.value = svg;
  } catch (error) {
    if (token !== loadToken) return;
    console.error('[DynamicIcon] load failed', error);
    svgContent.value = '';
    errorMessage.value = error instanceof Error ? error.message : '加载失败';
  } finally {
    if (token === loadToken) {
      isLoading.value = false;
    }
  }
};

watch(
  () => [resolvedName.value, props.height, props.color],
  () => {
    svgContent.value = '';
    void loadIcon();
  },
  { immediate: true },
);
</script>

<template>
  <span
    v-bind="$attrs"
    class="inline-flex items-center justify-center text-current"
    role="img"
    :aria-label="resolvedName"
    :aria-busy="showSpinner ? 'true' : undefined"
    :data-loading="isLoading || undefined"
    :data-error="errorMessage ? true : undefined"
  >
    <span
      v-if="svgContent"
      class="inline-flex h-full w-full items-center justify-center"
      v-html="svgContent"
      aria-hidden="true"
    />
    <div v-else-if="showSpinner" class="inline-flex h-full w-full items-center justify-center">
      <span
        class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        aria-hidden="true"
      />
      <span class="sr-only">图标加载中</span>
    </div>
    <slot v-else-if="showFallback" name="fallback">
      <span class="text-[10px] font-semibold uppercase opacity-70">{{ fallbackLabel }}</span>
    </slot>
    <span v-else class="text-[10px] font-semibold text-rose-400 uppercase" role="alert">
      {{ fallbackLabel }}
    </span>
  </span>
</template>
