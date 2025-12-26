import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

type WidgetData = { selector?: string; url?: string; customStyle?: string; frameToken?: string };
type WidgetLayout = { id?: string; type?: string; data?: WidgetData };
type WidgetState = {
  pages?: Record<string, Array<WidgetLayout> | Record<string, WidgetLayout>>;
};

const widgetsItem = storage.defineItem<WidgetState>('local:page-widgets', { fallback: { pages: {} } });

const normalizeWidgets = (value: unknown): WidgetLayout[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, WidgetLayout>).map(([id, widget]) => ({ id, ...(widget as object) }));
  }
  return [];
};

const resolveConfigForFrame = (state: WidgetState, widgetId: string) => {
  const pages = state?.pages ?? {};
  for (const entry of Object.values(pages)) {
    const widgets = normalizeWidgets(entry);
    for (const widget of widgets) {
      if (!widget || widget.type !== 'iframe') continue;
      const id = typeof widget.id === 'string' ? widget.id : '';
      const data = widget.data ?? {};
      const selector = typeof data.selector === 'string' ? data.selector.trim() : '';
      const customStyle = typeof data.customStyle === 'string' ? data.customStyle : undefined;
      const frameToken = typeof data.frameToken === 'string' ? data.frameToken : '';
      if (id !== widgetId && frameToken !== widgetId) continue;
      return { selector, customStyle };
    }
  }
  return null;
};

