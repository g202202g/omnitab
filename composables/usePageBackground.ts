import { computed, type Ref } from 'vue';
import type { PageInfo } from './usePageStore';
import { DEFAULT_BG_IMAGE_URL } from './usePageStore';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const MAX_MASK_OPACITY = 1;
const LEGACY_MAX_MASK_OPACITY = 0.8;

/**
 * 页面背景计算：仅支持图片地址 + 遮罩透明度。
 * 用法：
 * const current = computed(() => store.activePage.value);
 * const { pageBgStyle, overlayStyle, maskOpacity } = usePageBackground(current);
 * - 遮罩透明度裁剪到 0~1
 */
export function usePageBackground(currentPage: Ref<PageInfo | null>) {
  const maskOpacity = computed(() => clamp(currentPage.value?.bgMask ?? 0.35, 0, MAX_MASK_OPACITY));

  const pageBgStyle = computed(() => {
    const url = (currentPage.value?.bgValue ?? '').trim();
    if (!url) {
      return { backgroundImage: 'none' };
    }
    return { backgroundImage: `url("${url}")` };
  });

  const overlayStyle = computed(() => {
    const m = Math.max(0, maskOpacity.value);
    const transition = 'background 250ms ease, backdrop-filter 250ms ease, opacity 250ms ease';
    if (m <= 0.001) {
      return {
        background: 'transparent',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        opacity: 0,
        transition,
      };
    }
    // 兼容旧行为：0~0.8 视觉效果不变；0.8~1 继续加深，最终可达到 100% 不透明。
    const base = Math.min(1, m / LEGACY_MAX_MASK_OPACITY);
    const extra =
      m > LEGACY_MAX_MASK_OPACITY
        ? Math.min(1, (m - LEGACY_MAX_MASK_OPACITY) / (MAX_MASK_OPACITY - LEGACY_MAX_MASK_OPACITY))
        : 0;
    const topMix = Math.round(20 + base * 45 + extra * 10);
    const bottomMix = Math.round(10 + base * 40 + extra * 10);
    const blur = (2 + base * 6 + extra * 4).toFixed(1);
    const opacity = Math.min(1, 0.15 + base * 0.7 + extra * 0.15).toFixed(2);
    return {
      background: `linear-gradient(135deg, color-mix(in oklch, var(--background) ${topMix}%, transparent) 0%, color-mix(in oklch, var(--background) ${bottomMix}%, transparent) 75%)`,
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      opacity,
      transition,
    };
  });

  return {
    pageBgStyle: computed(() => ({
      ...pageBgStyle.value,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    })),
    overlayStyle,
    maskOpacity,
  };
}
