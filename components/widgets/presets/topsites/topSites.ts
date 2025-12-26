import { browser } from 'wxt/browser';

export type TopSiteItem = {
  id: string;
  url: string;
  title: string;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

export const getTopSites = async (): Promise<TopSiteItem[] | null> => {
  const api: any = (browser as any)?.topSites;
  if (!api?.get) return null;
  try {
    const result = await api.get();
    const items = Array.isArray(result) ? result : [];
    return items
      .map((item: any, idx: number) => {
        const url = normalizeText(item?.url);
        if (!url || !isHttpUrl(url)) return null;
        const title = normalizeText(item?.title) || url;
        return {
          id: `${idx}-${url}`,
          url,
          title,
        } satisfies TopSiteItem;
      })
      .filter(Boolean) as TopSiteItem[];
  } catch (error) {
    console.warn('topSites.get failed', error);
    return null;
  }
};
