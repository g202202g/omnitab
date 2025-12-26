/**
 * 通用文档元信息同步：
 * - 根据外部状态更新 document.title / meta description
 * - 可选同步 favicon（默认使用 Iconify SVG），自动适配暗/亮色
 *
 * 设计目标：
 * - 不依赖具体业务模型（如 PageInfo）
 * - 通过 resolve/fetch 注入，支持未来替换图标实现
 */
import { computed, watch, type ComputedRef, type Ref } from 'vue';
import { DEFAULT_ICON_NAME, fetchIconSvg, normalizeIconName } from '@/lib/iconify';
import { useColorModePreference } from '@/composables/useColorMode';

export type DocumentMetaSource = {
  title?: string | null;
  description?: string | null;
  icon?: string | null;
};

export type DocumentMetaOptions = {
  defaultTitle?: string;
  defaultDescription?: string;
  titleSuffix?: string;
  faviconHeight?: number;
  iconFallback?: string;
  /**
   * 图标名归一化/兜底逻辑，默认使用 Iconify normalizeIconName。
   */
  resolveIconName?: (raw: string | null | undefined, fallback: string) => string;
  /**
   * 拉取 favicon SVG 的实现，默认使用 Iconify fetchIconSvg。
   */
  fetchIconSvg?: (name: string, params: { height?: number; color?: string }) => Promise<string>;
  /**
   * 可自定义 favicon 颜色；不传则根据暗亮模式自动推导。
   */
  faviconColor?: string | Ref<string> | ComputedRef<string>;
};

export function useDocumentMeta(source: Ref<DocumentMetaSource | null | undefined>, options: DocumentMetaOptions = {}) {
  const defaultTitle = options.defaultTitle ?? '新标签页';
  const defaultDescription = options.defaultDescription ?? '';
  const titleSuffix = options.titleSuffix ?? '';
  const faviconHeight = Math.max(16, options.faviconHeight ?? 64);
  const iconFallback = options.iconFallback ?? DEFAULT_ICON_NAME;

  const resolveName =
    options.resolveIconName ??
    ((raw: string | null | undefined, fallback: string) => normalizeIconName(raw ?? undefined, fallback));
  const fetchSvg = options.fetchIconSvg ?? fetchIconSvg;

  const iconName = computed(() => resolveName(source.value?.icon, iconFallback));

  const { isDark } = useColorModePreference();
  const autoFaviconColor = computed(() => (isDark.value ? '#e5e7eb' : '#0f172a'));
  const faviconColor = computed(() => {
    const c = options.faviconColor;
    if (!c) return autoFaviconColor.value;
    if (typeof c === 'string') return c;
    return c.value;
  });

  let faviconToken = 0;

  const ensureFaviconLink = () => {
    if (typeof document === 'undefined') return null;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-dynamic-favicon="true"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.setAttribute('data-dynamic-favicon', 'true');
      document.head.appendChild(link);
    }
    return link;
  };

  const syncDocumentMeta = (meta: DocumentMetaSource | null | undefined) => {
    if (typeof document === 'undefined') return;
    const titleRaw = meta?.title?.trim();
    document.title = titleRaw ? `${titleRaw}${titleSuffix}` : defaultTitle;

    const descriptionRaw = meta?.description?.trim();
    const content = descriptionRaw || defaultDescription;
    const metaEl = document.querySelector('meta[name="description"]');
    if (metaEl instanceof HTMLMetaElement) {
      metaEl.setAttribute('content', content);
    }
  };

  const syncFavicon = async (meta: DocumentMetaSource | null | undefined) => {
    if (typeof document === 'undefined') return;
    const token = ++faviconToken;
    const name = resolveName(meta?.icon, iconFallback);
    try {
      const svg = await fetchSvg(name, { height: faviconHeight, color: faviconColor.value });
      if (token !== faviconToken) return;
      const link = ensureFaviconLink();
      if (!link) return;
      link.href = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    } catch (error) {
      if (token !== faviconToken) return;
      console.warn('[useDocumentMeta] sync favicon failed', error);
    }
  };

  watch(
    source,
    (meta) => {
      syncDocumentMeta(meta ?? null);
      void syncFavicon(meta ?? null);
    },
    { immediate: true },
  );

  watch(faviconColor, () => {
    void syncFavicon(source.value ?? null);
  });

  return {
    iconName,
    faviconColor,
    syncDocumentMeta,
    syncFavicon,
  };
}
