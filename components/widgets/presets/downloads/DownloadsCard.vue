<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RefreshCcw, Pause, Play, X, FolderOpen, FileDown, Ellipsis } from 'lucide-vue-next';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import { buildExtensionFaviconUrl, canUseExtensionFavicon } from '@/utils/extensionFavicon';
import {
  cancelDownload,
  openDownload,
  pauseDownload,
  resumeDownload,
  searchDownloads,
  showDownloadInFolder,
  type DownloadItem,
  type DownloadStateFilter,
} from './downloads';

const MAX_ITEMS_DEFAULT = 20;

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

const maxItems = computed(() => {
  const raw = Number((props.data as any)?.maxItems);
  if (!Number.isFinite(raw) || raw <= 0) return MAX_ITEMS_DEFAULT;
  return Math.max(5, Math.min(200, Math.floor(raw)));
});

const state = computed<DownloadStateFilter>(() => {
  const raw = String((props.data as any)?.state ?? 'in_progress');
  if (raw === 'all' || raw === 'in_progress' || raw === 'complete' || raw === 'interrupted') return raw;
  return 'in_progress';
});

const autoRefreshSeconds = computed(() => {
  const raw = Number((props.data as any)?.autoRefreshSeconds);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(0, Math.min(60, Math.floor(raw)));
});

const showUrl = computed(() => ((props.data as any)?.showUrl ?? true) !== false);

const loading = ref(false);
const errorText = ref<string | null>(null);
const permissionChecked = ref(false);
const permissionGranted = ref(false);
const items = ref<DownloadItem[]>([]);

const perm = useOptionalPermission();

const canUseChromeFavicon = computed(() => canUseExtensionFavicon());
const faviconErrorSet = ref<Set<string>>(new Set());
const buildFaviconUrl = (url: string) => buildExtensionFaviconUrl(url, 32) ?? '';
const handleFaviconError = (url: string) => {
  faviconErrorSet.value.add(url);
};
const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

const checkPermission = async () => {
  permissionChecked.value = true;
  if (!perm.isSupported) {
    permissionGranted.value = true;
    return true;
  }
  const ok = await perm.contains({ permissions: ['downloads'] });
  permissionGranted.value = ok;
  return ok;
};

