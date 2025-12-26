import { storage } from 'wxt/utils/storage';

type IconifyInfo = {
  name?: string;
  total?: number;
  version?: string;
  author?: { name?: string; url?: string };
  license?: { title?: string; url?: string };
};

type IconifyJSON = {
  prefix: string;
  icons?: Record<string, unknown>;
  categories?: Record<string, string[]>;
  info?: IconifyInfo;
};

type IconifySearchResponse = {
  icons?: string[];
  total?: number;
};

export const ICONIFY_API_BASE = 'https://api.iconify.design';
export const DEFAULT_ICON_PREFIX = 'lucide';
export const DEFAULT_ICON_NAME = `${DEFAULT_ICON_PREFIX}:layout-grid`;

const ICON_SVG_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7d

const svgCache = new Map<string, string>();
const inflightSvg = new Map<string, Promise<string>>();

const collectionCache = new Map<string, IconCollectionMeta>();
const inflightCollections = new Map<string, Promise<IconCollectionMeta | null>>();

const inflightSearch = new Map<string, Promise<IconifySearchResponse | null>>();

const svgStorageItem = storage.defineItem<Record<string, IconSvgCacheEntry>>('local:iconify-svg', {
  fallback: {},
});

export type IconSvgFetchOptions = {
  height?: number;
  color?: string;
};

export type IconCollectionMeta = Pick<IconifyJSON, 'prefix' | 'info' | 'categories'> & {
  icons: string[];
  total?: number;
};

type IconSvgCacheEntry = { svg: string; updatedAt: number };

/**
 * 标准化图标名称，未包含前缀时默认追加 lucide。
 */
export function normalizeIconName(name?: string, fallback = DEFAULT_ICON_NAME, prefix = DEFAULT_ICON_PREFIX) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return fallback;
  if (trimmed.includes(':')) return trimmed;
  const normalizedPrefix = prefix?.trim() || DEFAULT_ICON_PREFIX;
  return `${normalizedPrefix}:${trimmed}`;
}

/**
 * 拆分图标名，返回 { prefix, name }。
 */
export function splitIconName(name?: string) {
  const normalized = normalizeIconName(name);
  const [prefix, icon] = normalized.split(':');
  return { prefix, name: icon };
}

/**
 * 通过 Iconify API 拉取 SVG 字符串，内部做缓存。
 */
export async function fetchIconSvg(name?: string, options?: IconSvgFetchOptions): Promise<string> {
  const resolvedName = normalizeIconName(name);
  const height = Math.max(12, Math.floor(options?.height ?? 24));
  const color = options?.color ?? 'currentColor';
  const cacheKey = `${resolvedName}?h=${height}&c=${color}`;
  if (svgCache.has(cacheKey)) {
    return svgCache.get(cacheKey)!;
  }
  if (inflightSvg.has(cacheKey)) {
    return inflightSvg.get(cacheKey)!;
  }

  const loader = (async () => {
    try {
      const persisted = await readSvgCache(cacheKey);
      if (persisted) {
        svgCache.set(cacheKey, persisted);
        return persisted;
      }
      const url = `${ICONIFY_API_BASE}/${resolvedName}.svg?height=${height}&color=${encodeURIComponent(color)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Iconify SVG 请求失败：${res.status}`);
      }
      const svg = await res.text();
      svgCache.set(cacheKey, svg);
      await writeSvgCache(cacheKey, svg);
      return svg;
    } finally {
      inflightSvg.delete(cacheKey);
    }
  })();

  inflightSvg.set(cacheKey, loader);
  return loader;
}

/**
 * 将 icon 名称数组转换为统一结构，方便搜索展示。
 */
export function buildIconEntries(prefix: string, icons: string[]) {
  return icons.map((name) => ({
    prefix,
    name,
    fullName: `${prefix}:${name}`,
    keywords: [name, `${prefix}:${name}`],
  }));
}

/**
 * 获取指定前缀集合的元数据，包括所有图标名称（内存 + WXT storage 缓存）。
 */
