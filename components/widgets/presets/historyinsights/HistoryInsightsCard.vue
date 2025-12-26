<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCcw } from 'lucide-vue-next';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import LinkListItem from '@/components/widgets/common/LinkListItem.vue';
import { buildHistoryInsights, type DomainInsight } from './insights';

const DAYS_RANGE_DEFAULT = 7;
const TOP_DOMAINS_DEFAULT = 10;

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

const daysRange = computed(() => {
  const raw = Number((props.data as any)?.daysRange);
  if (!Number.isFinite(raw) || raw <= 0) return DAYS_RANGE_DEFAULT;
  return Math.max(1, Math.min(365, Math.floor(raw)));
});

const topDomains = computed(() => {
  const raw = Number((props.data as any)?.topDomains);
  if (!Number.isFinite(raw) || raw <= 0) return TOP_DOMAINS_DEFAULT;
  return Math.max(3, Math.min(50, Math.floor(raw)));
});

const showFavicon = computed(() => ((props.data as any)?.showFavicon ?? true) !== false);

const perm = useOptionalPermission();
const permissionChecked = ref(false);
const permissionGranted = ref(false);

const loading = ref(false);
const errorText = ref<string | null>(null);
const updatedAt = ref<number | null>(null);

const uniquePages = ref(0);
const uniqueDomains = ref(0);
const domains = ref<DomainInsight[]>([]);

const checkPermission = async () => {
  permissionChecked.value = true;
  if (!perm.isSupported) {
    permissionGranted.value = true;
    return true;
  }
  const ok = await perm.contains({ permissions: ['history'] });
  permissionGranted.value = ok;
  return ok;
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

const loadData = async () => {
  loading.value = true;
  errorText.value = null;
  try {
    const ok = await checkPermission();
    if (!ok) {
      uniquePages.value = 0;
      uniqueDomains.value = 0;
      domains.value = [];
      return;
    }

    const result = await buildHistoryInsights({ daysRange: daysRange.value, topDomains: topDomains.value });
    if (!result) {
      uniquePages.value = 0;
      uniqueDomains.value = 0;
      domains.value = [];
      errorText.value = '暂时无法读取浏览记录，请确认已开启访问授权，并刷新页面后重试。';
      return;
    }

    uniquePages.value = result.uniquePages;
    uniqueDomains.value = result.uniqueDomains;
    domains.value = result.domains;
    updatedAt.value = Date.now();
  } catch (error) {
    uniquePages.value = 0;
    uniqueDomains.value = 0;
    domains.value = [];
    console.warn('[history-insights] load failed', error);
    errorText.value = '加载失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const percentOf = (count: number) => {
  const total = uniquePages.value;
  if (!total || total <= 0) return 0;
  return clampPercent((count / total) * 100);
};

const statusText = computed(() => {
  if (!permissionGranted.value) return '需要先开启授权';
  if (loading.value) return '正在加载…';
  if (errorText.value) return '加载失败';
  if (!domains.value.length) return '暂无可展示的数据';
  return `近 ${daysRange.value} 天 · 常访问网站 ${domains.value.length}`;
});

const updatedText = computed(() => {
  if (!updatedAt.value) return '';
  return `更新于 ${formatRelativeTime(updatedAt.value)}`;
});

const handlePermissionChanged = () => {
  void loadData();
};

watch(
  () => props.data,
  () => {
    void loadData();
  },
  { deep: true },
);

onMounted(() => {
  void loadData();
  window.addEventListener('codex-history-permission-changed', handlePermissionChanged as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('codex-history-permission-changed', handlePermissionChanged as EventListener);
});
</script>

<template>
  <Teleport v-if="controlsTo" :to="controlsTo">
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
            aria-label="刷新历史洞察"
            :disabled="loading"
            @click.stop.prevent="loadData"
          >
            <RefreshCcw class="h-3.5 w-3.5" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">刷新</TooltipContent>
    </Tooltip>
  </Teleport>

  <div class="text-foreground flex h-full min-h-0 flex-col gap-3">
    <div class="gs-no-move flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="text-foreground line-clamp-1 text-sm font-medium">历史洞察</div>
        <div class="text-muted-foreground line-clamp-1 text-xs">
          {{ statusText }}
        </div>
      </div>
      <div class="text-muted-foreground shrink-0 text-xs">
        {{ updatedText }}
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
      v-else-if="!domains.length"
      class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
    >
      {{ loading ? '正在计算洞察…' : `最近 ${daysRange} 天内暂无可展示的记录。` }}
    </div>

    <div v-else class="min-h-0 flex-1 overflow-hidden">
      <ScrollArea type="scroll" class="h-full pr-1">
        <div class="text-muted-foreground mb-1 text-xs">常访问网站排行（按去重页面数）</div>
        <ul class="grid gap-1">
          <li v-for="d in domains" :key="d.id">
            <LinkListItem
              :title="d.host"
              :href="d.href"
              :time="d.lastVisitTime ? formatRelativeTime(d.lastVisitTime) : ''"
              :show-favicon="showFavicon"
            >
              <template #subtitle>
                <div class="mt-0.5 grid gap-1">
                  <div class="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                    <span class="truncate">访问页面（去重）：{{ d.uniquePages }}</span>
                    <span class="shrink-0 tabular-nums">{{ percentOf(d.uniquePages) }}%</span>
                  </div>
                  <div class="bg-muted/45 h-1.5 w-full overflow-hidden rounded-full">
                    <div class="bg-primary/80 h-full rounded-full" :style="{ width: `${percentOf(d.uniquePages)}%` }" />
                  </div>
                </div>
              </template>
            </LinkListItem>
          </li>
        </ul>
      </ScrollArea>
    </div>
  </div>
</template>
