import { computed } from 'vue';
import { useStoredValue } from './useStoredValue';
import { useLog } from './useLog';
import { DEFAULT_WIDGET_TYPE, resolveWidgetDefinition, widgetDefinitions } from '@/components/widgets/registry';
import type { WidgetType } from '@/components/widgets/types';
import { DEFAULT_ICON_PREFIX, normalizeIconName } from '@/lib/iconify';
import { LAYOUT_BREAKPOINTS, type LayoutBreakpoint } from '@/utils/layoutBreakpoints';

export interface WidgetLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  type?: WidgetType;
  name?: string;
  icon?: string;
  description?: string;
  showBorder?: boolean;
  showTitle?: boolean;
  showBackground?: boolean;
  data?: Record<string, unknown>;
}

export type WidgetGeometry = Pick<WidgetLayout, 'id' | 'x' | 'y' | 'w' | 'h'>;

type WidgetState = {
  /**
   * 作为“唯一配置源”：保存 base 布局下的完整 WidgetLayout（包含 data/type/name/...）。
   * 其它模块（background/content_hider）也依赖这里扫描 iframe 配置。
   */
  pages: Record<string, WidgetLayout[]>;
  /**
   * 不同断点仅保存几何布局（x/y/w/h）。
   * 断点下渲染时使用 base 的配置 + 断点的几何合并得到最终 WidgetLayout。
   */
  breakpoints: Record<string, Partial<Record<LayoutBreakpoint, WidgetGeometry[]>>>;
};

const STORAGE_KEY = 'local:page-widgets';
const fallbackState: WidgetState = { pages: {}, breakpoints: {} };
const widgetState = useStoredValue<WidgetState>(STORAGE_KEY, fallbackState);
const logger = useLog('widget-store');