const refresh = async () => {
  loading.value = true;
  errorText.value = null;
  try {
    const ok = await checkPermission();
    if (!ok) {
      items.value = [];
      return;
    }
    const result = await searchDownloads({ limit: maxItems.value, state: state.value });
    if (!result) {
      items.value = [];
      errorText.value = '暂时无法读取下载列表，请确认已开启访问授权，并刷新页面后重试。';
      return;
    }
    items.value = result;
    faviconErrorSet.value = new Set();
  } catch (error) {
    items.value = [];
    console.warn('[downloads] load failed', error);
    errorText.value = '读取失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
};

const statusText = computed(() => {
  if (!permissionGranted.value) return '需要先开启授权';
  if (loading.value) return '正在加载…';
  if (errorText.value) return '加载失败';
  if (!items.value.length) return '暂无任务';
  return `共 ${items.value.length} 条`;
});

const formatBytes = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : i <= 2 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[i]}`;
};

const progressText = (item: DownloadItem) => {
  const received = item.bytesReceived ?? 0;
  const total = item.totalBytes ?? 0;
  if (!total || total <= 0) return '';
  const pct = Math.max(0, Math.min(100, Math.floor((received / total) * 100)));
  return `${pct}%（${formatBytes(received)} / ${formatBytes(total)}）`;
};

const handleAction = async (action: () => Promise<boolean>) => {
  try {
    await action();
  } catch {
    // 忽略：后续 refresh 兜底
  } finally {
    void refresh();
  }
};

const containerEl = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const compactActions = computed(() => containerWidth.value > 0 && containerWidth.value < 360);
let containerResizeObserver: ResizeObserver | null = null;

let refreshTimer: number | null = null;
const setupAutoRefresh = () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const seconds = autoRefreshSeconds.value;
  if (!seconds || seconds <= 0) return;
  refreshTimer = window.setInterval(() => {
    if (!permissionGranted.value || loading.value) return;
    void refresh();
  }, seconds * 1000);
};

watch(
  () => props.data,
  () => {
    void refresh();
    setupAutoRefresh();
  },
  { deep: true },
);

const handlePermissionChanged = () => {
  void refresh();
};

onMounted(() => {
  void refresh();
  setupAutoRefresh();
  containerResizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    const width = entry?.contentRect?.width ?? 0;
    containerWidth.value = Number.isFinite(width) ? Math.floor(width) : 0;
  });
  if (containerEl.value) containerResizeObserver.observe(containerEl.value);
  window.addEventListener('codex-downloads-permission-changed', handlePermissionChanged as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('codex-downloads-permission-changed', handlePermissionChanged as EventListener);
  if (refreshTimer) window.clearInterval(refreshTimer);
  containerResizeObserver?.disconnect();
  containerResizeObserver = null;
});
</script>

<template>
  <Teleport v-if="controlsTo" :to="controlsTo">
    <TooltipProvider :delay-duration="120">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
            aria-label="刷新下载任务"
            @click.stop.prevent="refresh"
          >
            <RefreshCcw class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">刷新</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </Teleport>

  <div ref="containerEl" class="space-y-3">
    <div class="gs-no-move flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="text-foreground line-clamp-1 text-sm font-medium">下载任务</div>
        <div class="text-muted-foreground line-clamp-1 text-xs">{{ statusText }}</div>
      </div>
      <div class="text-muted-foreground text-xs">
        {{
          state === 'in_progress'
            ? '进行中'
            : state === 'complete'
              ? '已完成'
              : state === 'interrupted'
                ? '失败/中断'
                : '全部'
        }}
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
      {{ loading ? '正在读取下载任务…' : '暂无可展示的下载任务。' }}
    </div>

    <ul v-else class="grid gap-1">
      <li
        v-for="item in items"
        :key="item.id"
        class="hover:bg-muted/40 rounded-xl border border-transparent px-2 py-2 transition"
      >
        <div class="flex items-start gap-3">
          <div
            class="bg-muted/60 text-muted-foreground grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg"
          >
            <img
              v-if="showUrl && item.url && isHttpUrl(item.url) && canUseChromeFavicon && !faviconErrorSet.has(item.url)"
              :src="buildFaviconUrl(item.url)"
              class="h-5 w-5"
              alt=""
              loading="lazy"
              @error="handleFaviconError(item.url)"
            />
            <FileDown v-else class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-foreground line-clamp-1 text-sm font-medium break-all" :title="item.filename">
                  {{ item.filename }}
                </div>
                <div class="text-muted-foreground line-clamp-1 text-xs">
                  {{
                    item.state === 'in_progress'
                      ? item.paused
                        ? '已暂停'
                        : '下载中'
                      : item.state === 'complete'
                        ? '已完成'
                        : item.state === 'interrupted'
                          ? '失败/中断'
                          : item.state || '未知'
                  }}
                  <span v-if="progressText(item)"> · {{ progressText(item) }}</span>
                </div>
                <div
                  v-if="showUrl && item.url"
                  class="text-muted-foreground/80 line-clamp-1 text-[11px]"
                  :title="item.url"
                >
                  {{ item.url }}
                </div>
              </div>

              <div class="ml-auto flex shrink-0 items-center gap-1">
                <template v-if="!compactActions">
                  <Button
                    v-if="item.state === 'in_progress' && !item.paused"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-foreground rounded-xl"
                    aria-label="暂停"
                    title="暂停"
                    @click.stop.prevent="handleAction(() => pauseDownload(item.id))"
                  >
                    <Pause class="h-4 w-4" />
                  </Button>
                  <Button
                    v-if="item.state === 'in_progress' && item.paused"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-foreground rounded-xl"
                    aria-label="继续"
                    title="继续"
                    @click.stop.prevent="handleAction(() => resumeDownload(item.id))"
                  >
                    <Play class="h-4 w-4" />
                  </Button>
                  <Button
                    v-if="item.state === 'in_progress'"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-foreground rounded-xl"
                    aria-label="取消"
                    title="取消"
                    @click.stop.prevent="handleAction(() => cancelDownload(item.id))"
                  >
                    <X class="h-4 w-4" />
                  </Button>
                  <Button
                    v-if="item.state === 'complete'"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-foreground rounded-xl"
                    aria-label="打开文件"
                    title="打开文件"
                    @click.stop.prevent="handleAction(() => openDownload(item.id))"
                  >
                    <FileDown class="h-4 w-4" />
                  </Button>
                  <Button
                    v-if="item.state === 'complete' || item.state === 'in_progress' || item.state === 'interrupted'"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-foreground rounded-xl"
                    aria-label="在文件夹中显示"
                    title="在文件夹中显示"
                    @click.stop.prevent="handleAction(() => showDownloadInFolder(item.id))"
                  >
                    <FolderOpen class="h-4 w-4" />
                  </Button>
                </template>

                <DropdownMenu v-else>
                  <DropdownMenuTrigger as-child>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      class="text-muted-foreground hover:text-foreground rounded-xl"
                      aria-label="下载任务操作"
                      title="下载任务操作"
                      @click.stop
                    >
                      <Ellipsis class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    side="bottom"
                    :side-offset="8"
                    class="border-border bg-popover/98 text-popover-foreground min-w-[160px] rounded-2xl border shadow-2xl"
                  >
                    <DropdownMenuItem
                      v-if="item.state === 'in_progress' && !item.paused"
                      class="gap-2"
                      @click="handleAction(() => pauseDownload(item.id))"
                    >
                      <Pause class="h-4 w-4" /> 暂停
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="item.state === 'in_progress' && item.paused"
                      class="gap-2"
                      @click="handleAction(() => resumeDownload(item.id))"
                    >
                      <Play class="h-4 w-4" /> 继续
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="item.state === 'in_progress'"
                      class="gap-2"
                      @click="handleAction(() => cancelDownload(item.id))"
                    >
                      <X class="h-4 w-4" /> 取消
                    </DropdownMenuItem>

                    <DropdownMenuSeparator
                      v-if="item.state === 'complete' || item.state === 'in_progress' || item.state === 'interrupted'"
                    />

                    <DropdownMenuItem
                      v-if="item.state === 'complete'"
                      class="gap-2"
                      @click="handleAction(() => openDownload(item.id))"
                    >
                      <FileDown class="h-4 w-4" /> 打开文件
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="item.state === 'complete' || item.state === 'in_progress' || item.state === 'interrupted'"
                      class="gap-2"
                      @click="handleAction(() => showDownloadInFolder(item.id))"
                    >
                      <FolderOpen class="h-4 w-4" /> 在文件夹中显示
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
