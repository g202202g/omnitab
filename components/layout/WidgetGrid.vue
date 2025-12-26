<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch, withDefaults, type ComponentPublicInstance } from 'vue';
import { GridStack, type GridStackOptions } from 'gridstack';
import type { WidgetLayout } from '@/composables/useWidgetStore';
import { useLog } from '@/composables/useLog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DEFAULT_WIDGET_TYPE, resolveWidgetDefinition } from '@/components/widgets/registry';
import type { WidgetType } from '@/components/widgets/types';
import { parseWidgetConfigJson } from '@/utils/widgetConfigJson';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { ArrowRightLeft, Copy, Download, Ellipsis, Sparkles } from 'lucide-vue-next';
import WidgetCard from '@/components/widgets/WidgetCard.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import 'gridstack/dist/gridstack.min.css';

const props = withDefaults(
  defineProps<{
    pageId?: string;
    widgets?: WidgetLayout[];
    maxHeight?: string;
    editMode?: boolean;
  }>(),
  { widgets: () => [], maxHeight: 'calc(100vh - 180px)', editMode: false },
);

const emit = defineEmits<{
  (e: 'layout-change', payload: WidgetLayout[]): void;
  (e: 'remove', id: string): void;
  (e: 'transfer', payload: { id: string; mode: 'move' | 'copy' }): void;
}>();

const logger = useLog('widget-grid');
const gridRoot = ref<HTMLElement | null>(null);
const grid = ref<GridStack | null>(null);
const suppressReloadFromParent = ref(false);
const suppressGridEvents = ref(false);
const widgetEls = new Map<string, HTMLElement>();
const nameDrafts = ref<Record<string, string>>({});

const GRID_COLUMNS = 24;
const GRID_MARGIN = 20;
const GRID_CELL_HEIGHT = 20;

type WidgetConfigDownload = {
  version: 1;
  kind: 'card';
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
};

const buildCardConfig = (widget: WidgetLayout): WidgetConfigDownload => ({
  version: 1,
  kind: 'card',
  type: (widget.type ?? DEFAULT_WIDGET_TYPE) as WidgetType,
  name: widget.name,
  icon: widget.icon,
  description: widget.description,
  showBorder: widget.showBorder,
  showTitle: widget.showTitle,
  showBackground: widget.showBackground,
  w: widget.w,
  h: widget.h,
  data: widget.data,
});

const buildCardFileName = (widget: WidgetLayout) => {
  const type = (widget.type ?? DEFAULT_WIDGET_TYPE) as WidgetType;
  const def = resolveWidgetDefinition(type);
  const rawName = (widget.name ?? def.title ?? type).trim();
  const safeName = rawName.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'card';
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `omnitab-card-${safeName}-${stamp}.json`;
};

const downloadText = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noreferrer';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportCardConfig = (widget: WidgetLayout) => {
  const config = buildCardConfig(widget);
  try {
    const check = parseWidgetConfigJson(JSON.stringify(config));
    if (!check.ok) throw new Error(check.message);
    downloadText(buildCardFileName(widget), JSON.stringify(config, null, 2));
    logger.info('export card config', { id: widget.id, type: widget.type });
  } catch (error) {
    logger.warn('export card config failed', { id: widget.id, error });
  }
};

const gridOptions: GridStackOptions = {
  column: GRID_COLUMNS,
  columnOpts: {
    columnWidth: 100,
    columnMax: GRID_COLUMNS,
    layout: 'moveScale',
    breakpointForWindow: false,
  },
  margin: GRID_MARGIN / 4,
  cellHeight: GRID_CELL_HEIGHT,
  float: true,
  resizable: { handles: 'all' },
  draggable: { handle: '.grid-stack-item-content' },
  alwaysShowResizeHandle: true,
};

let guideResizeObserver: ResizeObserver | null = null;

const applyGuideVars = () => {
  if (!gridRoot.value || !props.editMode) return;
  gridRoot.value.style.setProperty('--gs-guide-cols', String(GRID_COLUMNS));
  gridRoot.value.style.setProperty('--gs-guide-row', `${GRID_CELL_HEIGHT + GRID_MARGIN}px`);
  const width = gridRoot.value.clientWidth;
  if (width) gridRoot.value.style.setProperty('--gs-guide-col', `${width / GRID_COLUMNS}px`);
};

const clearGuideVars = () => {
  if (!gridRoot.value) return;
  gridRoot.value.style.removeProperty('--gs-guide-cols');
  gridRoot.value.style.removeProperty('--gs-guide-row');
  gridRoot.value.style.removeProperty('--gs-guide-col');
};

