import { browser } from 'wxt/browser';
import { useLog } from '@/composables/useLog';

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
      ],
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' as const },
        { header: 'content-security-policy', operation: 'remove' as const },
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
        { header: 'content-security-policy', operation: 'remove' as const },
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
      return undefined;
    },
  );
});
