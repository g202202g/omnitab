import { computed } from 'vue';
import { useStoredValue } from './useStoredValue';
import { useLog } from './useLog';
import { DEFAULT_WIDGET_TYPE, resolveWidgetDefinition, widgetDefinitions } from '@/components/widgets/registry';
import type { WidgetType } from '@/components/widgets/types';
import { DEFAULT_ICON_PREFIX, normalizeIconName } from '@/lib/iconify';

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

interface WidgetState {
  pages: Record<string, WidgetLayout[]>;
}

const STORAGE_KEY = 'local:page-widgets';
const fallbackState: WidgetState = { pages: {} };
const widgetState = useStoredValue<WidgetState>(STORAGE_KEY, fallbackState);
const logger = useLog('widget-store');

const createId = () => crypto.randomUUID?.() ?? `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isWidgetType = (value: unknown): value is WidgetType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(widgetDefinitions, value);

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

      let normalizedData: Record<string, unknown> | undefined =
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

const normalizeState = (state: unknown): WidgetState => {
  if (state && typeof state === 'object' && 'pages' in (state as WidgetState)) {
    const pages = (state as WidgetState).pages;
    if (pages && typeof pages === 'object') {
      const normalized: Record<string, WidgetLayout[]> = {};
      Object.entries(pages).forEach(([pageId, items]) => {
        normalized[pageId] = normalizeWidgets(items);
      });
      return { pages: normalized };
    }
  }
  return { pages: {} };
};

const resolveNextY = (widgets: WidgetLayout[]) =>
  widgets.reduce((maxY, item) => Math.max(maxY, Math.max(0, item.y) + Math.max(1, item.h)), 0);

const cloneWidgetData = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return { ...(value as Record<string, unknown>) };
};

export function useWidgetStore() {
  const ready = computed(() => widgetState.ready.value);

  const init = async () => {
    await widgetState.reload();
    const normalized = normalizeState(widgetState.state.value);
    logger.info('init load', {
      rawPages: widgetState.state.value?.pages ? Object.keys(widgetState.state.value.pages).length : 0,
      normalizedPages: Object.keys(normalized.pages).length,
      keys: Object.keys(normalized.pages),
      firstPageLength: normalized.pages ? normalized.pages[Object.keys(normalized.pages)[0]]?.length : 0,
    });
    widgetState.set(normalized);
    logger.info('init widget layouts', { pages: Object.keys(normalized.pages).length });
  };

  const getWidgets = (pageId: string) => {
    const list = normalizeWidgets(widgetState.state.value.pages?.[pageId] ?? []);
    logger.info('get widgets', { pageId, count: list.length, ready: ready.value });
    return list;
  };

  const replacePage = (pageId: string, widgets: WidgetLayout[]) => {
    if (!pageId) return;
    const normalized = normalizeWidgets(widgets);
    const pages = normalizeState(widgetState.state.value).pages;
    logger.info('replace page widgets', { pageId, count: normalized.length, first: normalized[0] });
    widgetState.set({
      pages: {
        ...pages,
        [pageId]: normalized,
      },
    });
    logger.info('save page widgets', {
      pageId,
      count: normalized.length,
      layouts: normalized.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
    });
  };

  const removeWidget = (pageId: string, widgetId: string) => {
    if (!pageId || !widgetId) return;
    const list = getWidgets(pageId).filter((item) => item.id !== widgetId);
    replacePage(pageId, list);
  };

  const copyWidgetToPage = (fromPageId: string, toPageId: string, widgetId: string) => {
    if (!fromPageId || !toPageId || !widgetId) return null;
    const fromList = getWidgets(fromPageId);
    const source = fromList.find((item) => item.id === widgetId);
    if (!source) return null;

    const toList = getWidgets(toPageId);
    const nextY = resolveNextY(toList) + 1;
    const newId = createId();
    const copied: WidgetLayout = {
      ...source,
      id: newId,
      x: 0,
      y: nextY,
      data: cloneWidgetData(source.data),
    };
    logger.info('copy widget', { fromPageId, toPageId, widgetId, newId });
    replacePage(toPageId, [...toList, copied]);
    return newId;
  };

  const moveWidgetToPage = (fromPageId: string, toPageId: string, widgetId: string) => {
    if (!fromPageId || !toPageId || !widgetId) return false;
    if (fromPageId === toPageId) return false;
    const fromList = getWidgets(fromPageId);
    const source = fromList.find((item) => item.id === widgetId);
    if (!source) return false;

    const toList = getWidgets(toPageId);
    const nextY = resolveNextY(toList) + 1;
    const nextId = toList.some((w) => w.id === source.id) ? createId() : source.id;
    const moved: WidgetLayout = {
      ...source,
      id: nextId,
      x: 0,
      y: nextY,
      data: cloneWidgetData(source.data),
    };

    logger.info('move widget', { fromPageId, toPageId, widgetId, nextId });
    replacePage(
      fromPageId,
      fromList.filter((item) => item.id !== widgetId),
    );
    replacePage(toPageId, [...toList, moved]);
    return true;
  };

  const addWidget = (pageId: string, payload?: Partial<WidgetLayout>) => {
    if (!pageId) return null;
    const list = getWidgets(pageId);
    const type = isWidgetType(payload?.type) ? payload?.type : DEFAULT_WIDGET_TYPE;
    const def = resolveWidgetDefinition(type);
    const baseData = payload?.data && typeof payload.data === 'object' ? { ...payload.data } : undefined;
    const widget: WidgetLayout = {
      id: payload?.id ?? createId(),
      x: Math.max(0, payload?.x ?? 0),
      y: Math.max(0, payload?.y ?? list.length * 2),
      w: Math.max(1, payload?.w ?? def.defaults.w),
      h: Math.max(1, payload?.h ?? def.defaults.h),
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
      data: baseData,
    };
    logger.info('add widget', { pageId, widget });
    replacePage(pageId, [...list, widget]);
    return widget;
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
  };
}