export async function getIconCollectionMeta(prefix: string): Promise<IconCollectionMeta | null> {
  const normalized = prefix?.trim();
  if (!normalized) return null;
  if (collectionCache.has(normalized)) {
    return collectionCache.get(normalized)!;
  }
  if (inflightCollections.has(normalized)) {
    return inflightCollections.get(normalized)!;
  }

  const request = fetchCollectionFromNetwork(normalized)
    .then((meta) => {
      if (meta) {
        collectionCache.set(normalized, meta);
      }
      return meta;
    })
    .finally(() => {
      inflightCollections.delete(normalized);
    });

  inflightCollections.set(normalized, request);
  return request;
}

/**
 * 通过 Iconify Search API 检索图标，返回带 prefix 的完整图标名数组。
 */
export async function searchIcons(query: string, prefixes: string[], limit = 200) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const collected = new Set<string>();

  if (!prefixes.length) {
    try {
      const data = await fetchSearch(trimmed, undefined, limit);
      if (data?.icons?.length) {
        data.icons.forEach((item) => collected.add(normalizeIconName(item)));
      }
    } catch (error) {
      console.error('[iconify] search error', error);
    }
    return Array.from(collected);
  }

  for (const prefix of prefixes) {
    try {
      const data = await fetchSearch(trimmed, prefix, limit);
      if (!data?.icons?.length) continue;
      data.icons.forEach((item) => {
        const normalized = normalizeIconName(item, `${prefix}:${item}`, prefix);
        collected.add(normalized);
      });
    } catch (error) {
      console.error('[iconify] search error', error);
    }
  }
  return Array.from(collected);
}

async function fetchCollectionFromNetwork(prefix: string): Promise<IconCollectionMeta | null> {
  try {
    const res = await fetch(`${ICONIFY_API_BASE}/collection?prefix=${encodeURIComponent(prefix)}`);
    if (!res.ok) {
      throw new Error(`Iconify Collection 请求失败：${res.status}`);
    }
    const data = (await res.json()) as IconifyJSON;
    const icons = Array.isArray((data as unknown as { icons?: string[] }).icons)
      ? ((data as unknown as { icons?: string[] }).icons ?? [])
      : Object.keys(data.icons ?? {});
    return {
      prefix: data.prefix,
      info: data.info as IconifyInfo | undefined,
      categories: data.categories,
      icons,
      total: icons.length,
    };
  } catch (error) {
    console.error('[iconify] fetch collection error', error);
    return null;
  }
}

async function fetchSearch(query: string, prefix?: string, limit = 200): Promise<IconifySearchResponse | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const inflightKey = `${prefix || 'all'}::${limit}::${trimmed}`;
  if (inflightSearch.has(inflightKey)) {
    return inflightSearch.get(inflightKey)!;
  }

  const request = fetchSearchFromNetwork(trimmed, prefix, limit).finally(() => {
    inflightSearch.delete(inflightKey);
  });

  inflightSearch.set(inflightKey, request);
  return request;
}

async function fetchSearchFromNetwork(
  query: string,
  prefix?: string,
  limit = 200,
): Promise<IconifySearchResponse | null> {
  const url = new URL(`${ICONIFY_API_BASE}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', `${limit}`);
  if (prefix) {
    url.searchParams.set('collection', prefix);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Iconify Search 请求失败：${res.status}`);
  }
  return (await res.json()) as IconifySearchResponse;
}

async function readSvgCache(key: string): Promise<string | null> {
  try {
    const cached = await svgStorageItem.getValue();
    const entry = cached[key];
    if (entry) {
      if (Date.now() - entry.updatedAt <= ICON_SVG_CACHE_TTL) {
        return entry.svg;
      }
      const cloned = { ...cached };
      delete cloned[key];
      await svgStorageItem.setValue(cloned);
    }
  } catch (error) {
    console.warn('[iconify] read svg cache failed', error);
  }
  return null;
}

async function writeSvgCache(key: string, svg: string) {
  try {
    const cached = await svgStorageItem.getValue();
    await svgStorageItem.setValue({
      ...cached,
      [key]: { svg, updatedAt: Date.now() },
    });
  } catch (error) {
    console.warn('[iconify] write svg cache failed', error);
  }
}
