<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCcw, X } from 'lucide-vue-next';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import LinkListItem from '@/components/widgets/common/LinkListItem.vue';
import LinkIconTile from '@/components/widgets/common/LinkIconTile.vue';
import { searchHistory, type HistoryItem } from './history';

const PAGE_SIZE_DEFAULT = 24;
const DAYS_RANGE_DEFAULT = 7;
const LOAD_MORE_THRESHOLD_PX = 160;
const QUERY_DEBOUNCE_MS = 300;

const props = withDefaults(
  defineProps<{
    widgetId: string;
    editMode?: boolean;
    data?: Record<string, unknown>;
  }>(),
  {
    editMode: false,
    data: () => ({}),
  },
);

const controlsTarget = inject<WidgetCardControlsTarget | null>(WIDGET_CARD_CONTROLS_TARGET_KEY, null);
const controlsTo = computed(() => controlsTarget?.value ?? null);

const pageSize = computed(() => {
  const raw = Number((props.data as any)?.maxItems);
  if (!Number.isFinite(raw) || raw <= 0) return PAGE_SIZE_DEFAULT;
  return Math.max(1, Math.min(200, Math.floor(raw)));
});

const daysRange = computed(() => {
  const raw = Number((props.data as any)?.daysRange);
  if (!Number.isFinite(raw) || raw <= 0) return DAYS_RANGE_DEFAULT;
  return Math.max(1, Math.min(365, Math.floor(raw)));
});

const showFavicon = computed(() => ((props.data as any)?.showFavicon ?? true) !== false);
const showTime = computed(() => ((props.data as any)?.showTime ?? true) !== false);
const iconOnly = computed(() => ((props.data as any)?.displayMode ?? 'default') === 'icon-only');

const query = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const loadingTotal = ref(false);
const errorText = ref<string | null>(null);
const items = ref<HistoryItem[]>([]);
const hasMore = ref(true);
const cursorEndTime = ref<number>(Date.now());
const requestSeq = ref(0);
const totalCount = ref<number | null>(null);
const totalCountTruncated = ref(false);

const permissionChecked = ref(false);
const permissionGranted = ref(false);

const perm = useOptionalPermission();

const resolveStartTime = () => Date.now() - daysRange.value * 24 * 60 * 60 * 1000;

const containsHistoryPermission = async (): Promise<boolean | null> => {
  if (!perm.isSupported) return null;
  return await perm.contains({ permissions: ['history'] });
};

const tryCheckPermission = async () => {
  permissionChecked.value = true;
  const contains = await containsHistoryPermission();
  if (contains === null) {
    // 部分环境不支持 permissions API：先放行，让后续 searchHistory 自行决定是否可用
    permissionGranted.value = true;
    return;
  }
  permissionGranted.value = !!contains;
};

const scrollAreaWrapper = ref<HTMLElement | null>(null);
const scrollViewportEl = ref<HTMLElement | null>(null);
const loadMoreSentinel = ref<HTMLElement | null>(null);
let scrollListenerCleanup: (() => void) | null = null;
let observerCleanup: (() => void) | null = null;
let queryDebounceTimer: number | null = null;

const detachScrollListener = () => {
  scrollListenerCleanup?.();
  scrollListenerCleanup = null;
  observerCleanup?.();
  observerCleanup = null;
};

const resolveScrollViewport = () => {
  scrollViewportEl.value = (scrollAreaWrapper.value?.querySelector('[data-slot="scroll-area-viewport"]') ??
    null) as HTMLElement | null;
};

const attachScrollListener = async () => {
  detachScrollListener();
  await nextTick();
  resolveScrollViewport();
  const el = scrollViewportEl.value;
  if (!el) return;
  const handler = () => {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < LOAD_MORE_THRESHOLD_PX) void loadMore();
  };
  el.addEventListener('scroll', handler, { passive: true });
  scrollListenerCleanup = () => el.removeEventListener('scroll', handler);

  if (typeof IntersectionObserver === 'undefined') return;
  await nextTick();
  const sentinel = loadMoreSentinel.value;
  if (!sentinel) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (loading.value || loadingMore.value || !hasMore.value) return;
      void loadMore();
    },
    {
      root: el,
      rootMargin: `0px 0px ${LOAD_MORE_THRESHOLD_PX * 2}px 0px`,
      threshold: 0,
    },
  );
  observer.observe(sentinel);
  observerCleanup = () => observer.disconnect();
};

const resetPagination = async () => {
  requestSeq.value += 1;
  items.value = [];
  hasMore.value = true;
  cursorEndTime.value = Date.now();
  totalCount.value = null;
  totalCountTruncated.value = false;
  await nextTick();
  resolveScrollViewport();
  if (scrollViewportEl.value) scrollViewportEl.value.scrollTop = 0;
};