const pruneTree = (root: HTMLElement, target: HTMLElement) => {
  Array.from(root.children).forEach((child) => {
    const childEl = child as HTMLElement;
    if (!childEl.contains(target)) {
      childEl.style.display = 'none';
    } else if (childEl !== target) {
      pruneTree(childEl, target);
    }
  });
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const styleId = 'codex-iframe-style';
    const runtime = (browser as any)?.runtime;
    const extensionOrigin = (() => {
      try {
        const url = runtime?.getURL?.('');
        return url ? new URL(url).origin : '';
      } catch {
        return '';
      }
    })();
    let widgetId = '';
    let heightObserver: ResizeObserver | null = null;
    let heightRaf = 0;
    let heightTimer = 0;
    let heightTarget: HTMLElement | null = null;
    const HEIGHT_REPORT_DELAY_MS = 0;
    const SELECTOR_WAIT_TIMEOUT_MS = 12000;
    let selectorObserver: MutationObserver | null = null;
    let selectorObserverRaf = 0;
    let selectorWaitTimer = 0;
    let pendingSelector = '';
    let pendingCustomStyle: string | undefined;
    let currentConfig: { selector: string; customStyle?: string } | null = null;
    let storageAccessCleanup: (() => void) | null = null;
    let locationTimer = 0;
    let lastReportedHref = '';

    const isAuthLikeHref = (href: string) => {
      try {
        const url = new URL(href);
        const path = url.pathname.toLowerCase();
        const keywords = ['login', 'signin', 'sign-in', 'oauth', 'authorize', 'auth', 'session', 'sso', 'callback'];
        if (keywords.some((k) => path.includes(k))) return true;
        if (url.searchParams.has('code') && url.searchParams.has('state')) return true;
        if (url.searchParams.has('sso') || url.searchParams.has('sig')) return true;
      } catch {
        // ignore
      }
      return false;
    };

    const reportFrameLocation = () => {
      if (window.self === window.top) return;
      if (!widgetId) return;
      const href = String(window.location.href ?? '');
      if (!href) return;
      if (href === lastReportedHref) return;
      lastReportedHref = href;
      window.top?.postMessage(
        {
          source: 'codex-widget',
          type: 'codex-frame-location',
          widgetId,
          href,
          authLike: isAuthLikeHref(href),
        },
        '*',
      );
    };

    const installStorageAccessHint = () => {
      if (window.self === window.top) return () => {};

      // 目标：当站点在第三方 iframe 中因为 Cookie/存储权限受限导致“顶层已登录、iframe 未登录”时，
      // 利用 Storage Access API 尝试在用户手势下申请访问权限，从而恢复同一站点的登录态。
      // 说明：这依赖浏览器策略 + 站点支持，失败时不影响站点原本流程。
      const doc: any = document as any;
      const hasStorageAccess = doc?.hasStorageAccess;
      const requestStorageAccess = doc?.requestStorageAccess;
      if (typeof requestStorageAccess !== 'function') return () => {};

      const markerKey = '__codex_storage_access_granted__';
      let running = false;
      let suppressReplay = false;

      const isAuthLikePath = () => {
        const path = window.location.pathname.toLowerCase();
        return path.includes('login') || path.includes('signin') || path.includes('auth') || path.includes('session');
      };

      const isOAuthCallbackLike = () => {
        try {
          const url = new URL(window.location.href);
          const hasCode = url.searchParams.has('code') || url.searchParams.has('state');
          if (!hasCode) return false;
          const path = url.pathname.toLowerCase();
          return path.includes('callback') || path.includes('oauth');
        } catch {
          return false;
        }
      };

      const shouldReloadAfterGrant = () => {
        // login 页面往往是“因为拿不到 Cookie 才被服务端渲染成未登录”，需要刷新一次才能命中已登录态；
        // 但 OAuth callback 不能强制 reload，可能导致 code 二次消费而登录失败。
        if (isOAuthCallbackLike()) return false;
        return isAuthLikePath();
      };

      const getClickableTarget = (eventTarget: EventTarget | null) => {
        const el = eventTarget instanceof Element ? eventTarget : null;
        if (!el) return null;
        return (
          (el.closest('a[href]') as HTMLElement | null) ??
          (el.closest('button') as HTMLElement | null) ??
          (el.closest('input[type="submit"], input[type="button"]') as HTMLElement | null) ??
          (el.closest('[role="button"]') as HTMLElement | null)
        );
      };

      const markGranted = () => {
        try {
          sessionStorage.setItem(markerKey, '1');
        } catch {
          // ignore
        }
      };

      const alreadyGranted = () => {
        try {
          return sessionStorage.getItem(markerKey) === '1';
        } catch {
          return false;
        }
      };

      const ensureAccess = async () => {
        if (alreadyGranted()) return true;
        if (typeof hasStorageAccess === 'function') {
          try {
            const has = await hasStorageAccess.call(document);
            if (has) {
              markGranted();
              return true;
            }
          } catch {
            // ignore
          }
        }
        try {
          await requestStorageAccess.call(document);
          markGranted();
          return true;
        } catch {
          return false;
        }
      };

      const replayClick = (target: HTMLElement | null) => {
        if (!target) return;
        suppressReplay = true;
        requestAnimationFrame(() => {
          try {
            target.click();
          } catch {
            // ignore
          } finally {
            suppressReplay = false;
          }
        });
      };

      const clickHandler = (event: MouseEvent) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (suppressReplay) return;
        if (running) return;

        // 已授权后不再拦截，避免影响站点正常交互。
        if (alreadyGranted()) return;

        const target = getClickableTarget(event.target);
        if (!target) return;

        running = true;
        event.preventDefault();
        event.stopImmediatePropagation();

        let settled = false;
        const fallback = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          // 某些环境（例如浏览器策略限制）可能导致 requestStorageAccess 长时间不返回；
          // 为避免“点了没反应”，超时后放行本次点击（可能仍会登录失败，但不阻塞用户操作）。
          replayClick(target);
          running = false;
        }, 2500);

        void (async () => {
          try {
            const ok = await ensureAccess();
            if (settled) return;
            settled = true;
            clearTimeout(fallback);
            // 这里不做强制 reload：用户点击“登录/SSO”通常会立刻触发跳转或表单提交，
            // reload 反而会让用户感知为“点了没反应”。授权成功后直接重放点击即可。
            // 若站点需要刷新才能体现登录态，用户后续的下一次点击/站点自身跳转会自然触发。
            replayClick(target);
            void ok;
          } finally {
            if (!settled) {
              settled = true;
              clearTimeout(fallback);
            }
            running = false;
          }
        })();
      };

      // 关键点：在“发起跳转/打开 SSO”之前拿到 Storage Access，否则后续 302/OAuth 回跳设置的会话 Cookie 仍可能无效。
      // 这里只拦截首次点击一次流程（成功后 sessionStorage 标记），对普通浏览影响最小。
      document.addEventListener('click', clickHandler, true);

      // 预热：如果当前环境已自动授予（或曾授予）访问权限，尽早写入 marker，让后续点击不被拦截。
      if (typeof hasStorageAccess === 'function') {
        void hasStorageAccess
          .call(document)
          .then((has: boolean) => {
            if (has) markGranted();
          })
          .catch(() => {
            // ignore
          });
      }

      return () => {
        document.removeEventListener('click', clickHandler, true);
      };
    };

    const reportHeight = () => {
      if (window.self === window.top) return;
      if (!widgetId) return;
      const target = heightTarget;
      const baseHeight = (() => {
        if (target) {
          const rectHeight = target.getBoundingClientRect().height;
          const scrollHeight = target.scrollHeight;
          const style = window.getComputedStyle(target);
          const marginTop = Number.parseFloat(style.marginTop) || 0;
          const marginBottom = Number.parseFloat(style.marginBottom) || 0;
          return Math.max(rectHeight, scrollHeight) + marginTop + marginBottom;
        }
        return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      })();

      const height = Math.ceil(baseHeight);
      if (!Number.isFinite(height) || height <= 0) return;
      window.top?.postMessage(
        {
          source: 'codex-widget',
          type: 'codex-frame-height',
          widgetId,
          height,
        },
        '*',
      );
    };

    const scheduleReportHeight = () => {
      if (heightRaf || heightTimer) return;
      heightRaf = requestAnimationFrame(() => {
        heightRaf = 0;
        heightTimer = window.setTimeout(() => {
          heightTimer = 0;
          reportHeight();
        }, HEIGHT_REPORT_DELAY_MS);
      });
    };

    const applyCustomStyle = (customStyle?: string) => {
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      const css = customStyle?.trim();
      if (css) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
      } else if (styleEl) {
        styleEl.remove();
      }
    };

    const stopSelectorWait = () => {
      if (selectorObserverRaf) cancelAnimationFrame(selectorObserverRaf);
      selectorObserverRaf = 0;
      if (selectorWaitTimer) clearTimeout(selectorWaitTimer);
      selectorWaitTimer = 0;
      pendingSelector = '';
      pendingCustomStyle = undefined;
    };

    const stopSelectorObserver = () => {
      stopSelectorWait();
      selectorObserver?.disconnect();
      selectorObserver = null;
    };

    const ensureTargetPathVisible = (target: HTMLElement) => {
      let parent: HTMLElement | null = target;
      while (parent && parent !== document.body) {
        if (window.getComputedStyle(parent).display === 'none') {
          parent.style.display = 'block';
        }
        parent = parent.parentElement;
      }
    };

    const enforceCurrentTarget = (target: HTMLElement) => {
      if (!document.body.contains(target)) return;
      pruneTree(document.body, target);
      ensureTargetPathVisible(target);
      document.documentElement.style.overflow = 'hidden';
      document.body.style.margin = '0';
      scheduleReportHeight();
    };

    const applyToTarget = (target: HTMLElement, customStyle?: string) => {
      stopSelectorWait();
      heightObserver?.disconnect();
      heightObserver = null;
      heightTarget = target;

      pruneTree(document.body, target);
      ensureTargetPathVisible(target);
      document.documentElement.style.overflow = 'hidden';
      document.body.style.margin = '0';

      applyCustomStyle(customStyle);

      heightObserver = new ResizeObserver(() => {
        scheduleReportHeight();
      });
      heightObserver.observe(heightTarget);
      scheduleReportHeight();
    };

    const ensureSelectorObserver = () => {
      if (selectorObserver) return;
      selectorObserver = new MutationObserver(() => {
        if (selectorObserverRaf) return;
        selectorObserverRaf = requestAnimationFrame(() => {
          selectorObserverRaf = 0;
          scheduleReportHeight();
          const selector = (pendingSelector || currentConfig?.selector || '').trim();
          if (!selector) return;
          const found = document.querySelector(selector);
          if (!(found instanceof HTMLElement)) return;
          const style = pendingCustomStyle ?? currentConfig?.customStyle;
          if (heightTarget === found) {
            enforceCurrentTarget(found);
            return;
          }
          applyToTarget(found, style);
        });
      });
      selectorObserver.observe(document.documentElement, { childList: true, subtree: true });
    };

    const applySelector = async () => {
      if (window.self === window.top) return;
      if (!widgetId) return;
      stopSelectorWait();
      heightObserver?.disconnect();
      heightObserver = null;
      heightTarget = null;
      const state = await widgetsItem.getValue();
      const config = resolveConfigForFrame(state, widgetId);
      if (!config) {
        currentConfig = null;
        stopSelectorObserver();
        return;
      }
      currentConfig = config;

      // 自定义样式不依赖 selector：先应用，避免 SPA 延迟渲染时样式一直不生效。
      applyCustomStyle(config.customStyle);
      scheduleReportHeight();

      const selector = config.selector?.trim?.() ? config.selector.trim() : '';
      if (!selector) {
        stopSelectorObserver();
        return;
      }

      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) {
        // React/Vue 等应用可能延迟挂载：通过 MutationObserver 等待一段时间。
        pendingSelector = selector;
        pendingCustomStyle = config.customStyle;
        ensureSelectorObserver();
        selectorWaitTimer = window.setTimeout(() => {
          stopSelectorWait();
        }, SELECTOR_WAIT_TIMEOUT_MS);
        return;
      }

      ensureSelectorObserver();
      applyToTarget(target, config.customStyle);
    };

    const handleTokenMessage = (event: MessageEvent) => {
      if (!extensionOrigin || event.origin !== extensionOrigin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const type = (data as any).type;
      if (type !== 'codex-frame-token' && type !== 'codex-widget-id') return;
      const nextId = typeof (data as any).widgetId === 'string' ? (data as any).widgetId : (data as any).token;
      if (typeof nextId !== 'string' || !nextId) return;
      widgetId = nextId;
      if (!storageAccessCleanup && window.self !== window.top) {
        storageAccessCleanup = installStorageAccessHint();
      }
      reportFrameLocation();
      if (!locationTimer && window.self !== window.top) {
        // SPA 场景 location 可能变化但不触发 reload：做轻量轮询上报。
        locationTimer = window.setInterval(() => {
          reportFrameLocation();
        }, 1200);
      }
      void applySelector();
    };

    window.addEventListener('message', handleTokenMessage);

    const stopWatch = widgetsItem.watch(() => {
      void applySelector();
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void applySelector();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    const cleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('message', handleTokenMessage);
      stopWatch?.();
      currentConfig = null;
      stopSelectorObserver();
      heightObserver?.disconnect();
      heightObserver = null;
      if (heightTimer) clearTimeout(heightTimer);
      heightTimer = 0;
      if (heightRaf) cancelAnimationFrame(heightRaf);
      heightRaf = 0;
      storageAccessCleanup?.();
      storageAccessCleanup = null;
      if (locationTimer) clearInterval(locationTimer);
      locationTimer = 0;
    };

    window.addEventListener('pagehide', cleanup, { once: true });
  },
});
