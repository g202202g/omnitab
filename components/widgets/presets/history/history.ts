import { browser } from 'wxt/browser';

export type HistoryItem = {
  id: string;
  url: string;
  title: string;
  lastVisitTime?: number;
  visitCount?: number;
};

export type HistorySearchParams = {
  text?: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

export const searchHistory = async (params: HistorySearchParams): Promise<HistoryItem[] | null> => {
  const api = browser?.history;
  if (!api?.search) return null;

  const text = normalizeText(params.text);
  const maxResultsRaw = Number(params.maxResults);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.max(1, Math.min(5000, Math.floor(maxResultsRaw))) : 100;
  const startTime =
    typeof params.startTime === 'number' && Number.isFinite(params.startTime) ? params.startTime : undefined;
  const endTime = typeof params.endTime === 'number' && Number.isFinite(params.endTime) ? params.endTime : undefined;

  const result = await api.search({
    text,
    maxResults,
    startTime,
    endTime,
  });

  const items = Array.isArray(result) ? result : [];
  return items
    .map((item: any) => {
      const id = normalizeText(item?.id) || normalizeText(item?.url);
      const url = normalizeText(item?.url);
      if (!url || !isHttpUrl(url)) return null;
      return {
        id: id || url,
        url,
        title: normalizeText(item?.title) || url,
        lastVisitTime: typeof item?.lastVisitTime === 'number' ? item.lastVisitTime : undefined,
        visitCount: typeof item?.visitCount === 'number' ? item.visitCount : undefined,
      } satisfies HistoryItem;
    })
    .filter(Boolean) as HistoryItem[];
};