const applyGuideMode = () => {
  if (!gridRoot.value) return;
  gridRoot.value.classList.toggle('grid-guides', !!props.editMode);
  if (props.editMode) applyGuideVars();
  else clearGuideVars();
};

const startGuideObserver = () => {
  if (!gridRoot.value || guideResizeObserver) return;
  guideResizeObserver = new ResizeObserver(() => applyGuideVars());
  guideResizeObserver.observe(gridRoot.value);
  applyGuideVars();
};

const stopGuideObserver = () => {
  guideResizeObserver?.disconnect();
  guideResizeObserver = null;
};

const createId = () => crypto.randomUUID?.() ?? `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const setWidgetEl = (el: Element | ComponentPublicInstance | null, id: string) => {
  const element = el instanceof HTMLElement ? el : ((el as ComponentPublicInstance)?.$el as Element | undefined);
  if (element instanceof HTMLElement) {
    widgetEls.set(id, element);
  } else {
    widgetEls.delete(id);
  }
};

const buildLayouts = () =>
  props.widgets.map((widget) => ({
    id: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    minW: widget.minW ?? 2,
    minH: widget.minH ?? 2,
    maxW: widget.maxW,
    maxH: widget.maxH,
    type: widget.type ?? 'clock',
    name: widget.name,
    icon: widget.icon,
    description: widget.description,
    showBorder: widget.showBorder,
    showTitle: widget.showTitle,
    showBackground: widget.showBackground,
    data: widget.data,
    el: widgetEls.get(widget.id) ?? undefined,
  }));

const loadWidgetsFromProps = async () => {
  if (!grid.value || !props.pageId) return;
  suppressGridEvents.value = true;
  await nextTick();
  const layouts = buildLayouts();
  grid.value.load(layouts, true);
  const saved = grid.value.save(false);
  const savedNodes = Array.isArray(saved) ? saved : [];
  suppressGridEvents.value = false;
  logger.info('load widgets to grid', {
    pageId: props.pageId,
    count: layouts.length,
    layouts: layouts.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
    gridSaved: savedNodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
  });
};

const syncFromGrid = () => {
  if (!grid.value || !props.pageId) return;
  const nodes = grid.value.engine?.nodes ?? [];
  const layouts: WidgetLayout[] = nodes.map((node) => ({
    id: String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id') ?? createId()),
    x: node.x ?? 0,
    y: node.y ?? 0,
    w: node.w ?? 3,
    h: node.h ?? 2,
    minW: node.minW ?? 2,
    minH: node.minH ?? 2,
    type:
      props.widgets.find((w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')))
        ?.type ?? 'clock',
    name: props.widgets.find((w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')))
      ?.name,
    icon: props.widgets.find((w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')))
      ?.icon,
    description: props.widgets.find(
      (w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')),
    )?.description,
    showBorder: props.widgets.find(
      (w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')),
    )?.showBorder,
    showTitle: props.widgets.find(
      (w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')),
    )?.showTitle,
    showBackground: props.widgets.find(
      (w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')),
    )?.showBackground,
    data: props.widgets.find((w) => w.id === String(node.id ?? (node.el as HTMLElement | null)?.getAttribute('gs-id')))
      ?.data,
  }));
  logger.info('grid change snapshot', {
    pageId: props.pageId,
    nodes: layouts.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
  });
  suppressReloadFromParent.value = true;
  emit('layout-change', layouts);
};

const handleGridChange = () => {
  if (suppressGridEvents.value || !props.editMode) return;
  syncFromGrid();
};

const notifyGridReflow = () => {
  window.dispatchEvent(new Event('codex-grid-reflow'));
};

const initGrid = async () => {
  if (grid.value || !gridRoot.value) return;
  grid.value = GridStack.init(gridOptions, gridRoot.value);
  grid.value?.on('change', handleGridChange);
  grid.value?.on('removed', handleGridChange);
  grid.value?.on('added', handleGridChange);
  grid.value?.on('dragstop', handleGridChange);
  grid.value?.on('resizestop', handleGridChange);
  grid.value?.on('dragstop', notifyGridReflow);
  grid.value?.on('resizestop', notifyGridReflow);
  await nextTick();
  await loadWidgetsFromProps();
  grid.value?.setStatic(!props.editMode);
  logger.info('grid initialized', {
    pageId: props.pageId,
    widgets: props.widgets.length,
    editMode: props.editMode,
  });
};

const emitRemove = (id: string) => emit('remove', id);
const emitTransfer = (id: string, mode: 'move' | 'copy') => emit('transfer', { id, mode });

const ensureNameDrafts = () => {
  const next = { ...(nameDrafts.value ?? {}) };
  props.widgets.forEach((widget) => {
    next[widget.id] = widget.name ?? '';
  });
  nameDrafts.value = next;
};

const updateWidgetMeta = (id: string, patch: Partial<WidgetLayout>) => {
  if (!props.widgets.length) return;
  const updated = props.widgets.map((item) => (item.id === id ? { ...item, ...patch } : item));
  suppressReloadFromParent.value = true;
  emit('layout-change', updated);
};

const handleNameDraft = (id: string, value: string) => {
  nameDrafts.value = { ...nameDrafts.value, [id]: value };
};

const handleNameCommit = (id: string) => {
  const value = nameDrafts.value[id]?.trim();
  updateWidgetMeta(id, { name: value || undefined });
};

const handleApplySettings = (
  id: string,
  payload: {
    type: WidgetType;
    name: string;
    icon?: string;
    description?: string;
    showTitle: boolean;
    showBackground: boolean;
    showBorder: boolean;
    data?: Record<string, unknown>;
  },
) => {
  handleNameDraft(id, payload.name ?? '');
  const prevWidget = props.widgets.find((item) => item.id === id);
  const prevData = prevWidget?.data ?? {};
  const mergedData = payload.data ? { ...prevData, ...payload.data } : { ...prevData };
  const nextData: Record<string, unknown> = mergedData;
  updateWidgetMeta(id, {
    type: payload.type,
    name: payload.name?.trim() || undefined,
    icon: typeof payload.icon === 'string' && payload.icon.trim() ? payload.icon.trim() : undefined,
    description:
      typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined,
    showTitle: payload.showTitle,
    showBackground: payload.showBackground,
    showBorder: payload.showBorder,
    data: nextData,
  });
  logger.info('apply settings from card', {
    pageId: props.pageId,
    id,
    payload,
  });
};

const toggleBorder = (id: string) => {
  const target = props.widgets.find((item) => item.id === id);
  const next = target?.showBorder === false ? true : false;
  updateWidgetMeta(id, { showBorder: next });
};

const resolveWidgetComponent = (type?: WidgetLayout['type']) => resolveWidgetDefinition(type).component;

const handleUpdateIframeUrl = (id: string, url: string) => {
  updateWidgetMeta(id, { data: { ...(props.widgets.find((w) => w.id === id)?.data ?? {}), url } });
  logger.info('update iframe url', { pageId: props.pageId, id, url });
};

onMounted(async () => {
  await initGrid();
  startGuideObserver();
  applyGuideMode();
  ensureNameDrafts();
});

onBeforeUnmount(() => {
  stopGuideObserver();
  suppressGridEvents.value = true;
  grid.value?.destroy(false);
  grid.value = null;
});

watch(
  () => props.pageId,
  async () => {
    if (!grid.value) return;
    await nextTick();
    await loadWidgetsFromProps();
    grid.value?.setStatic(!props.editMode);
    ensureNameDrafts();
    logger.info('page change -> reload grid', {
      pageId: props.pageId,
      count: props.widgets.length,
      editMode: props.editMode,
    });
  },
);

watch(
  () => props.widgets,
  async () => {
    if (suppressReloadFromParent.value) {
      suppressReloadFromParent.value = false;
      return;
    }
    await loadWidgetsFromProps();
    ensureNameDrafts();
    grid.value?.setStatic(!props.editMode);
    logger.info('widgets changed from parent -> reload grid', {
      pageId: props.pageId,
      count: props.widgets.length,
      editMode: props.editMode,
    });
  },
  { deep: true },
);

watch(
  () => props.editMode,
  async () => {
    if (!grid.value) return;
    await nextTick();
    applyGuideMode();
    grid.value?.setStatic(!props.editMode);
    logger.info('toggle edit mode', { pageId: props.pageId, editMode: props.editMode });
  },
);

const reflow = async () => {
  if (!grid.value || !props.pageId) return;
  suppressGridEvents.value = true;
  try {
    // 重排属于显式用户操作：即使当前不在编辑模式，也允许整理布局并持久化
    grid.value.setStatic(false);
    grid.value.compact('list');
    await nextTick();
  } finally {
    grid.value?.setStatic(!props.editMode);
    suppressGridEvents.value = false;
  }
  syncFromGrid();
  logger.info('grid reflow', { pageId: props.pageId, layout: 'list' });
};

defineExpose({
  reload: loadWidgetsFromProps,
  reflow,
});
</script>

<template>
  <ScrollArea type="scroll" class="w-full" :style="{ maxHeight, height: maxHeight }">
    <div ref="gridRoot" class="grid-stack min-h-0">
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="grid-stack-item"
        :gs-id="widget.id"
        :gs-x="widget.x"
        :gs-y="widget.y"
        :gs-w="widget.w"
        :gs-h="widget.h"
        :gs-min-w="widget.minW ?? 2"
        :gs-min-h="widget.minH ?? 2"
        :gs-max-w="widget.maxW ?? undefined"
        :gs-max-h="widget.maxH ?? undefined"
        :ref="(el) => setWidgetEl(el, widget.id)"
      >
        <WidgetCard
          :model-value="nameDrafts[widget.id] ?? ''"
          :placeholder="resolveWidgetDefinition(widget.type).title"
          :icon="widget.icon"
          :description="widget.description"
          :show-title="widget.showTitle !== false"
          :show-border="widget.showBorder !== false"
          :show-background="widget.showBackground !== false"
          :edit-mode="props.editMode"
          :custom-data="widget.data"
          :widget-type="widget.type ?? 'clock'"
          @update:model-value="(val) => handleNameDraft(widget.id, val)"
          @apply-settings="(payload) => handleApplySettings(widget.id, payload)"
          @remove="emitRemove(widget.id)"
        >
          <template v-if="props.editMode" #controls>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:ring-ring/40 inline-flex h-8 w-8 items-center justify-center rounded-xl transition focus-visible:ring-2 focus-visible:outline-none"
                  aria-label="更多操作"
                  title="更多操作"
                  @click.stop
                >
                  <Ellipsis class="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="bottom"
                :side-offset="8"
                class="border-border bg-popover/98 text-popover-foreground min-w-[100px] rounded-2xl border shadow-2xl"
              >
                <DropdownMenuItem class="gap-2" @click="emitTransfer(widget.id, 'copy')">
                  <Copy class="h-4 w-4" /> 复制到页面…
                </DropdownMenuItem>
                <DropdownMenuItem class="gap-2" @click="emitTransfer(widget.id, 'move')">
                  <ArrowRightLeft class="h-4 w-4" /> 移动到页面…
                </DropdownMenuItem>
                <DropdownMenuItem class="gap-2" @click="exportCardConfig(widget)">
                  <Download class="h-4 w-4" /> 导出配置（JSON）
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>

          <component
            :is="resolveWidgetComponent(widget.type)"
            :widget-id="widget.id"
            :data="widget.data"
            :edit-mode="props.editMode"
            v-bind="
              widget.type === 'clock' || widget.type === 'system' ? { showTitle: widget.showTitle !== false } : {}
            "
            @update:url="(val: string) => handleUpdateIframeUrl(widget.id, val)"
          />
        </WidgetCard>
      </div>
    </div>

    <Empty
      v-if="!widgets.length"
      class="border-border bg-muted/40 text-muted-foreground min-h-full w-full rounded-2xl border"
    >
      <EmptyContent>
        <EmptyHeader class="gap-2">
          <EmptyMedia variant="icon">
            <Sparkles class="text-muted-foreground h-6 w-6" />
          </EmptyMedia>
          <EmptyTitle>当前页面还没有卡片</EmptyTitle>
          <EmptyDescription> 点击右上角“添加卡片”挑选内容，创建后可拖动或拉伸调整布局。 </EmptyDescription>
        </EmptyHeader>
      </EmptyContent>
    </Empty>
  </ScrollArea>
</template>
<style scoped>
:deep([data-slot='scroll-area-viewport'] > div) {
  height: 100%;
}

.grid-stack.grid-guides {
  position: relative;
}

.grid-stack.grid-guides::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  --gs-guide-line-x: color-mix(in oklab, var(--border) 45%, transparent);
  --gs-guide-line-y: color-mix(in oklab, var(--border) 35%, transparent);
  background-image:
    linear-gradient(to right, var(--gs-guide-line-x) 1px, transparent 1px),
    linear-gradient(to bottom, var(--gs-guide-line-y) 1px, transparent 1px);
  background-size: var(--gs-guide-col, calc(100% / var(--gs-guide-cols, 12))) var(--gs-guide-row, 90px);
  background-position: 0 0;
  z-index: 0;
}
</style>
