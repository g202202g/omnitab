<script lang="ts" setup>
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PageInfo } from '@/composables/usePageStore';
import { usePageStore } from '@/composables/usePageStore';
import { Plus, Pencil, Eye, ArrowDownUp, Settings } from 'lucide-vue-next';
import { useWidgetStore, type WidgetLayout } from '@/composables/useWidgetStore';
import { useLog } from '@/composables/useLog';
import { useOnboardingGuide } from '@/composables/useOnboardingGuide';
import WidgetGrid from '@/components/layout/WidgetGrid.vue';
import PageFormDialog from '@/components/layout/PageFormDialog.vue';
import { resolveWidgetDefinition, DEFAULT_WIDGET_TYPE } from '@/components/widgets/registry';
import type { WidgetType } from '@/components/widgets/types';
import AddWidgetDialog from '@/components/widgets/AddWidgetDialog.vue';
import PageBackground from '@/components/layout/PageBackground.vue';
import DynamicIcon from '@/components/ui/icon/DynamicIcon.vue';
import { consumePendingWebCardPick } from '@/utils/domPickerPending';
import { browser } from 'wxt/browser';

const props = defineProps<{
  pageId?: string;
}>();

const store = usePageStore();
const widgetStore = useWidgetStore();
const logger = useLog('page-board');
const onboardingGuide = useOnboardingGuide();
const router = useRouter();

const allowEmptyPersist = ref(false);
const widgetInitialized = ref(false);

const currentPage = computed<PageInfo | null>(() => {
  if (!store.pages.value.length) return null;
  const matched = store.pages.value.find((page) => page.id === props.pageId);
  return matched ?? store.pages.value[0];
});

const pageWidgets = computed<WidgetLayout[]>(() => {
  if (!widgetStore.ready.value || !currentPage.value || !widgetInitialized.value) return [];
  return widgetStore.getWidgets(currentPage.value.id);
});

const addDialogOpen = ref(false);
const addDialogType = ref<WidgetType>(DEFAULT_WIDGET_TYPE);
const addDialogData = ref<Record<string, unknown> | undefined>(undefined);
const addDialogTitle = ref<string>('');
const editMode = ref(false);

const resetAddDialogPrefill = () => {
  addDialogType.value = DEFAULT_WIDGET_TYPE;
  addDialogData.value = undefined;
  addDialogTitle.value = '';
};

let domPickListenerActive = false;
const domPickListener = (message: any) => {
  if (message?.type !== 'newtab:dom-pick-ready') return;
  void tryOpenAddDialogFromPending();
};

const enableDomPickListener = () => {
  if (domPickListenerActive) return;
  domPickListenerActive = true;
  browser?.runtime?.onMessage?.addListener(domPickListener);
};

const disableDomPickListener = () => {
  if (!domPickListenerActive) return;
  domPickListenerActive = false;
  try {
    browser?.runtime?.onMessage?.removeListener?.(domPickListener);
  } catch {
    // ignore
  }
};

const handleAddDialogClose = () => {
  addDialogOpen.value = false;
  // 避免 DOM 选取的预填数据残留到下一次“手动添加卡片”。
  resetAddDialogPrefill();
};

const loadPrefillFromPendingPick = async () => {
  const pending = await consumePendingWebCardPick({ maxAgeMs: 90_000 });
  if (!pending) return null;
  return {
    type: 'iframe' as WidgetType,
    title: pending.title ?? '',
    data: {
      url: pending.url,
      selector: pending.selector,
    } satisfies Record<string, unknown>,
  };
};

const tryOpenAddDialogFromPending = async () => {
  const prefill = await loadPrefillFromPendingPick();
  if (!prefill) return false;
  addDialogType.value = prefill.type;
  addDialogData.value = prefill.data;
  addDialogTitle.value = prefill.title;
  addDialogOpen.value = true;
  return true;
};

const transferDialogOpen = ref(false);
const transferMode = ref<'move' | 'copy'>('copy');
const transferWidgetId = ref<string>('');
const transferTargetPageId = ref<string>('');

const transferCandidates = computed(() => {
  const currentId = currentPage.value?.id ?? '';
  // 复制：允许选择当前页面（等价于“生成一份副本”）
  if (transferMode.value === 'copy') return store.pages.value;
  // 移动：不允许选择当前页面
  return store.pages.value.filter((page) => page.id !== currentId);
});

