import { browser } from 'wxt/browser';
import { useLog } from '@/composables/useLog';
import { storage } from 'wxt/utils/storage';
import { setPendingWebCardPick } from '@/utils/domPickerPending';

const LEGACY_FRAME_RULE_ID = 1001;
const IFRAME_RULE_BASE_ID = 210000000;
const IFRAME_RULE_ID_ORIGIN_MOD = 500000;
const IFRAME_RULE_ID_TAB_BUCKET = 1000;
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = globalThis.navigator?.userAgent ?? '';

type DeclarativeNetRequestApi = NonNullable<typeof browser.declarativeNetRequest>;
type UpdateSessionRulesOptions = Parameters<DeclarativeNetRequestApi['updateSessionRules']>[0];
type FrameRule = NonNullable<UpdateSessionRulesOptions['addRules']>[number];
type ScriptingApi = NonNullable<typeof browser.scripting>;
type InsertCssParams = Parameters<ScriptingApi['insertCSS']>[0];
type InsertCssTarget = InsertCssParams['target'];

type UaMode = 'desktop' | 'mobile';

const logger = useLog('background');

type NewtabPortMessage =
  | { type: 'newtab:register'; tabId: number }
  | { type: 'newtab:ping'; tabId: number }
  | { type: 'newtab:unregister'; tabId: number };

type RegisteredNewtab = { tabId: number; updatedAt: number };
const registeredNewtabs = new Map<number, RegisteredNewtab>();

const focusRegisteredNewtab = async () => {
  const candidates = Array.from(registeredNewtabs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const item of candidates) {
    try {
      const tab = await browser.tabs.get(item.tabId);
      if (!tab?.id) {
        registeredNewtabs.delete(item.tabId);
        continue;
      }
      await browser.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) {
        await browser.windows.update(tab.windowId, { focused: true });
      }
      return tab.id;
    } catch {
      registeredNewtabs.delete(item.tabId);
    }
  }
  return null;
};

const DEFAULT_ACTION_TITLE = '万象标签（OmniTab）';

const setActionFeedback = async (
  tabId: number | undefined,
  payload: { text?: string; title?: string; color?: string | [number, number, number, number]; clearAfterMs?: number },
) => {
  if (typeof tabId !== 'number') return;
  try {
    await browser.action?.setBadgeBackgroundColor?.({ tabId, color: payload.color ?? '#ef4444' });
    await browser.action?.setBadgeText?.({ tabId, text: payload.text ?? '' });
    if (payload.title) {
      await browser.action?.setTitle?.({ tabId, title: payload.title });
    }
  } catch (error) {
    logger.warn('set action feedback failed', { tabId, error });
  }
  if (payload.clearAfterMs) {
    globalThis.setTimeout(() => {
      void browser.action?.setBadgeText?.({ tabId, text: '' });
      void browser.action?.setTitle?.({ tabId, title: DEFAULT_ACTION_TITLE });
    }, payload.clearAfterMs);
  }
};

type WebCardWidgetData = {
  url: string;
  selector?: string;
  customStyle?: string;
  uaMode?: UaMode;
  autoRefreshSeconds?: number;
};

type WidgetLayout = {
  id?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  type?: string;
  name?: string;
  icon?: string;
  description?: string;
  showBorder?: boolean;
  showTitle?: boolean;
  showBackground?: boolean;
  data?: WebCardWidgetData | Record<string, unknown>;
};

type WidgetState = {
  pages?: Record<string, Array<WidgetLayout> | Record<string, WidgetLayout>>;
};

type PageInfo = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  createdAt: number;
};

type PageState = {
  pages?: PageInfo[];
  activePageId?: string;
};

type DomPickerResponse = { ok: true } | { ok: false; error?: string };

let lastDomPickKey = '';
let lastDomPickAt = 0;
const shouldDedupeDomPick = (key: string) => {
  const now = Date.now();
  const within = now - lastDomPickAt < 1200;
  if (within && key && key === lastDomPickKey) return true;
  lastDomPickAt = now;
  lastDomPickKey = key;
  return false;
};