const loadTotalCountInternal = async (seq: number) => {
  loadingTotal.value = true;
  try {
    const startTime = resolveStartTime();
    const result = await searchHistory({
      text: query.value,
      startTime,
      maxResults: 5000,
    });

    if (seq !== requestSeq.value) return;

    if (!result) {
      totalCount.value = null;
      totalCountTruncated.value = false;
      return;
    }

    totalCount.value = result.length;
    totalCountTruncated.value = result.length >= 5000;
  } finally {
    if (seq === requestSeq.value) loadingTotal.value = false;
  }
};

const loadMoreInternal = async (seq: number) => {
  const startTime = resolveStartTime();
  if (cursorEndTime.value < startTime) {
    hasMore.value = false;
    return;
  }

  const result = await searchHistory({
    text: query.value,
    startTime,
    endTime: cursorEndTime.value,
    maxResults: pageSize.value,
  });

  if (seq !== requestSeq.value) return;

  if (!result) {
    errorText.value = '暂时无法读取浏览记录，请确认已开启访问授权，并刷新页面后重试。';
    hasMore.value = false;
    return;
  }

  if (!result.length) {
    hasMore.value = false;
    return;
  }

  const existed = new Set(items.value.map((item) => item.id));
  const nextItems = items.value.slice();
  for (const item of result) {
    if (existed.has(item.id)) continue;
    existed.add(item.id);
    nextItems.push(item);
  }
  items.value = nextItems;

  const oldest = result.reduce((min, item) => {
    if (typeof item.lastVisitTime !== 'number' || !Number.isFinite(item.lastVisitTime)) return min;
    return Math.min(min, item.lastVisitTime);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(oldest)) {
    hasMore.value = false;
    return;
  }

  cursorEndTime.value = oldest - 1;
  if (cursorEndTime.value < startTime) hasMore.value = false;

  if (totalCount.value !== null && !totalCountTruncated.value && items.value.length >= totalCount.value) {
    hasMore.value = false;
  }
};

const ensureScrollable = async () => {
  await nextTick();
  resolveScrollViewport();
  const el = scrollViewportEl.value;
  if (!el) return;

  for (let i = 0; i < 3; i += 1) {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    if (el.scrollHeight > el.clientHeight + LOAD_MORE_THRESHOLD_PX) return;
    const before = items.value.length;
    await loadMore();
    await nextTick();
    if (items.value.length === before) return;
  }
};

const loadData = async () => {
  loading.value = true;
  loadingMore.value = false;
  loadingTotal.value = false;
  errorText.value = null;
  await resetPagination();

  const seq = requestSeq.value;
  try {
    const totalPromise = loadTotalCountInternal(seq);
    await loadMoreInternal(seq);
    await attachScrollListener();
    await ensureScrollable();
    await totalPromise;
  } catch (error) {
    items.value = [];
    const raw = String(error);
    if (raw.toLowerCase().includes('permission')) {
      errorText.value = '读取浏览记录失败：还没开启访问授权。请点击“开启访问授权”后重试。';
    } else {
      errorText.value = '读取失败，请稍后再试。';
    }
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (!permissionGranted.value) return;
  if (loading.value || loadingMore.value || !hasMore.value) return;

  loadingMore.value = true;
  const seq = requestSeq.value;
  try {
    await loadMoreInternal(seq);
    await ensureScrollable();
  } catch (error) {
    const raw = String(error);
    if (raw.toLowerCase().includes('permission')) {
      errorText.value = '读取浏览记录失败：还没开启访问授权。请点击“开启访问授权”后重试。';
    } else {
      errorText.value = '读取失败，请稍后再试。';
    }
    hasMore.value = false;
  } finally {
    loadingMore.value = false;
  }
};

const refresh = async () => {
  await tryCheckPermission();
  if (!permissionGranted.value) return;
  await loadData();
};

const formatHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const formatRelativeTime = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const diff = Date.now() - timestamp;
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 30 * 1000) return '刚刚';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  return `${Math.max(1, Math.floor(diff / day))} 天前`;
};

const statusText = computed(() => {
  if (!permissionGranted.value) return '需要先开启授权';
  if (loading.value) return '正在加载…';
  if (errorText.value) return '加载失败';
  if (!items.value.length) {
    const keyword = query.value.trim();
    return keyword ? '暂无匹配结果' : '暂无可展示的记录';
  }
  const keyword = query.value.trim();
  const moreText = hasMore.value ? '下拉加载更多' : '已到底';
  const totalText =
    totalCount.value === null
      ? loadingTotal.value
        ? '总计计算中…'
        : '总计未知'
      : totalCountTruncated.value
        ? '≥5000'
        : String(totalCount.value);
  if (keyword) return `已加载 ${items.value.length} / ${totalText} · 关键词：${keyword} · ${moreText}`;
  return `已加载 ${items.value.length} / ${totalText} · ${moreText}`;
});