const transferWidget = computed(() => pageWidgets.value.find((item) => item.id === transferWidgetId.value) ?? null);

const openTransferDialog = (payload: { id: string; mode: 'move' | 'copy' }) => {
  transferMode.value = payload.mode;
  transferWidgetId.value = payload.id;
  const currentId = currentPage.value?.id ?? '';
  transferTargetPageId.value =
    payload.mode === 'copy' && currentId
      ? currentId
      : (transferCandidates.value[0]?.id ?? '');
  transferDialogOpen.value = true;
};

const confirmTransfer = () => {
  const fromPageId = currentPage.value?.id ?? '';
  const toPageId = transferTargetPageId.value;
  const widgetId = transferWidgetId.value;
  if (!fromPageId || !widgetId || !toPageId) return;
  if (transferMode.value === 'copy') {
    // 允许复制到当前页面：相当于在同一页面生成一份副本
    widgetStore.copyWidgetToPage(fromPageId, toPageId, widgetId);
  } else {
    if (fromPageId === toPageId) return;
    widgetStore.moveWidgetToPage(fromPageId, toPageId, widgetId);
  }
  transferDialogOpen.value = false;
};

const pageFormDialogOpen = ref(false);
const editingPage = ref<PageInfo | null>(null);

const openEditPage = () => {
  if (!currentPage.value) return;
  editingPage.value = currentPage.value;
  pageFormDialogOpen.value = true;
};

const handleSavePage = (payload: { id: string; name: string; icon?: string; bgValue?: string; bgMask?: number }) => {
  store.renamePage(payload);
};

type WidgetGridExpose = InstanceType<typeof WidgetGrid> & {
  reflow?: () => Promise<void>;
};

const gridRef = ref<WidgetGridExpose | null>(null);

const handleReflowGrid = async () => {
  await gridRef.value?.reflow?.();
};

const handleLayoutChange = (layouts: WidgetLayout[]) => {
  if (!currentPage.value || !widgetStore.ready.value) return;
  const prev = widgetStore.getWidgets(currentPage.value.id);
  // 避免非用户操作时空网格覆盖已有数据，除非明确允许
  if (!layouts.length && prev.length && !allowEmptyPersist.value) {
    logger.warn('skip persist empty layout (keep previous)', {
      pageId: currentPage.value.id,
      prev: prev.length,
    });
    return;
  }
  allowEmptyPersist.value = false;
  widgetStore.replacePage(currentPage.value.id, layouts);
  logger.info('grid change -> persist', {
    pageId: currentPage.value.id,
    count: layouts.length,
  });
};

const GRID_COLUMNS = 12;

const resolveTargetPageId = (pageId?: string) => {
  const trimmed = typeof pageId === 'string' ? pageId.trim() : '';
  if (trimmed && store.pages.value.some((p) => p.id === trimmed)) return trimmed;
  return currentPage.value?.id ?? store.pages.value[0]?.id ?? '';
};

