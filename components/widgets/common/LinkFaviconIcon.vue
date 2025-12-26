<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { buildExtensionFaviconUrl, canUseExtensionFavicon } from '@/utils/extensionFavicon';

const props = withDefaults(
  defineProps<{
    href: string;
    title?: string;
    showFavicon?: boolean;
    faviconSize?: number;
    containerClass?: string;
    imgClass?: string;
  }>(),
  {
    title: '',
    showFavicon: true,
    faviconSize: 32,
    containerClass: '',
    imgClass: '',
  },
);

const faviconFailed = ref(false);
watch(
  () => props.href,
  () => {
    faviconFailed.value = false;
  },
);

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

const canShowFavicon = computed(() => {
  if (!props.showFavicon) return false;
  if (!props.href || !isHttpUrl(props.href)) return false;
  if (faviconFailed.value) return false;
  return canUseExtensionFavicon();
});

const faviconUrl = computed(() => {
  if (!canShowFavicon.value) return '';
  return buildExtensionFaviconUrl(props.href, props.faviconSize) ?? '';
});

const resolveHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const fallbackLetter = computed(() => {
  const raw = (props.title?.trim() || resolveHost(props.href) || '?').slice(0, 1).toUpperCase();
  return raw || '?';
});
</script>

<template>
  <div class="grid place-items-center overflow-hidden" :class="containerClass">
    <img
      v-if="canShowFavicon && faviconUrl"
      :src="faviconUrl"
      alt=""
      loading="lazy"
      :class="imgClass"
      @error="faviconFailed = true"
    />
    <slot v-else name="fallback">
      <span class="text-xs font-semibold">
        {{ fallbackLetter }}
      </span>
    </slot>
  </div>
</template>
