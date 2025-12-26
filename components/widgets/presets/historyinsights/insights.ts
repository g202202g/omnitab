import { searchHistory, type HistoryItem } from '@/components/widgets/presets/history/history';

export type DomainPage = {
  id: string;
  url: string;
  title: string;
  lastVisitTime?: number;
};

export type DomainInsight = {
  id: string;
  host: string;
  href: string;
  uniquePages: number;
  lastVisitTime?: number;
};

const safeHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

export type BuildHistoryInsightsParams = {
  daysRange: number;
  maxResults?: number;
  topDomains: number;
};

export type HistoryInsightsResult = {
  items: HistoryItem[];
  uniquePages: number;
  uniqueDomains: number;
  domains: DomainInsight[];
};

export const buildHistoryInsights = async (
  params: BuildHistoryInsightsParams,
): Promise<HistoryInsightsResult | null> => {
  const daysRaw = Number(params.daysRange);
  const daysRange = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 7;
  const topRaw = Number(params.topDomains);
  const topDomains = Number.isFinite(topRaw) ? Math.max(3, Math.min(50, Math.floor(topRaw))) : 10;
  const maxResultsRaw = Number(params.maxResults);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.max(50, Math.min(5000, Math.floor(maxResultsRaw))) : 5000;

  const now = Date.now();
  const startTime = now - daysRange * 24 * 60 * 60 * 1000;
  const result = await searchHistory({ text: '', startTime, maxResults });
  if (!result) return null;

  const domainMap = new Map<string, DomainInsight>();
  for (const item of result) {
    const host = safeHost(item.url);
    if (!host) continue;
    const existing = domainMap.get(host);
    const lastVisitTime = typeof item.lastVisitTime === 'number' ? item.lastVisitTime : undefined;
    if (!existing) {
      domainMap.set(host, {
        id: host,
        host,
        href: `https://${host}/`,
        uniquePages: 1,
        lastVisitTime,
      });
      continue;
    }
    existing.uniquePages += 1;
    if (lastVisitTime && (!existing.lastVisitTime || lastVisitTime > existing.lastVisitTime)) {
      existing.lastVisitTime = lastVisitTime;
    }
  }

  const domainsAll = [...domainMap.values()].sort((a, b) => {
    if (b.uniquePages !== a.uniquePages) return b.uniquePages - a.uniquePages;
    const ta = a.lastVisitTime ?? 0;
    const tb = b.lastVisitTime ?? 0;
    return tb - ta;
  });

  const domains = domainsAll.slice(0, topDomains);

  return {
    items: result,
    uniquePages: result.length,
    uniqueDomains: domainMap.size,
    domains,
  };
};