const handleAddCardToPage = (
  pageId: string,
  payload?: {
    type?: WidgetType;
    name?: string;
    icon?: string;
    description?: string;
    showBorder?: boolean;
    showTitle?: boolean;
    showBackground?: boolean;
    w?: number;
    h?: number;
    data?: Record<string, unknown>;
  },
) => {
  if (!pageId || !widgetStore.ready.value || !widgetInitialized.value) return null;
  const type = payload?.type ?? DEFAULT_WIDGET_TYPE;
  const def = resolveWidgetDefinition(type);
  const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const int = Math.floor(num);
    return Math.max(min, Math.min(max, int));
  };
  const minW = def.defaults.minW ?? 1;
  const maxW = Math.min(GRID_COLUMNS, def.defaults.maxW ?? GRID_COLUMNS);
  const minH = def.defaults.minH ?? 1;
  const maxH = def.defaults.maxH ?? 999;
  const resolvedW = clampInt(payload?.w, def.defaults.w, minW, maxW);
  const resolvedH = clampInt(payload?.h, def.defaults.h, minH, maxH);
  const existing = widgetStore.getWidgets(pageId);
  const heights = Array(GRID_COLUMNS).fill(0);

  // 计算每列当前的高度，用于找到最平衡的落点
  existing.forEach((item) => {
    const start = Math.max(0, Math.min(GRID_COLUMNS - 1, item.x));
    const end = Math.max(start, Math.min(GRID_COLUMNS, item.x + item.w));
    const bottom = Math.max(0, item.y + item.h);
    for (let col = start; col < end; col += 1) {
      heights[col] = Math.max(heights[col], bottom);
    }
  });

  const targetWidth = resolvedW;
  let bestX = 0;
  let bestY = Number.POSITIVE_INFINITY;

  // 从左到右寻找一段连续列，使其最高点尽可能低，避免与现有卡片重叠
  for (let start = 0; start <= GRID_COLUMNS - targetWidth; start += 1) {
    const sliceMax = Math.max(...heights.slice(start, start + targetWidth));
    if (sliceMax < bestY) {
      bestY = sliceMax;
      bestX = start;
    }
  }

  const widget = widgetStore.addWidget(pageId, {
    w: resolvedW,
    h: resolvedH,
    minW: def.defaults.minW,
    minH: def.defaults.minH,
    maxW: def.defaults.maxW,
    maxH: def.defaults.maxH,
    x: bestX,
    y: Number.isFinite(bestY) ? bestY : 0,
    type,
    name: typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined,
    icon: typeof payload?.icon === 'string' && payload.icon.trim() ? payload.icon.trim() : undefined,
    description:
      typeof payload?.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined,
    showBorder: typeof payload?.showBorder === 'boolean' ? payload.showBorder : (def.defaults.showBorder ?? true),
    showTitle: typeof payload?.showTitle === 'boolean' ? payload.showTitle : (def.defaults.showTitle ?? true),
    showBackground:
      typeof payload?.showBackground === 'boolean' ? payload.showBackground : (def.defaults.showBackground ?? true),
    data: payload?.data,
  });
  logger.info('add widget', {
    pageId,
    widgetId: widget?.id,
    type,
    name: payload?.name?.trim(),
    size: { w: resolvedW, h: resolvedH },
    position: { x: bestX, y: bestY },
  });
  return widget;
};

const handleConfirmAdd = (payload: {
  pageId?: string;
  type: WidgetType;
  name?: string;
  icon?: string;
  description?: string;
  showBorder?: boolean;
  showTitle?: boolean;
  showBackground?: boolean;
  w?: number;
  h?: number;
  data?: Record<string, unknown>;
}) => {
  const targetPageId = resolveTargetPageId(payload.pageId);
  if (!targetPageId) return;
  const widget = handleAddCardToPage(targetPageId, payload);
  if (widget) {
    logger.info('add widget from dialog', { pageId: targetPageId, widgetId: widget.id, type: payload.type });
    if (targetPageId !== (currentPage.value?.id ?? '')) {
      void router.push({ name: 'page', params: { pageId: targetPageId } });
    }
    addDialogOpen.value = false;
    resetAddDialogPrefill();
  }
};

const handleRemoveCard = (id: string) => {
  if (!currentPage.value) return;
  allowEmptyPersist.value = true; // 允许删到空
  widgetStore.removeWidget(currentPage.value.id, id);
  logger.info('remove widget', { pageId: currentPage.value.id, widgetId: id });
};

onMounted(async () => {
  if (!store.ready.value) {
    await store.init();
  }
  await widgetStore.init();
  widgetInitialized.value = true;
  logger.info('page board mounted', {
    pageId: currentPage.value?.id,
    widgets: pageWidgets.value.length,
  });

  await tryOpenAddDialogFromPending();
  void onboardingGuide.startIfNeeded();
});

onActivated(() => {
  enableDomPickListener();
});

onDeactivated(() => {
  // KeepAlive 场景：组件不会 unmount，需要在 deactivated 时清理监听器。
  disableDomPickListener();
  // 防止在其它页面触发 dom-pick 时把弹窗状态写到缓存实例里，之后切回该页又“复活”。
  addDialogOpen.value = false;
  resetAddDialogPrefill();
});
</script>

