<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCcw, LayoutGrid } from 'lucide-vue-next';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import LinkListItem from '@/components/widgets/common/LinkListItem.vue';
import LinkIconTile from '@/components/widgets/common/LinkIconTile.vue';
import { getRecentlyClosed, type SessionEntry } from './sessions';

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
  return Math.max(5, Math.min(50, Math.floor(raw)));
});

const showFavicon = computed(() => ((props.data as any)?.showFavicon ?? true) !== false);
const iconOnly = computed(() => ((props.data as any)?.displayMode ?? 'default') === 'icon-only');

const loading = ref(false);
const errorText = ref<string | null>(null);
const permissionChecked = ref(false);
const permissionGranted = ref(false);
const items = ref<SessionEntry[]>([]);

const perm = useOptionalPermission();
const formatHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const checkPermission = async () => {
  permissionChecked.value = true;
  if (!perm.isSupported) {
    permissionGranted.value = true;
    return true;
  }
  const ok = await perm.contains({ permissions: ['sessions'] });
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
    const result = await getRecentlyClosed(maxItems.value);
    if (!result) {
      items.value = [];
      errorText.value = '暂时无法读取最近关闭内容，请确认已开启访问授权，并刷新页面后重试。';
      return;
    }
    items.value = result.filter((item) => item.type === 'tab');
  } catch (error) {
    items.value = [];
    console.warn('[sessions] load failed', error);
    errorText.value = '读取失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
};

const statusText = computed(() => {
  if (!permissionGranted.value) return '需要先开启授权';
  if (loading.value) return '正在加载…';
  if (errorText.value) return '加载失败';
  if (!items.value.length) return '暂无记录';
  return `共 ${items.value.length} 条`;
});

const normalizeEpochMs = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined;
  // 兼容：部分环境可能返回 seconds 或 microseconds，这里做保守归一化
  if (timestamp < 1e11) return timestamp * 1000; // seconds -> ms
  if (timestamp > 1e14) return Math.floor(timestamp / 1000); // microseconds -> ms
  return timestamp; // ms
};

const formatRelativeTime = (timestamp?: number) => {
  const ts = normalizeEpochMs(timestamp);
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 30 * 1000) return '刚刚';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  return `${Math.max(1, Math.floor(diff / day))} 天前`;
};

const iconTileSubtitle = (url: string, lastModified?: number) => {
  const host = formatHost(url);
  const t = lastModified ? formatRelativeTime(lastModified) : '';
  return t ? `${host} · ${t}` : host;
};

const handlePermissionChanged = () => {
  void refresh();
};

watch(
  () => props.data,
  () => {
    void refresh();
  },
  { deep: true },
);

onMounted(() => {
  void refresh();
  window.addEventListener('codex-sessions-permission-changed', handlePermissionChanged as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('codex-sessions-permission-changed', handlePermissionChanged as EventListener);
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
            aria-label="刷新最近关闭"
            @click.stop.prevent="refresh"
          >
            <RefreshCcw class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">刷新</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </Teleport>

  <div class="flex h-full min-h-0 flex-col gap-3">
    <div class="gs-no-move flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="text-foreground line-clamp-1 text-sm font-medium">最近关闭</div>
        <div class="text-muted-foreground line-clamp-1 text-xs">
          {{ statusText }}
        </div>
      </div>
      <div class="text-muted-foreground text-xs">仅标签页</div>
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
      {{ loading ? '正在读取最近关闭…' : '暂无可恢复的会话记录。' }}
    </div>

    <div v-else class="min-h-0 flex-1 overflow-hidden">
      <ScrollArea type="scroll" class="h-full pr-1">
        <TooltipProvider v-if="iconOnly" :delay-duration="120">
          <ul class="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
            <li v-for="item in items" :key="item.id">
              <LinkIconTile
                v-if="item.url"
                :title="item.title || item.url"
                :href="item.url"
                :subtitle="iconTileSubtitle(item.url, item.lastModified)"
                :show-favicon="showFavicon"
              />

              <div v-else class="text-muted-foreground flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm">
                <LayoutGrid class="h-4 w-4" />
                <span class="line-clamp-1">{{ item.title }}</span>
              </div>
            </li>
          </ul>
        </TooltipProvider>

        <ul v-else class="grid gap-1">
          <li v-for="item in items" :key="item.id">
            <LinkListItem
              v-if="item.url"
              :title="item.title || item.url"
              :href="item.url"
              :subtitle="formatHost(item.url)"
              :time="item.lastModified ? formatRelativeTime(item.lastModified) : ''"
              :show-favicon="showFavicon"
            />

            <div v-else class="text-muted-foreground flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm">
              <LayoutGrid class="h-4 w-4" />
              <span class="line-clamp-1">{{ item.title }}</span>
            </div>
          </li>
        </ul>
      </ScrollArea>
    </div>
  </div>
</template>
