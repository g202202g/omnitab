import { browser } from 'wxt/browser';

type ExtensionRuntimeLike = {
  id?: string;
  getURL?: (path: string) => string;
};

const getRuntime = (): ExtensionRuntimeLike | null => {
  const runtime = (browser as any)?.runtime;
  if (!runtime || typeof runtime !== 'object') return null;
  return runtime as ExtensionRuntimeLike;
};

const isFirefox = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /firefox/i.test(navigator.userAgent);
};

export const canUseExtensionFavicon = (): boolean => {
  const runtime = getRuntime();
  if (!runtime?.id || typeof runtime.getURL !== 'function') return false;
  if (isFirefox()) return false;
  return true;
};

/**
 * Chromium 提供的扩展内部 favicon 代理：
 * - chrome-extension://<extension-id>/_favicon/?pageUrl=<url>&size=<size>
 * - 避免使用 chrome://favicon2 导致 “Not allowed to load local resource” 的控制台错误
 *
 * 注意：Firefox 等非 Chromium 环境通常不支持该入口，返回 null 让 UI 回退到默认图标/首字母。
 */
export const buildExtensionFaviconUrl = (pageUrl: string, size = 32): string | null => {
  if (!canUseExtensionFavicon()) return null;
  const runtime = getRuntime();
  if (!runtime?.getURL) return null;

  const normalizedSize = Math.max(16, Math.min(256, Math.floor(size)));
  const base = runtime.getURL('_favicon/');
  return `${base}?pageUrl=${encodeURIComponent(pageUrl)}&size=${normalizedSize}`;
};