<template>
  <section class="relative min-h-screen w-full overflow-hidden">
    <PageBackground :page="currentPage" />

    <TooltipProvider :delay-duration="120">
	      <div class="pointer-events-none fixed top-6 right-6 z-40 flex flex-col items-end gap-3">
	        <div
	          data-tour="quick-tools"
	          class="border-border/35 bg-background/30 hover:border-border/55 hover:bg-background/45 pointer-events-auto flex items-center gap-1 rounded-2xl border p-1 opacity-85 shadow-none backdrop-blur-sm transition-all hover:opacity-100 hover:shadow-sm"
	        >
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                data-tour="edit-toggle"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-foreground rounded-xl"
                :class="editMode ? 'bg-accent/40 text-foreground hover:bg-accent/50' : ''"
                :aria-pressed="editMode"
                aria-label="切换编辑模式"
                @click="editMode = !editMode"
              >
                <component :is="editMode ? Eye : Pencil" class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">切换编辑模式</TooltipContent>
          </Tooltip>

          <Tooltip v-if="editMode">
            <TooltipTrigger as-child>
              <span class="inline-flex">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground hover:text-foreground rounded-xl"
                  aria-label="编辑页面"
                  :disabled="!currentPage"
                  @click="openEditPage"
                >
                  <Settings class="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">编辑页面</TooltipContent>
          </Tooltip>

          <Tooltip v-if="editMode">
            <TooltipTrigger as-child>
              <span class="inline-flex">
                <Button
                  data-tour="reflow"
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground hover:text-foreground rounded-xl"
                  aria-label="重排卡片布局"
                  :disabled="!pageWidgets.length"
                  @click="handleReflowGrid"
                >
                  <ArrowDownUp class="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">重排卡片布局</TooltipContent>
          </Tooltip>

          <div class="bg-border/40 mx-0.5 h-5 w-px" aria-hidden="true" />

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                data-tour="add-card"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-foreground rounded-xl"
                aria-label="添加卡片"
                @click="addDialogOpen = true"
              >
                <Plus class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">添加卡片</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>

    <div class="relative z-10 flex min-h-[100VH] w-full flex-col">
      <div data-tour="grid" class="min-h-0 flex-1">
        <WidgetGrid
          ref="gridRef"
          :page-id="currentPage?.id"
          :widgets="pageWidgets"
          :edit-mode="editMode"
          :max-height="'calc(100vh)'"
          class="h-full py-8 pr-10 pl-[100px]"
          @layout-change="handleLayoutChange"
          @remove="handleRemoveCard"
          @transfer="openTransferDialog"
        />
      </div>
    </div>

    <Dialog v-model:open="transferDialogOpen">
      <DialogContent class="border-border bg-popover text-popover-foreground border shadow-2xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle class="text-base font-semibold">
            {{ transferMode === 'copy' ? '复制卡片到页面' : '移动卡片到页面' }}
          </DialogTitle>
          <DialogDescription class="text-muted-foreground text-sm">
            <span v-if="transferWidget">
              当前卡片：{{ transferWidget.name || resolveWidgetDefinition(transferWidget.type).title }}
            </span>
            <span v-else> 请选择目标页面。 </span>
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-3">
          <div class="grid gap-2">
            <div class="text-foreground text-sm font-medium">目标页面</div>
            <Select v-model="transferTargetPageId" :disabled="!transferCandidates.length">
              <SelectTrigger class="h-10">
                <SelectValue placeholder="选择页面" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="page in transferCandidates" :key="page.id" :value="page.id">
                  {{ page.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <div v-if="!transferCandidates.length" class="text-muted-foreground text-xs">
              当前只有一个页面，请先创建新页面后再移动/复制。
            </div>
          </div>
        </div>

        <DialogFooter class="gap-2 sm:justify-end">
          <Button variant="outline" type="button" @click="transferDialogOpen = false">取消</Button>
          <Button type="button" :disabled="!transferTargetPageId" @click="confirmTransfer">
            {{ transferMode === 'copy' ? '确认复制' : '确认移动' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <PageFormDialog v-model:open="pageFormDialogOpen" :page="editingPage" @save="handleSavePage" />

	    <AddWidgetDialog
	      v-model:open="addDialogOpen"
	      :default-type="addDialogType"
	      :default-data="addDialogData"
	      :default-title="addDialogTitle"
	      :pages="store.pages.value"
	      :default-page-id="currentPage?.id"
	      @confirm="handleConfirmAdd"
	      @close="handleAddDialogClose"
	    />
	  </section>
</template>