const createId = () => crypto.randomUUID?.() ?? `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isWidgetType = (value: unknown): value is WidgetType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(widgetDefinitions, value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const cloneWidgetData = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return { ...(value as Record<string, unknown>) };
};

const normalizeWidgets = (list: unknown): WidgetLayout[] => {
  const items = Array.isArray(list) ? list : [];

  const ensureType = (value: unknown): WidgetType => (isWidgetType(value) ? value : DEFAULT_WIDGET_TYPE);

  return items
    .map((item): WidgetLayout | null => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<WidgetLayout>;
      const id = raw.id ?? '';
      if (!id) return null;
      const type = ensureType(raw.type);
      const def = resolveWidgetDefinition(type);

      const safeNumber = (value: unknown, defaultValue: number) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : defaultValue;
      };

      const normalizedData: Record<string, unknown> | undefined =
        (raw as WidgetLayout).data && typeof (raw as WidgetLayout).data === 'object'
          ? { ...(raw as WidgetLayout).data }
          : undefined;

      const isLegacyClockConstraints =
        type === 'clock' &&
        typeof raw.minW === 'number' &&
        typeof raw.minH === 'number' &&
        typeof raw.maxH === 'number' &&
        raw.minW === 4 &&
        raw.minH === 3 &&
        raw.maxH === 3;

      return {
        id: String(id),
        x: Math.max(0, safeNumber(raw.x, 0)),
        y: Math.max(0, safeNumber(raw.y, 0)),
        w: Math.max(1, safeNumber(raw.w, def.defaults.w)),
        h: Math.max(1, safeNumber(raw.h, def.defaults.h)),
        minW: isLegacyClockConstraints
          ? def.defaults.minW
          : typeof raw.minW === 'number'
            ? Math.max(1, raw.minW)
            : def.defaults.minW,
        minH: isLegacyClockConstraints
          ? def.defaults.minH
          : typeof raw.minH === 'number'
            ? Math.max(1, raw.minH)
            : def.defaults.minH,
        maxW: typeof raw.maxW === 'number' ? Math.max(1, raw.maxW) : def.defaults.maxW,
        maxH: isLegacyClockConstraints
          ? def.defaults.maxH
          : typeof raw.maxH === 'number'
            ? Math.max(1, raw.maxH)
            : def.defaults.maxH,
        type,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined,
        icon: (() => {
          const rawIcon = (raw as WidgetLayout).icon;
          return typeof rawIcon === 'string' && rawIcon.trim()
            ? normalizeIconName(rawIcon, '', DEFAULT_ICON_PREFIX)
            : undefined;
        })(),
        description: (() => {
          const rawDescription = (raw as WidgetLayout).description;
          return typeof rawDescription === 'string' && rawDescription.trim() ? rawDescription.trim() : undefined;
        })(),
        showBorder: raw.showBorder === false ? false : (def.defaults.showBorder ?? true),
        showTitle: raw.showTitle === false ? false : (def.defaults.showTitle ?? true),
        showBackground: raw.showBackground === false ? false : (def.defaults.showBackground ?? true),
        data: normalizedData,
      };
    })
    .filter((item): item is WidgetLayout => !!item);
};

const normalizeWidgetMap = (value: unknown): WidgetLayout[] => {
  // 兼容旧结构：{ [id]: {x,y,w,h,...} }
  if (isRecord(value)) {
    return Object.entries(value).map(([id, widget]) => ({ id, ...(widget as object) })) as WidgetLayout[];
  }
  return [];
};

const normalizeAnyWidgets = (value: unknown): WidgetLayout[] => {
  if (Array.isArray(value)) return normalizeWidgets(value);
  if (isRecord(value)) return normalizeWidgets(normalizeWidgetMap(value));
  return [];
};

const hasBreakpointKeys = (value: unknown) =>
  isRecord(value) && Object.keys(value).some((key) => (LAYOUT_BREAKPOINTS as readonly string[]).includes(key));

const extractGeometry = (widget: WidgetLayout): WidgetGeometry => ({
  id: widget.id,
  x: widget.x,
  y: widget.y,
  w: widget.w,
  h: widget.h,
});

const applyGeometry = (base: WidgetLayout, geo: WidgetGeometry): WidgetLayout => ({
  ...base,
  x: geo.x,
  y: geo.y,
  w: geo.w,
  h: geo.h,
});

const mergeMetaIntoBase = (base: WidgetLayout, patch: Partial<WidgetLayout>): WidgetLayout => {
  const next: WidgetLayout = { ...base };

  if (typeof patch.type === 'string' && patch.type.trim() && isWidgetType(patch.type)) next.type = patch.type;
  if (typeof patch.name === 'string') next.name = patch.name.trim() ? patch.name.trim() : undefined;
  if (typeof patch.icon === 'string') next.icon = patch.icon.trim() ? normalizeIconName(patch.icon, '', DEFAULT_ICON_PREFIX) : undefined;
  if (typeof patch.description === 'string') next.description = patch.description.trim() ? patch.description.trim() : undefined;

  if (typeof patch.showBorder === 'boolean') next.showBorder = patch.showBorder;
  if (typeof patch.showTitle === 'boolean') next.showTitle = patch.showTitle;
  if (typeof patch.showBackground === 'boolean') next.showBackground = patch.showBackground;

  if (typeof patch.minW === 'number') next.minW = Math.max(1, patch.minW);
  if (typeof patch.minH === 'number') next.minH = Math.max(1, patch.minH);
  if (typeof patch.maxW === 'number') next.maxW = Math.max(1, patch.maxW);
  if (typeof patch.maxH === 'number') next.maxH = Math.max(1, patch.maxH);

  if (patch.data && typeof patch.data === 'object') next.data = cloneWidgetData(patch.data);

  // 注意：不覆盖 base 的几何（x/y/w/h）
  next.x = base.x;
  next.y = base.y;
  next.w = base.w;
  next.h = base.h;

  return next;
};

const normalizeState = (state: unknown): WidgetState => {
  const raw = isRecord(state) ? state : {};

  const rawPages = isRecord(raw.pages) ? (raw.pages as Record<string, unknown>) : {};
  const rawBreakpoints = isRecord(raw.breakpoints) ? (raw.breakpoints as Record<string, unknown>) : {};
  const rawWidgets = isRecord(raw.widgets) ? (raw.widgets as Record<string, unknown>) : null; // 兼容：旧版 widgets

  const pages: Record<string, WidgetLayout[]> = {};
  const breakpoints: Record<string, Partial<Record<LayoutBreakpoint, WidgetGeometry[]>>> = {};

  Object.entries(rawPages).forEach(([pageId, value]) => {
    // pages[pageId] 只保留 base 的完整 WidgetLayout[]
    const baseList = (() => {
      if (hasBreakpointKeys(value)) {
        const record = value as Record<string, unknown>;
        return normalizeAnyWidgets(record.base ?? []);
      }
      return normalizeAnyWidgets(value);
    })();

    // 兼容：旧 widgets 表（如果存在，把配置合并回 pages）
    const mergedBase = rawWidgets
      ? baseList.map((item) => {
          const extra = rawWidgets[item.id];
          if (!extra || typeof extra !== 'object') return item;
          return mergeMetaIntoBase(item, extra as Partial<WidgetLayout>);
        })
      : baseList;

    pages[pageId] = normalizeWidgets(mergedBase);

    const pageBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = {
      base: pages[pageId].map(extractGeometry),
    };

    // 兼容：上一版把断点对象塞在 pages[pageId]
    if (hasBreakpointKeys(value)) {
      const record = value as Record<string, unknown>;
      LAYOUT_BREAKPOINTS.forEach((bp) => {
        const entry = record[bp];
        if (!entry) return;
        const list = normalizeAnyWidgets(entry);
        pageBps[bp as LayoutBreakpoint] = list.map(extractGeometry);
      });
    }

    breakpoints[pageId] = pageBps;
  });

  // 合并 breakpoints 表（如果存在则覆盖）
  Object.entries(rawBreakpoints).forEach(([pageId, value]) => {
    if (!pageId || !isRecord(value)) return;
    const record = value as Record<string, unknown>;
    const current = breakpoints[pageId] ?? { base: (pages[pageId] ?? []).map(extractGeometry) };
    const next: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...current };

    LAYOUT_BREAKPOINTS.forEach((bp) => {
      const entry = record[bp];
      if (!entry) return;
      const list = Array.isArray(entry) ? entry : [];
      const geos = list
        .map((item): WidgetGeometry | null => {
          if (!item || typeof item !== 'object') return null;
          const rawGeo = item as Partial<WidgetGeometry>;
          const id = String(rawGeo.id ?? '').trim();
          if (!id) return null;
          const x = Number(rawGeo.x);
          const y = Number(rawGeo.y);
          const w = Number(rawGeo.w);
          const h = Number(rawGeo.h);
          if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
          return { id, x: Math.max(0, x), y: Math.max(0, y), w: Math.max(1, w), h: Math.max(1, h) };
        })
        .filter((g): g is WidgetGeometry => !!g);

      // 过滤掉 base 不存在的 id，避免脏数据
      const baseIds = new Set((pages[pageId] ?? []).map((w) => w.id));
      next[bp as LayoutBreakpoint] = geos.filter((g) => baseIds.has(g.id));
    });

    // 确保 base 存在
    if (!next.base?.length) next.base = (pages[pageId] ?? []).map(extractGeometry);

    breakpoints[pageId] = next;
  });

  // 最终确保每个 page 的 base breakpoint 与 pages 一致
  Object.keys(pages).forEach((pageId) => {
    if (!breakpoints[pageId]) breakpoints[pageId] = {};
    breakpoints[pageId].base = pages[pageId].map(extractGeometry);
  });

  return { pages, breakpoints };
};

const resolveNextY = (widgets: WidgetLayout[]) =>
  widgets.reduce((maxY, item) => Math.max(maxY, Math.max(0, item.y) + Math.max(1, item.h)), 0);

const removeWidgetFromPageBreakpoints = (
  pageBreakpoints: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>>,
  widgetId: string,
) => {
  LAYOUT_BREAKPOINTS.forEach((bp) => {
    const list = pageBreakpoints[bp as LayoutBreakpoint];
    if (!list?.length) return;
    pageBreakpoints[bp as LayoutBreakpoint] = list.filter((item) => item.id !== widgetId);
  });
};

export function useWidgetStore() {
  const ready = computed(() => widgetState.ready.value);

  const init = async () => {
    await widgetState.reload();
    const normalized = normalizeState(widgetState.state.value);
    widgetState.set(normalized);
    logger.info('init widget layouts', {
      pages: Object.keys(normalized.pages).length,
      breakpoints: Object.keys(normalized.breakpoints).length,
    });
  };

  const ensureBreakpointSeeded = (pageId: string, breakpoint: LayoutBreakpoint) => {
    if (!pageId) return false;
    if (breakpoint === 'base') return false;

    const state = normalizeState(widgetState.state.value);
    const pageBps = state.breakpoints?.[pageId] ?? {};
    if (pageBps[breakpoint]?.length) return false;

    const baseList = normalizeWidgets(state.pages?.[pageId] ?? []);
    const baseGeos = pageBps.base ?? baseList.map(extractGeometry);
    if (!baseGeos.length) return false;

    const nextBreakpoints: WidgetState['breakpoints'] = { ...state.breakpoints };
    const nextPageBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[pageId] ?? {}) };
    nextPageBps.base = baseGeos;
    nextPageBps[breakpoint] = baseGeos.map((g) => ({ ...g }));
    nextBreakpoints[pageId] = nextPageBps;

    widgetState.set({ pages: state.pages, breakpoints: nextBreakpoints });
    logger.info('seed breakpoint layout from base', { pageId, breakpoint, count: baseGeos.length });
    return true;
  };

  const getWidgets = (pageId: string, breakpoint: LayoutBreakpoint = 'base') => {
    const state = normalizeState(widgetState.state.value);
    const baseList = normalizeWidgets(state.pages?.[pageId] ?? []);
    const pageBps = state.breakpoints?.[pageId] ?? {};

    const baseGeos = pageBps.base ?? baseList.map(extractGeometry);
    const bpGeos = pageBps[breakpoint] ?? baseGeos;

    const baseById = new Map(baseList.map((w) => [w.id, w] as const));
    const baseGeoById = new Map(baseGeos.map((g) => [g.id, g] as const));

    const merged: WidgetLayout[] = [];
    const used = new Set<string>();

    bpGeos.forEach((geo) => {
      const base = baseById.get(geo.id);
      if (!base) return;
      merged.push(applyGeometry(base, geo));
      used.add(geo.id);
    });

    // 兜底：断点几何缺失的 widget，按 base 几何补齐
    baseList.forEach((item) => {
      if (used.has(item.id)) return;
      const geo = baseGeoById.get(item.id) ?? extractGeometry(item);
      merged.push(applyGeometry(item, geo));
      used.add(item.id);
    });

    return normalizeWidgets(merged);
  };

  const replacePage = (pageId: string, layouts: WidgetLayout[], options?: { breakpoint?: LayoutBreakpoint }) => {
    if (!pageId) return;
    const breakpoint = options?.breakpoint ?? 'base';

    const state = normalizeState(widgetState.state.value);
    const incoming = normalizeWidgets(layouts);

    // 1) 断点几何始终更新
    const nextBreakpoints: WidgetState['breakpoints'] = { ...state.breakpoints };
    const pageBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[pageId] ?? {}) };
    pageBps[breakpoint] = incoming.map(extractGeometry);

    // 确保 base 存在
    const prevBase = normalizeWidgets(state.pages?.[pageId] ?? []);
    if (!pageBps.base?.length) pageBps.base = prevBase.map(extractGeometry);
    nextBreakpoints[pageId] = pageBps;

    // 2) base 配置始终是唯一配置源：把 incoming 的 meta 合并到 base（不覆盖 base 几何）
    const baseById = new Map(prevBase.map((w) => [w.id, w] as const));
    const nextBase: WidgetLayout[] = [];
    const seen = new Set<string>();

    incoming.forEach((item) => {
      const prev = baseById.get(item.id);
      if (prev) {
        const withMeta = mergeMetaIntoBase(prev, item);
        const final = breakpoint === 'base' ? { ...withMeta, ...extractGeometry(item) } : withMeta;
        nextBase.push(final);
        seen.add(item.id);
        return;
      }

      // 新 widget：直接用 incoming 作为 base 初始值（包含配置 + 当前几何）
      nextBase.push(item);
      seen.add(item.id);
    });

    // 旧 widget 但当前断点未出现在 incoming：保留 base
    prevBase.forEach((item) => {
      if (seen.has(item.id)) return;
      nextBase.push(item);
    });

    const normalizedBase = normalizeWidgets(nextBase);

    // 3) 让 base breakpoint 与 pages 同步
    const finalBreakpoints: WidgetState['breakpoints'] = { ...nextBreakpoints };
    finalBreakpoints[pageId] = { ...(finalBreakpoints[pageId] ?? {}), base: normalizedBase.map(extractGeometry) };

    widgetState.set({ pages: { ...state.pages, [pageId]: normalizedBase }, breakpoints: finalBreakpoints });

    logger.info('replace page widgets', {
      pageId,
      breakpoint,
      count: incoming.length,
    });
  };

  const removeWidget = (pageId: string, widgetId: string) => {
    if (!pageId || !widgetId) return;
    const state = normalizeState(widgetState.state.value);

    const nextPages: WidgetState['pages'] = { ...state.pages };
    nextPages[pageId] = normalizeWidgets((nextPages[pageId] ?? []).filter((item) => item.id !== widgetId));

    const nextBreakpoints: WidgetState['breakpoints'] = { ...state.breakpoints };
    const pageBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[pageId] ?? {}) };
    removeWidgetFromPageBreakpoints(pageBps, widgetId);
    pageBps.base = nextPages[pageId].map(extractGeometry);
    nextBreakpoints[pageId] = pageBps;

    widgetState.set({ pages: nextPages, breakpoints: nextBreakpoints });
  };

  const addWidget = (pageId: string, payload?: Partial<WidgetLayout>, options?: { breakpoint?: LayoutBreakpoint }) => {
    if (!pageId) return null;

    const breakpoint = options?.breakpoint ?? 'base';
    const state = normalizeState(widgetState.state.value);

    const type = isWidgetType(payload?.type) ? payload?.type : DEFAULT_WIDGET_TYPE;
    const def = resolveWidgetDefinition(type);

    const id = payload?.id ?? createId();

    const baseList = normalizeWidgets(state.pages?.[pageId] ?? []);
    const nextY = resolveNextY(baseList) + 1;

    const widget: WidgetLayout = {
      id,
      x: Math.max(0, Number.isFinite(Number(payload?.x)) ? Number(payload?.x) : 0),
      y: Math.max(0, Number.isFinite(Number(payload?.y)) ? Number(payload?.y) : nextY),
      w: Math.max(1, Number.isFinite(Number(payload?.w)) ? Number(payload?.w) : def.defaults.w),
      h: Math.max(1, Number.isFinite(Number(payload?.h)) ? Number(payload?.h) : def.defaults.h),
      minW: typeof payload?.minW === 'number' ? Math.max(1, payload.minW) : def.defaults.minW,
      minH: typeof payload?.minH === 'number' ? Math.max(1, payload.minH) : def.defaults.minH,
      maxW: typeof payload?.maxW === 'number' ? Math.max(1, payload.maxW) : def.defaults.maxW,
      maxH: typeof payload?.maxH === 'number' ? Math.max(1, payload.maxH) : def.defaults.maxH,
      type,
      name: typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined,
      icon:
        typeof payload?.icon === 'string' && payload.icon.trim()
          ? normalizeIconName(payload.icon, '', DEFAULT_ICON_PREFIX)
          : undefined,
      description:
        typeof payload?.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined,
      showBorder: payload?.showBorder === false ? false : (def.defaults.showBorder ?? true),
      showTitle: payload?.showTitle === false ? false : (def.defaults.showTitle ?? true),
      showBackground: payload?.showBackground === false ? false : (def.defaults.showBackground ?? true),
      data: payload?.data && typeof payload.data === 'object' ? { ...payload.data } : undefined,
    };

    const nextPages: WidgetState['pages'] = { ...state.pages };
    const existed = baseList.some((w) => w.id === id);
    const nextBase = existed
      ? baseList.map((item) => (item.id === id ? mergeMetaIntoBase({ ...item, ...extractGeometry(item) }, widget) : item))
      : [...baseList, widget];

    nextPages[pageId] = normalizeWidgets(nextBase);

    const nextBreakpoints: WidgetState['breakpoints'] = { ...state.breakpoints };
    const pageBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[pageId] ?? {}) };

    const baseGeos = nextPages[pageId].map(extractGeometry);
    pageBps.base = baseGeos;

    if (breakpoint !== 'base') {
      const list = pageBps[breakpoint] ?? [];
      if (!list.some((g) => g.id === id)) pageBps[breakpoint] = [...list, extractGeometry(widget)];
    }

    nextBreakpoints[pageId] = pageBps;

    widgetState.set({ pages: nextPages, breakpoints: nextBreakpoints });
    logger.info('add widget', { pageId, breakpoint, id, type });

    return widget;
  };

  const copyWidgetToPage = (fromPageId: string, toPageId: string, widgetId: string) => {
    if (!fromPageId || !toPageId || !widgetId) return null;
    const state = normalizeState(widgetState.state.value);

    const source = normalizeWidgets(state.pages?.[fromPageId] ?? []).find((item) => item.id === widgetId);
    if (!source) return null;

    const toBase = normalizeWidgets(state.pages?.[toPageId] ?? []);
    const nextY = resolveNextY(toBase) + 1;
    const newId = createId();

    const copied: WidgetLayout = {
      ...source,
      id: newId,
      x: 0,
      y: nextY,
      data: cloneWidgetData(source.data),
    };

    const nextPages: WidgetState['pages'] = {
      ...state.pages,
      [toPageId]: normalizeWidgets([...toBase, copied]),
    };

    const nextBreakpoints: WidgetState['breakpoints'] = { ...state.breakpoints };
    const pageBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[toPageId] ?? {}) };
    pageBps.base = nextPages[toPageId].map(extractGeometry);
    nextBreakpoints[toPageId] = pageBps;

    widgetState.set({ pages: nextPages, breakpoints: nextBreakpoints });
    logger.info('copy widget', { fromPageId, toPageId, widgetId, newId });
    return newId;
  };

  const moveWidgetToPage = (fromPageId: string, toPageId: string, widgetId: string) => {
    if (!fromPageId || !toPageId || !widgetId) return false;
    if (fromPageId === toPageId) return false;

    const state = normalizeState(widgetState.state.value);

    const fromBase = normalizeWidgets(state.pages?.[fromPageId] ?? []);
    const source = fromBase.find((item) => item.id === widgetId);
    if (!source) return false;

    const toBase = normalizeWidgets(state.pages?.[toPageId] ?? []);
    const nextY = resolveNextY(toBase) + 1;

    const moved: WidgetLayout = {
      ...source,
      x: 0,
      y: nextY,
      data: cloneWidgetData(source.data),
    };

    const nextPages: WidgetState['pages'] = {
      ...state.pages,
      [fromPageId]: normalizeWidgets(fromBase.filter((item) => item.id !== widgetId)),
      [toPageId]: normalizeWidgets([...toBase, moved]),
    };

    const nextBreakpoints: WidgetState['breakpoints'] = { ...state.breakpoints };

    const fromBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[fromPageId] ?? {}) };
    removeWidgetFromPageBreakpoints(fromBps, widgetId);
    fromBps.base = nextPages[fromPageId].map(extractGeometry);
    nextBreakpoints[fromPageId] = fromBps;

    const toBps: Partial<Record<LayoutBreakpoint, WidgetGeometry[]>> = { ...(nextBreakpoints[toPageId] ?? {}) };
    toBps.base = nextPages[toPageId].map(extractGeometry);
    nextBreakpoints[toPageId] = toBps;

    widgetState.set({ pages: nextPages, breakpoints: nextBreakpoints });
    logger.info('move widget', { fromPageId, toPageId, widgetId });
    return true;
  };

  return {
    ready,
    init,
    getWidgets,
    replacePage,
    addWidget,
    removeWidget,
    copyWidgetToPage,
    moveWidgetToPage,
    ensureBreakpointSeeded,
  };
}
