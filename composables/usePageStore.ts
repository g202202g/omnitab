/**
 * 页面存储与业务状态：
 * - 维护页面列表与当前激活页
 * - 持久化到 WXT storage（双向同步）
 * - 提供增删改、激活切换
 */
import { computed, ref, watch } from 'vue';
import { useStoredValue } from './useStoredValue';
import { useLog } from './useLog';
import { DEFAULT_ICON_NAME, normalizeIconName } from '@/lib/iconify';

export interface PageInfo {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  bgType?: 'daily' | 'image' | 'color';
  bgValue?: string;
  bgSource?: 'bing' | 'unsplash';
  bgMask?: number;
  createdAt: number;
}

interface PageState {
  pages: PageInfo[];
  activePageId: string;
}

const STORAGE_KEY = 'local:page-state';
const pageState = useStoredValue<PageState>(STORAGE_KEY, {
  pages: [],
  activePageId: '',
});

const logger = useLog('page-store');

export const DEFAULT_BG_IMAGE_URL =
  'https://cn.bing.com/th?id=OHR.EverestGlow_ZH-CN4985720231_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp&w=3840&h=2160&rs=1&c=4';

const pages = ref<PageInfo[]>([]);
const activePageId = ref<string>('');
const ready = ref(false);

let watcherRegistered = false;
let suspendPersist = false;

const createId = () => crypto.randomUUID?.() ?? `page-${Date.now()}`;

const clampMask = (value?: number, fallback = 0.35) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, 0), 1);
};

const isLikelyImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return true;
  return false;
};

const normalizeBgValue = (value?: string) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return isLikelyImageUrl(trimmed) ? trimmed : DEFAULT_BG_IMAGE_URL;
};

const normalizePages = (raw: unknown): PageInfo[] => {
  const normalizeOne = (value: unknown, fallbackId: string): PageInfo | null => {
    if (!value || typeof value !== 'object') return null;
    const p = value as Partial<PageInfo>;
    const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : fallbackId;
    if (!id) return null;
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '页面';
    const createdAt = Number(p.createdAt);
    return {
      id,
      name,
      icon: normalizeIconName(p.icon, DEFAULT_ICON_NAME),
      description: typeof p.description === 'string' ? p.description : '',
      // 背景能力简化：统一为图片地址（兼容旧数据）
      bgType: 'image',
      bgValue: normalizeBgValue(p.bgValue),
      bgSource: p.bgSource ?? 'bing',
      bgMask: clampMask(p.bgMask, 0.35),
      createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
    };
  };

  if (Array.isArray(raw)) {
    return raw.map((item, index) => normalizeOne(item, `page-${index}`)).filter((item): item is PageInfo => !!item);
  }

  return [];
};

const ensureActive = () => {
  if (!pages.value.length) {
    const fallback = createDefaultPage('首页');
    pages.value = [fallback];
    activePageId.value = fallback.id;
    return;
  }

  if (!pages.value.some((page) => page.id === activePageId.value)) {
    activePageId.value = pages.value[0]?.id ?? '';
  }
};

const createDefaultPage = (
  name: string,
  icon = DEFAULT_ICON_NAME,
  description = '',
  bgValue = DEFAULT_BG_IMAGE_URL,
  bgMask = 0.35,
): PageInfo => ({
  id: createId(),
  name,
  icon: normalizeIconName(icon, DEFAULT_ICON_NAME),
  description,
  bgType: 'image',
  bgValue: normalizeBgValue(bgValue),
  bgMask: clampMask(bgMask, 0.35),
  createdAt: Date.now(),
});

const persist = async () => {
  const plainPages = pages.value.map((p) => ({ ...p }));
  const value: PageState = {
    pages: plainPages,
    activePageId: activePageId.value,
  };
  logger.info('persist', { pages: value.pages.length, activePageId: value.activePageId });
  pageState.set(value);
};

const registerWatcher = () => {
  if (watcherRegistered) return;
  watcherRegistered = true;

  // 初始化后再开始持久化，避免空写入覆盖已存在数据
  watch(
    [pages, activePageId],
    () => {
      if (!ready.value) return;
      if (suspendPersist) return;
      void persist();
    },
    { deep: true },
  );
};

const init = async () => {
  if (ready.value) return;

  await pageState.reload();
  const saved = pageState.state.value;
  logger.info('load success', {
    pages: Array.isArray(saved.pages) ? saved.pages.length : 0,
    activePageId: saved.activePageId,
  });

  const savedPages = normalizePages(saved?.pages);

  suspendPersist = true;
  if (savedPages.length) {
    pages.value = savedPages;
    activePageId.value =
      saved?.activePageId && savedPages.some((p) => p.id === saved.activePageId)
        ? saved.activePageId
        : (savedPages[0]?.id ?? '');
  } else {
    const defaultPage = createDefaultPage('首页');
    pages.value = [defaultPage];
    activePageId.value = defaultPage.id;
    logger.info('load empty, use default');
  }

  ensureActive();
  ready.value = true;
  suspendPersist = false;
  // 初始化后立即落盘，保证 fallback 场景也会写入存储
  await persist();
};

const reload = async () => {
  await pageState.reload();
  const saved = pageState.state.value;
  const savedPages = normalizePages(saved?.pages);

  suspendPersist = true;
  if (savedPages.length) {
    pages.value = savedPages;
    activePageId.value =
      saved?.activePageId && savedPages.some((p) => p.id === saved.activePageId)
        ? saved.activePageId
        : (savedPages[0]?.id ?? '');
  } else {
    const defaultPage = createDefaultPage('首页');
    pages.value = [defaultPage];
    activePageId.value = defaultPage.id;
  }
  ensureActive();
  suspendPersist = false;
  await persist();
};

const addPage = (payload?: { name?: string; icon?: string; bgValue?: string; bgMask?: number }) => {
  const page: PageInfo = createDefaultPage(
    payload?.name ?? `页面 ${pages.value.length + 1}`,
    normalizeIconName(payload?.icon, DEFAULT_ICON_NAME),
    '',
    payload?.bgValue ?? DEFAULT_BG_IMAGE_URL,
    clampMask(payload?.bgMask, 0.35),
  );
  pages.value = [...pages.value, page];
  activePageId.value = page.id;
  return page;
};

const renamePage = (payload: { id: string; name: string; icon?: string; bgValue?: string; bgMask?: number }) => {
  const trimmed = payload.name.trim();
  if (!trimmed) return;

  pages.value = pages.value.map((page) =>
    page.id === payload.id
      ? {
          ...page,
          name: trimmed,
          icon: normalizeIconName(payload.icon ?? page.icon, DEFAULT_ICON_NAME),
          bgType: 'image',
          bgValue: normalizeBgValue(payload.bgValue ?? page.bgValue),
          bgMask:
            typeof payload.bgMask === 'number'
              ? clampMask(payload.bgMask, page.bgMask ?? 0.35)
              : clampMask(page.bgMask, 0.35),
        }
      : page,
  );
};

const removePage = (id: string) => {
  if (pages.value.length <= 1) return;
  pages.value = pages.value.filter((page) => page.id !== id);
  ensureActive();
};

const setActivePage = (id: string) => {
  if (pages.value.some((page) => page.id === id)) {
    activePageId.value = id;
  }
};

const activePage = computed(() => pages.value.find((page) => page.id === activePageId.value) ?? pages.value[0] ?? null);

export function usePageStore() {
  registerWatcher();

  return {
    pages,
    activePageId,
    ready,
    activePage,
    init,
    reload,
    addPage,
    renamePage,
    removePage,
    setActivePage,
  };
}
