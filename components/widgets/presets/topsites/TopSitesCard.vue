<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCcw, Globe, X } from 'lucide-vue-next';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import LinkListItem from '@/components/widgets/common/LinkListItem.vue';
import LinkIconTile from '@/components/widgets/common/LinkIconTile.vue';
import { getTopSites, type TopSiteItem } from './topSites';

const MAX_ITEMS_DEFAULT = 12;

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
  return Math.max(4, Math.min(60, Math.floor(raw)));
});

const showFavicon = computed(() => ((props.data as any)?.showFavicon ?? true) !== false);
const iconOnly = computed(() => ((props.data as any)?.displayMode ?? 'default') === 'icon-only');

const loading = ref(false);
const errorText = ref<string | null>(null);
const permissionChecked = ref(false);
const permissionGranted = ref(false);
const items = ref<TopSiteItem[]>([]);

const query = ref('');

const perm = useOptionalPermission();

const checkPermission = async () => {
  permissionChecked.value = true;
  if (!perm.isSupported) {
    permissionGranted.value = true;
    return true;
  }
  const ok = await perm.contains({ permissions: ['topSites'] });
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
    const result = await getTopSites();
    if (!result) {
      items.value = [];
      errorText.value = '暂时无法读取常访问站点，请确认已开启访问授权，并刷新页面后重试。';
      return;
    }
    items.value = result;
  } catch (error) {
    items.value = [];
    console.warn('[topsites] load failed', error);
    errorText.value = '读取失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
};

const filteredAll = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((item) => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q));
});

const visibleItems = computed(() => filteredAll.value.slice(0, maxItems.value));

const statusText = computed(() => {
  if (!permissionGranted.value) return '需要先开启授权';
  if (loading.value) return '正在加载…';
  if (errorText.value) return '加载失败';
  const total = items.value.length;
  const filteredTotal = filteredAll.value.length;
  const visible = visibleItems.value.length;
  const keyword = query.value.trim();
  if (!total) return keyword ? '暂无匹配结果' : '暂无可展示的站点';
  if (keyword) return `显示 ${visible} / ${filteredTotal} · 共 ${total} 条`;
  return `显示 ${visible} / ${total} 条`;
});

const handleClearQuery = () => {
  query.value = '';
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
  window.addEventListener('codex-topsites-permission-changed', handlePermissionChanged as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('codex-topsites-permission-changed', handlePermissionChanged as EventListener);
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
            aria-label="刷新常访问站点"
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
        <div class="text-foreground line-clamp-1 text-sm font-medium">常访问站点</div>
        <div class="text-muted-foreground line-clamp-1 text-xs">
          {{ statusText }}
        </div>
      </div>

      <div class="relative w-[200px] max-w-[55%] shrink-0">
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
          placeholder="过滤站点"
          name="topSitesFilter"
          autocomplete="off"
          spellcheck="false"
          aria-label="过滤站点"
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
      v-else-if="!visibleItems.length"
      class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
    >
      {{ loading ? '正在读取常访问站点…' : '暂无可展示的站点。' }}
    </div>

    <div v-else class="min-h-0 flex-1 overflow-hidden">
      <ScrollArea type="scroll" class="h-full pr-1">
        <TooltipProvider v-if="iconOnly" :delay-duration="120">
          <ul class="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
            <li v-for="item in visibleItems" :key="item.id">
              <LinkIconTile :title="item.title" :href="item.url" :subtitle="item.url" :show-favicon="showFavicon">
                <template #fallback>
                  <Globe class="h-5 w-5" />
                </template>
              </LinkIconTile>
            </li>
          </ul>
        </TooltipProvider>

        <ul v-else class="grid gap-1">
          <li v-for="item in visibleItems" :key="item.id" class="hover:bg-muted/40 rounded-xl transition">
            <LinkListItem :title="item.title" :href="item.url" :subtitle="item.url" :show-favicon="showFavicon">
              <template #fallback>
                <Globe class="h-4 w-4" />
              </template>
              <template #after>
                <Globe class="text-muted-foreground h-4 w-4 shrink-0" />
              </template>
            </LinkListItem>
          </li>
        </ul>
      </ScrollArea>
    </div>
  </div>
</template>
