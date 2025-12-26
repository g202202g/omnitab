/**
 * 页面级文档元信息同步（薄适配层）：
 * - 只负责把 PageInfo 映射为通用 DocumentMetaSource
 * - 具体的 document/meta/favicon 同步由 useDocumentMeta 处理
 */
import { computed, type Ref } from 'vue';
import type { PageInfo } from '@/composables/usePageStore';
import { DEFAULT_ICON_NAME, fetchIconSvg } from '@/lib/iconify';
import { useDocumentMeta, type DocumentMetaOptions } from '@/composables/useDocumentMeta';

export type PageDocumentMetaOptions = Omit<DocumentMetaOptions, 'resolveIconName' | 'fetchIconSvg' | 'iconFallback'> & {
  iconFallback?: string;
};

export function usePageDocumentMeta(
  currentPage: Ref<PageInfo | null | undefined>,
  options: PageDocumentMetaOptions = {},
) {
  const source = computed(() => ({
    title: currentPage.value?.name ?? null,
    description: currentPage.value?.description ?? null,
    icon: currentPage.value?.icon ?? null,
  }));

  return useDocumentMeta(source, {
    ...options,
    titleSuffix: options.titleSuffix ?? ' - 万象标签',
    iconFallback: options.iconFallback ?? DEFAULT_ICON_NAME,
    fetchIconSvg,
  });
}