const iconTileSubtitle = (item: HistoryItem) => {
  const host = formatHost(item.url);
  if (!showTime.value) return host;
  const t = formatRelativeTime(item.lastVisitTime);
  return t ? `${host} · ${t}` : host;
};

const handleClearQuery = () => {
  query.value = '';
};

onMounted(async () => {
  await refresh();
  window.addEventListener('codex-history-permission-changed', refresh as EventListener);
});

onBeforeUnmount(() => {
  detachScrollListener();
  if (queryDebounceTimer !== null) window.clearTimeout(queryDebounceTimer);
  window.removeEventListener('codex-history-permission-changed', refresh as EventListener);
});

watch(
  () => props.data,
  async () => {
    // 配置变更后刷新
    if (!permissionGranted.value) return;
    await refresh();
  },
  { deep: true },
);

watch(query, () => {
  if (!permissionGranted.value) return;
  if (queryDebounceTimer !== null) window.clearTimeout(queryDebounceTimer);
  queryDebounceTimer = window.setTimeout(() => void loadData(), QUERY_DEBOUNCE_MS);
});
</script>

<template>
  <div class="text-foreground flex h-full min-h-0 flex-col gap-3">
    <Teleport v-if="controlsTo" :to="controlsTo">
      <Tooltip>
        <TooltipTrigger as-child>
          <span class="inline-flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
              aria-label="刷新浏览历史"
              :disabled="loading"
              @click.stop.prevent="refresh"
            >
              <RefreshCcw class="h-3.5 w-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">刷新</TooltipContent>
      </Tooltip>
    </Teleport>

    <div class="gs-no-move flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="text-foreground line-clamp-1 text-sm font-medium">最近浏览</div>
        <div class="text-muted-foreground line-clamp-1 text-xs">
          {{ !permissionGranted ? '需要先开启授权' : loading ? '正在加载…' : errorText ? '加载失败' : statusText }}
        </div>
      </div>

      <div class="relative w-[200px] max-w-[50%] shrink-0">
        <button
          v-if="query.trim()"
          type="button"
          class="text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="清除过滤条件"
          title="清除过滤条件"
          @click="handleClearQuery"
        >
          <X class="h-4 w-4" />
        </button>
        <Input
          v-model="query"
          class="border-border/60 bg-background/25 placeholder:text-muted-foreground/70 h-9 rounded-xl pr-10 text-sm focus-visible:ring-0"
          placeholder="过滤历史"
          name="historyFilter"
          autocomplete="off"
          spellcheck="false"
          aria-label="过滤历史"
          :disabled="!permissionGranted"
        />
      </div>
    </div>

    <div
      v-if="permissionChecked && !permissionGranted"
      class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
    >
      <div class="text-foreground text-sm">需要先开启访问授权</div>
      <div class="text-muted-foreground mt-1 text-xs">
        进入编辑模式后，点击卡片右上角“设置”，按提示开启授权；开启后回到卡片点“刷新”即可。
      </div>
    </div>

    <div
      v-else-if="errorText"
      class="border-border/60 bg-muted/30 rounded-xl border px-3 py-2 text-sm text-amber-700 dark:text-amber-500"
    >
      {{ errorText }}
    </div>

    <div
      v-else-if="!items.length"
      class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
    >
      {{ loading ? '正在读取浏览历史…' : `最近 ${daysRange} 天内暂无可展示的记录。` }}
    </div>

    <div v-else class="min-h-0 flex-1 overflow-hidden">
      <div ref="scrollAreaWrapper" class="h-full">
        <ScrollArea type="scroll" class="h-full pr-1">
          <TooltipProvider v-if="iconOnly" :delay-duration="120">
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
              <li v-for="item in items" :key="item.id">
                <LinkIconTile
                  :title="item.title || item.url"
                  :href="item.url"
                  :subtitle="iconTileSubtitle(item)"
                  :show-favicon="showFavicon"
                />
              </li>
            </ul>
          </TooltipProvider>

          <ul v-else class="grid w-full gap-1">
            <li v-for="item in items" :key="item.id">
              <LinkListItem
                :title="item.title || item.url"
                :href="item.url"
                :subtitle="formatHost(item.url)"
                :time="showTime ? formatRelativeTime(item.lastVisitTime) : ''"
                :show-favicon="showFavicon"
              />
            </li>
          </ul>

          <div ref="loadMoreSentinel" class="text-muted-foreground py-2 text-center text-xs">
            <span v-if="loadingMore">正在加载更多…</span>
            <span v-else-if="hasMore">继续下拉加载更多</span>
            <span v-else>没有更多了</span>
          </div>
        </ScrollArea>
      </div>
    </div>
  </div>
</template>