const widgetsItem = storage.defineItem<WidgetState>('local:page-widgets', { fallback: { pages: {} } });
const pageStateItem = storage.defineItem<PageState>('local:page-state', { fallback: { pages: [], activePageId: '' } });

const normalizeWidgets = (value: unknown): WidgetLayout[] => {
  if (Array.isArray(value)) return value as WidgetLayout[];
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, WidgetLayout>).map(([id, widget]) => ({ id, ...(widget as object) }));
  }
  return [];
};

const createId = () => crypto.randomUUID?.() ?? `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const resolveActivePageId = async () => {
  try {
    const state = await pageStateItem.getValue();
    const pages = Array.isArray(state?.pages) ? state.pages : [];
    const active = typeof state?.activePageId === 'string' ? state.activePageId : '';
    if (active && pages.some((p) => p?.id === active)) return active;
    return pages[0]?.id ?? '';
  } catch {
    return '';
  }
};

const addWebCardWidgetToPage = async (payload: { url: string; selector: string; title?: string }) => {
  const url = String(payload.url ?? '').trim();
  const selector = String(payload.selector ?? '').trim();
  if (!url) return { ok: false as const, error: '参数不完整（url）' };
  if (!selector) return { ok: false as const, error: '参数不完整（selector）' };
  if (selector.length > 8000) return { ok: false as const, error: '选择器过长（最多 8000 字符）' };

  const pageId = await resolveActivePageId();
  if (!pageId) return { ok: false as const, error: '未找到可用页面（请先打开新标签页初始化页面）' };

  const state = await widgetsItem.getValue();
  const pages = state?.pages ?? {};
  const current = normalizeWidgets(pages[pageId] ?? []);

  const nextY = current.reduce((maxY, item) => {
    const y = Number((item as any)?.y);
    const h = Number((item as any)?.h);
    const safeY = Number.isFinite(y) ? Math.max(0, y) : 0;
    const safeH = Number.isFinite(h) ? Math.max(1, h) : 1;
    return Math.max(maxY, safeY + safeH);
  }, 0);

  const widgetId = createId();
  const widget: WidgetLayout = {
    id: widgetId,
    x: 0,
    y: nextY + 1,
    w: 5,
    h: 16,
    type: 'iframe',
    name: payload.title?.trim() ? payload.title.trim() : '网页卡片',
    showBorder: true,
    showTitle: true,
    showBackground: true,
    data: {
      url,
      selector,
      customStyle: '',
      uaMode: 'desktop',
      autoRefreshSeconds: 0,
    },
  };

  await widgetsItem.setValue({
    pages: {
      ...pages,
      [pageId]: [...current, widget],
    },
  });

  return { ok: true as const, widgetId, pageId };
};

const openNewtabAndShowAddDialog = async (payload: { url: string; selector: string; title?: string }) => {
  const nonce = await setPendingWebCardPick({
    url: payload.url,
    selector: payload.selector,
    title: payload.title,
    createdAt: Date.now(),
  });

  const focusedTabId = await focusRegisteredNewtab();
  if (focusedTabId) {
    try {
      await browser.runtime.sendMessage({ type: 'newtab:dom-pick-ready', nonce });
    } catch (error) {
      logger.warn('notify newtab failed (ignored)', { error });
    }
    return;
  }

  await browser.tabs.create({});
  void nonce;
};

const startDomPicker = async (tabId: number | undefined) => {
  if (typeof tabId !== 'number') return { ok: false as const, error: '未找到可用标签页' };

  // 目标：点击图标后“有反馈”。最常见失败原因是当前页面未注入 content script（或受限页面）。
  let injected = false;
  try {
    await browser.scripting?.executeScript?.({
      target: { tabId },
      files: ['content-scripts/dom_picker.js'],
    } as any);
    injected = true;
  } catch (error) {
    logger.warn('dom picker inject failed', { tabId, error });
  }

  try {
    await browser.tabs.sendMessage(tabId, { type: 'dom-picker:start' });
    return { ok: true as const };
  } catch (error) {
    logger.warn('dom picker start failed', { tabId, error });
    return {
      ok: false as const,
      error: injected
        ? '已注入脚本但消息发送失败（可能页面仍在加载，或 CSP/扩展注入被阻止）'
        : '脚本注入失败（可能缺少权限、页面限制或扩展未重新加载）',
    };
  }
};

const getUpdateRules = () => {
  const dnr = browser?.declarativeNetRequest;
  if (!dnr) return null;
  return dnr.updateSessionRules ?? dnr.updateDynamicRules ?? null;
};

const getExistingRules = () => {
  const dnr = browser?.declarativeNetRequest as any;
  if (!dnr) return null;
  return dnr.getSessionRules ?? dnr.getDynamicRules ?? null;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

// 以域名作为 key：支持常见 302 跳转（apex <-> www / 子域名跳转）场景
const buildIframeRuleId = (hostKey: string, tabId: number) =>
  IFRAME_RULE_BASE_ID +
  (hashString(hostKey) % IFRAME_RULE_ID_ORIGIN_MOD) * IFRAME_RULE_ID_TAB_BUCKET +
  (Math.abs(tabId) % IFRAME_RULE_ID_TAB_BUCKET);

const buildIframeRuleIdLegacy = (origin: string) => IFRAME_RULE_BASE_ID + (hashString(origin) % 100000000);

const isInIframeRuleIdRange = (id: number) => {
  const min = IFRAME_RULE_BASE_ID;
  const max = IFRAME_RULE_BASE_ID + IFRAME_RULE_ID_ORIGIN_MOD * IFRAME_RULE_ID_TAB_BUCKET + IFRAME_RULE_ID_TAB_BUCKET;
  return id >= min && id < max;
};

const inferDesktopPlatform = () => {
  const platform = (globalThis.navigator as any)?.userAgentData?.platform;
  if (typeof platform === 'string' && platform.trim()) return platform.trim();
  const ua = DESKTOP_UA;
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Win/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Windows';
};

const GLOBAL_IFRAME_UNBLOCK_HOSTKEY = '__codex_iframe_unblock_all_http__';

// 跨域 302 场景：最终落地页域名未知，无法提前为每个域名建规则。
// 这里增加一个“全域名”兜底规则（仅移除响应头 XFO/CSP，不改 UA），并且通过 initiatorDomains+tabIds 将影响范围收敛到本扩展新标签页里的 iframe。
const buildIframeUnblockRule = (tabId: number | undefined, options?: { includeInitiator?: boolean }): FrameRule => {
  const condition: any = {
    urlFilter: '|http',
    resourceTypes: ['sub_frame'],
  };

  const runtimeId = browser?.runtime?.id;
  if (options?.includeInitiator !== false && runtimeId) {
    condition.initiatorDomains = [runtimeId];
  }
  if (typeof tabId === 'number') {
    condition.tabIds = [tabId];
  }

  return {
    id: buildIframeRuleId(GLOBAL_IFRAME_UNBLOCK_HOSTKEY, typeof tabId === 'number' ? tabId : 0),
    priority: 90,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        // 参考旧版实现：部分站点会基于 Fetch Metadata 阻止 iframe 嵌入
        { header: 'sec-fetch-dest', operation: 'set' as const, value: 'document' },
        {
          header: 'sec-fetch-site',
          operation: 'set' as const,
          value: 'same-origin',
        },
      ],
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' as const },
        { header: 'X-Frame-Options', operation: 'remove' as const },
        { header: 'content-security-policy', operation: 'remove' as const },
        { header: 'Content-Security-Policy', operation: 'remove' as const },
      ],
    },
    condition,
  };
};

const buildIframeRule = (
  hostname: string,
  mode: UaMode,
  tabId: number | undefined,
  options?: { includeInitiator?: boolean },
): FrameRule => {
  const requestHeaders = [
    // 参考旧版实现：部分站点会基于 Fetch Metadata 阻止 iframe 嵌入
    { header: 'sec-fetch-dest', operation: 'set' as const, value: 'document' },
    {
      header: 'sec-fetch-site',
      operation: 'set' as const,
      value: 'same-origin',
    },
    {
      header: 'user-agent',
      operation: 'set' as const,
      value: mode === 'mobile' ? MOBILE_UA : DESKTOP_UA || 'Mozilla/5.0',
    },
    {
      header: 'sec-ch-ua-mobile',
      operation: 'set' as const,
      value: mode === 'mobile' ? '?1' : '?0',
    },
    {
      header: 'sec-ch-ua-platform',
      operation: 'set' as const,
      value: mode === 'mobile' ? '"Android"' : `"${inferDesktopPlatform()}"`,
    },
  ] as any[];

  const condition: any = {
    // 域名锚点：匹配该域名及其子域名，避免 302 跳到 www/子域名后规则失效。
    urlFilter: `||${hostname}^`,
    resourceTypes: ['sub_frame'],
  };

  const runtimeId = browser?.runtime?.id;
  if (options?.includeInitiator !== false && runtimeId) {
    condition.initiatorDomains = [runtimeId];
  }
  if (typeof tabId === 'number') {
    condition.tabIds = [tabId];
  }

  return {
    id: buildIframeRuleId(hostname, typeof tabId === 'number' ? tabId : 0),
    priority: 100,
    action: {
      type: 'modifyHeaders',
      requestHeaders,
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' as const },
        { header: 'X-Frame-Options', operation: 'remove' as const },
        { header: 'content-security-policy', operation: 'remove' as const },
        { header: 'Content-Security-Policy', operation: 'remove' as const },
      ],
    },
    condition,
  };
};

const isManagedIframeRule = (rule: any) => {
  if (!rule || typeof rule !== 'object') return false;
  const id = Number((rule as any).id);
  if (!Number.isFinite(id)) return false;
  if (id === LEGACY_FRAME_RULE_ID) return true;
  if (isInIframeRuleIdRange(id)) return true;
  const action = (rule as any).action;
  if (!action || action.type !== 'modifyHeaders') return false;
  const responseHeaders = Array.isArray(action.responseHeaders) ? action.responseHeaders : [];
  const requestHeaders = Array.isArray(action.requestHeaders) ? action.requestHeaders : [];
  if (
    requestHeaders.some((h: any) => {
      const header = String(h?.header ?? '').toLowerCase();
      if (!header.startsWith('sec-fetch-')) return false;
      return String(h?.operation ?? '').toLowerCase() === 'remove';
    })
  ) {
    return true;
  }
  return responseHeaders.some(
    (h: any) =>
      h?.operation === 'remove' &&
      (String(h?.header ?? '').toLowerCase() === 'x-frame-options' ||
        String(h?.header ?? '').toLowerCase() === 'content-security-policy'),
  );
};

const getUrlFilter = (rule: any) => {
  const condition = rule?.condition;
  const urlFilter = typeof condition?.urlFilter === 'string' ? condition.urlFilter : '';
  return urlFilter;
};

const hasMobileUaHeader = (rule: any) => {
  const headers = Array.isArray(rule?.action?.requestHeaders) ? rule.action.requestHeaders : [];
  return headers.some(
    (h: any) => String(h?.header ?? '').toLowerCase() === 'user-agent' && String(h?.value ?? '') === MOBILE_UA,
  );
};

const prepareIframeRulesForUrl = async (url: string, mode: UaMode, tabId: number | undefined) => {
  const updateRules = getUpdateRules();
  if (!updateRules) return { ok: false, error: 'no-update-rules' };

  let origin = '';
  let hostname = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return { ok: false, error: 'unsupported-protocol' };
    origin = parsed.origin;
    hostname = parsed.hostname.toLowerCase();
  } catch (error) {
    return { ok: false, error: `invalid-url:${String(error)}` };
  }

  if (!hostname) return { ok: false, error: 'invalid-hostname' };

  const hostCandidates = (() => {
    const set = new Set<string>([hostname]);
    // 兼容常见 302：apex <-> www
    if (hostname.startsWith('www.')) set.add(hostname.slice('www.'.length));
    else set.add(`www.${hostname}`);
    return Array.from(set).filter(Boolean);
  })();

  const stableTabId = typeof tabId === 'number' ? tabId : 0;
  const includeInitiator = typeof tabId !== 'number';
  const legacyRuleId = buildIframeRuleIdLegacy(origin);
  const removeRuleIds = new Set<number>([
    LEGACY_FRAME_RULE_ID,
    legacyRuleId,
    buildIframeRuleId(GLOBAL_IFRAME_UNBLOCK_HOSTKEY, stableTabId),
  ]);
  const addRules: FrameRule[] = [
    buildIframeUnblockRule(tabId, { includeInitiator }),
    ...hostCandidates.map((hostKey) => buildIframeRule(hostKey, mode, tabId, { includeInitiator })),
  ];
  hostCandidates.forEach((hostKey) => removeRuleIds.add(buildIframeRuleId(hostKey, stableTabId)));

  const getRules = getExistingRules();
  if (getRules) {
    try {
      const existing = (await getRules()) as any[];
      existing
        .filter((rule) => isManagedIframeRule(rule))
        .forEach((rule) => {
          const id = Number((rule as any).id);
          if (!Number.isFinite(id)) return;

          const urlFilter = getUrlFilter(rule);
          const targetsThisHost =
            urlFilter.includes(`|${origin}/`) ||
            hostCandidates.some(
              (hostKey) => urlFilter.includes(`||${hostKey}^`) || urlFilter.includes(`||${hostKey}/`),
            );
          if (targetsThisHost) removeRuleIds.add(id);

          // 兜底清理：早期可能存在“全局移动 UA 规则”导致所有 iframe 都变成手机端
          // 这种规则一般会设置 MOBILE_UA，但 urlFilter 不会绑定到具体 origin。
          if (
            hasMobileUaHeader(rule) &&
            (!urlFilter || urlFilter.startsWith('|http') || urlFilter.startsWith('http'))
          ) {
            removeRuleIds.add(id);
          }
        });
    } catch (error) {
      console.warn('[iframe-prepare] get rules failed (ignored)', error);
    }
  }
  try {
    await (updateRules as any)({ removeRuleIds: Array.from(removeRuleIds), addRules });
    logger.info('[iframe-prepare] rules updated', { origin, hostname, hostCandidates, mode, tabId: stableTabId });
    return { ok: true };
  } catch (error) {
    // 某些浏览器/版本可能不支持 initiatorDomains；在有 tabId 的情况下做一次降级重试
    if (typeof tabId === 'number') {
      try {
        const fallbackRules: FrameRule[] = [
          buildIframeRule(hostCandidates[0] ?? hostname, mode, tabId, { includeInitiator: false }),
        ];
        await (updateRules as any)({ removeRuleIds: Array.from(removeRuleIds), addRules: fallbackRules });
        console.warn('[iframe-prepare] rules updated with fallback (no initiatorDomains)', {
          origin,
          hostname,
          mode,
          tabId: stableTabId,
        });
        return { ok: true };
      } catch (fallbackError) {
        console.error('[iframe-prepare] fallback failed', { origin, hostname, mode, fallbackError });
      }
    }
    console.error('[iframe-prepare] failed', { origin, hostname, mode, error });
    return { ok: false, error: String(error) };
  }
};

const cleanupLegacyIframeRules = async () => {
  const updateRules = getUpdateRules();
  const getRules = getExistingRules();
  if (!updateRules || !getRules) return;
  try {
    const existing = (await getRules()) as any[];
    const removeRuleIds = existing
      .filter((rule) => isManagedIframeRule(rule))
      .map((rule) => Number((rule as any).id))
      .filter((id) => Number.isFinite(id));
    if (!removeRuleIds.length) return;
    await (updateRules as any)({ removeRuleIds, addRules: [] });
    logger.info('[iframe-prepare] legacy rules cleaned', { count: removeRuleIds.length });
  } catch (error) {
    console.warn('[iframe-prepare] legacy clean failed (ignored)', error);
  }
};

export default defineBackground(() => {
  logger.info('Hello background!', { id: browser?.runtime?.id });
  void cleanupLegacyIframeRules();

  browser?.runtime?.onConnect?.addListener((port) => {
    if (port.name !== 'omnitab-newtab') return;

    const touch = (tabId: number) => {
      if (!Number.isFinite(tabId) || tabId <= 0) return;
      registeredNewtabs.set(tabId, { tabId, updatedAt: Date.now() });
    };

    port.onMessage.addListener((message: NewtabPortMessage) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'newtab:register' || message.type === 'newtab:ping') {
        touch(Number((message as any).tabId));
      }
      if (message.type === 'newtab:unregister') {
        const tabId = Number((message as any).tabId);
        if (Number.isFinite(tabId)) registeredNewtabs.delete(tabId);
      }
    });

    port.onDisconnect.addListener(() => {
      // disconnect 时无法可靠拿到 tabId（不同浏览器 sender 表现不一致），依赖 ping/注册更新。
    });
  });

  browser?.action?.onClicked?.addListener((tab) => {
    const tabId = (tab as any)?.id as number | undefined;
    void setActionFeedback(tabId, { text: '…', title: 'OmniTab：准备启动选取…', color: '#64748b' });
    startDomPicker(tabId)
      .then((res) => {
        if (res.ok) {
          void setActionFeedback(tabId, {
            text: '✓',
            title: 'OmniTab：已进入选取模式（悬停高亮，单击选中，Esc 取消）',
            color: '#22c55e',
            clearAfterMs: 1600,
          });
          return;
        }
        void setActionFeedback(tabId, {
          text: '!',
          title: `OmniTab：启动失败 - ${res.error ?? '未知原因'}（请在 http/https 页面点击工具栏扩展图标）`,
          color: '#ef4444',
          clearAfterMs: 3200,
        });
      })
      .catch((error) => {
        void setActionFeedback(tabId, {
          text: '!',
          title: `OmniTab：启动失败 - ${String(error)}`,
          color: '#ef4444',
          clearAfterMs: 3200,
        });
      });
  });

  browser?.runtime?.onMessage?.addListener(
    (message: any, sender: any, sendResponse: ((response?: any) => void) | undefined) => {
      if (sender?.id && sender.id !== browser?.runtime?.id) return undefined;
      if (message?.type === 'prepare-iframe') {
        const url = String(message?.url ?? '');
        const mode: UaMode = message?.mode === 'mobile' ? 'mobile' : 'desktop';
        const tabId = sender?.tab?.id as number | undefined;
        prepareIframeRulesForUrl(url, mode, tabId)
          .then((res) => sendResponse?.(res))
          .catch((error) => sendResponse?.({ ok: false, error: String(error) }));
        return true;
      }
      if (message?.type === 'dom-picker:selected') {
        const url = String(message?.url ?? '').trim();
        const title = String(message?.title ?? '').trim();
        const selector = String(message?.selector ?? '').trim();
        if (!url || !selector) {
          sendResponse?.({ ok: false, error: '参数不完整（url/selector）' } satisfies DomPickerResponse);
          return false;
        }

        // 兜底防抖：避免页面监听器/重复注入导致同一次点击触发多次回传。
        const dedupeKey = `${url}::${selector}`;
        if (shouldDedupeDomPick(dedupeKey)) {
          sendResponse?.({ ok: true } satisfies DomPickerResponse);
          return false;
        }
	        openNewtabAndShowAddDialog({ url, title, selector })
          .then(() => {
            void setActionFeedback(sender?.tab?.id as number | undefined, {
              text: '✓',
              title: 'OmniTab：已打开新标签页，请确认添加网页卡片',
              color: '#22c55e',
              clearAfterMs: 2200,
            });
            sendResponse?.({ ok: true } satisfies DomPickerResponse);
          })
          .catch((error) => {
            void setActionFeedback(sender?.tab?.id as number | undefined, {
              text: '!',
              title: `OmniTab：打开新标签页失败 - ${String(error)}`,
              color: '#ef4444',
              clearAfterMs: 3200,
            });
            sendResponse?.({ ok: false, error: String(error) } satisfies DomPickerResponse);
          });
        return true;
      }
      return undefined;
    },
  );
});
