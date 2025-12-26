import { browser } from 'wxt/browser';

export type SessionEntry = {
  id: string;
  type: 'tab' | 'window';
  title: string;
  url?: string;
  tabCount?: number;
  lastModified?: number;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeSessionId = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
};

const resolveStableId = (session: any, idx: number, url?: string, lastModified?: number) => {
  const sessionId =
    normalizeSessionId(session?.sessionId) ||
    normalizeSessionId(session?.session_id) ||
    normalizeSessionId(session?.id);
  if (sessionId) return sessionId;
  const keyUrl = url ? url.slice(0, 200) : '';
  const keyTime = typeof lastModified === 'number' && Number.isFinite(lastModified) ? String(lastModified) : '';
  return `${idx}-${keyUrl}-${keyTime}`.trim() || `fallback-${idx}`;
};

export const getRecentlyClosed = async (maxResults: number): Promise<SessionEntry[] | null> => {
  const limitRaw = Number(maxResults);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20;

  const mapSessions = (raw: any[]): SessionEntry[] => {
    const sessions = Array.isArray(raw) ? raw : [];
    return sessions
      .map((session: any, idx: number) => {
        const lastModified = typeof session?.lastModified === 'number' ? session.lastModified : undefined;

        const tab = session?.tab;
        if (tab) {
          const url = normalizeText(tab?.url) || undefined;
          const title = normalizeText(tab?.title) || url || '未命名标签页';
          return {
            id: resolveStableId(session, idx, url, lastModified),
            type: 'tab',
            title,
            url,
            lastModified,
          } satisfies SessionEntry;
        }

        const win = session?.window;
        if (win) {
          const tabs = Array.isArray(win?.tabs) ? win.tabs : [];
          const tabCount = tabs.length || undefined;
          const title = tabCount ? `窗口（${tabCount} 个标签页）` : '窗口';
          return {
            id: resolveStableId(session, idx, undefined, lastModified),
            type: 'window',
            title,
            tabCount,
            lastModified,
          } satisfies SessionEntry;
        }

        return null;
      })
      .filter(Boolean) as SessionEntry[];
  };

  const api: any = (browser as any)?.sessions;
  if (!api?.getRecentlyClosed) return null;
  try {
    const result = await api.getRecentlyClosed({ maxResults: limit });
    return mapSessions(result);
  } catch (error) {
    console.warn('sessions.getRecentlyClosed failed', error);
    return null;
  }
};
