<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';
import { useLog } from '@/composables/useLog';
import { GripVertical, Settings, Trash2 } from 'lucide-vue-next';
import DynamicIcon from '@/components/ui/icon/DynamicIcon.vue';
import WidgetEditorForm, { type WidgetBaseForm } from './WidgetEditorForm.vue';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  WIDGET_CARD_BOTTOM_OVERLAY_TARGET_KEY,
  WIDGET_CARD_STATUS_TARGET_KEY,
  type WidgetCardBottomOverlayTarget,
  type WidgetCardControlsTarget,
  type WidgetCardStatusTarget,
} from './utils/widgetCardControls';
import type { WidgetType } from './types';
import { DEFAULT_WIDGET_TYPE } from './registry';
import { DEFAULT_ICON_PREFIX, normalizeIconName } from '@/lib/iconify';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    icon?: string;
    description?: string;
    showTitle?: boolean;
    showBorder?: boolean;
    showBackground?: boolean;
    editMode?: boolean;
    customData?: Record<string, unknown>;
    widgetType?: WidgetType;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    icon: '',
    description: '',
    showTitle: true,
    showBorder: true,
    showBackground: true,
    editMode: true,
    customData: () => ({}),
    widgetType: DEFAULT_WIDGET_TYPE,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (
    e: 'apply-settings',
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
  ): void;
  (e: 'remove'): void;
}>();

const displayName = ref(props.modelValue);
const displayIcon = ref(props.icon ?? '');
const displayDescription = ref(props.description ?? '');
const displayShowTitle = ref(props.showTitle ?? true);
const displayShowBorder = ref(props.showBorder ?? true);
const displayShowBackground = ref(props.showBackground ?? true);
const showControls = computed(() => props.editMode !== false);
const controlsTarget = ref<HTMLElement | null>(null);
provide(WIDGET_CARD_CONTROLS_TARGET_KEY, controlsTarget as WidgetCardControlsTarget);
const bottomOverlayTarget = ref<HTMLElement | null>(null);
provide(WIDGET_CARD_BOTTOM_OVERLAY_TARGET_KEY, bottomOverlayTarget as WidgetCardBottomOverlayTarget);
const statusTarget = ref<HTMLElement | null>(null);
provide(WIDGET_CARD_STATUS_TARGET_KEY, statusTarget as WidgetCardStatusTarget);
const hasInjectedControls = ref(false);
let controlsObserver: MutationObserver | null = null;

const syncInjectedControls = () => {
  const el = controlsTarget.value;
  if (!el) {
    hasInjectedControls.value = false;
    return;
  }
  hasInjectedControls.value = el.childNodes.length > 0;
};

watch(
  () => controlsTarget.value,
  (el, prev) => {
    if (prev && controlsObserver) {
      controlsObserver.disconnect();
      controlsObserver = null;
    }
    if (!el) {
      hasInjectedControls.value = false;
      return;
    }
    syncInjectedControls();
    controlsObserver = new MutationObserver(() => {
      syncInjectedControls();
    });
    controlsObserver.observe(el, { childList: true, subtree: true });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  controlsObserver?.disconnect();
  controlsObserver = null;
});

const shouldShowControlsBar = computed(() => showControls.value || hasInjectedControls.value);

const cardClass = computed(() => {
  const classes: string[] = [
    'rounded-xl',
    'transition-[color,background-color,border-color,box-shadow]',
    'duration-150',
    'focus-within:outline-none',
  ];
  if (displayShowBackground.value === false) {
    classes.push('bg-transparent shadow-none text-foreground');
  } else {
    classes.push('bg-card/85 supports-[backdrop-filter]:bg-card/70 backdrop-blur-md text-card-foreground shadow-sm');
    if (showControls.value) {
      classes.push('hover:shadow-md');
    }
  }
  if (displayShowBorder.value === false) {
    classes.push('border border-transparent');
  } else {
    classes.push('border border-border/70');
    if (showControls.value) {
      classes.push('hover:border-border/90');
    }
  }
  classes.push('focus-within:ring-0 focus-within:ring-ring/25');
  return classes.filter(Boolean).join(' ');
});

const overlaySurfaceClass = computed(() => {
  // 当卡片背景关闭时，浮层需要更实一点，否则会“漂在背景图上”不易看清
  if (displayShowBackground.value === false) {
    return 'bg-background/70 supports-[backdrop-filter]:bg-background/70';
  }
  return 'bg-background/30 supports-[backdrop-filter]:bg-background/70';
});

const settingsOpen = ref(false);
const editorBase = ref<WidgetBaseForm>({
  type: props.widgetType ?? DEFAULT_WIDGET_TYPE,
  title: props.modelValue,
  icon: props.icon ?? '',
  description: props.description ?? '',
  showTitle: props.showTitle ?? true,
  showBorder: props.showBorder ?? true,
  showBackground: props.showBackground ?? true,
});
const editorCustom = ref<Record<string, unknown>>({ ...(props.customData ?? {}) });
const editorKey = ref(0);
const displayTitle = computed(() => {
  const name = displayName.value?.trim();
  if (name) return name;
  if (displayIcon.value?.trim()) return '';
  return props.placeholder || '未命名卡片';
});
const logger = useLog('widget-card');
const confirmDelete = ref(false);

const buildEditorBase = (): WidgetBaseForm => ({
  type: props.widgetType ?? DEFAULT_WIDGET_TYPE,
  title: displayName.value,
  icon: displayIcon.value,
  description: displayDescription.value,
  showTitle: displayShowTitle.value,
  showBorder: displayShowBorder.value,
  showBackground: displayShowBackground.value,
});

const buildEditorCustom = () => ({ ...(props.customData ?? {}) });

const prepareEditor = () => {
  editorBase.value = buildEditorBase();
  editorCustom.value = buildEditorCustom();
  editorKey.value += 1;
};

const openSettings = () => {
  settingsOpen.value = true;
  logger.info('open settings', {
    name: displayName.value,
    showTitle: displayShowTitle.value,
    showBackground: displayShowBackground.value,
    showBorder: displayShowBorder.value,
    type: props.widgetType,
  });
};

const closeSettings = () => {
  settingsOpen.value = false;
};

const handleSubmitSettings = (payload: { base: WidgetBaseForm; custom: Record<string, unknown> }) => {
  const type = (payload.base.type as WidgetType | undefined) ?? props.widgetType ?? DEFAULT_WIDGET_TYPE;
  displayName.value = payload.base.title ?? '';
  displayIcon.value = payload.base.icon ?? '';
  displayDescription.value = payload.base.description ?? '';
  displayShowTitle.value = !!payload.base.showTitle;
  displayShowBackground.value = !!payload.base.showBackground;
  displayShowBorder.value = !!payload.base.showBorder;
  const normalizedData = { ...(payload.custom ?? {}) };
  logger.info('apply settings', {
    name: displayName.value,
    showTitle: displayShowTitle.value,
    showBackground: displayShowBackground.value,
    showBorder: displayShowBorder.value,
    type,
  });
  // 先关闭弹窗，再向外部同步数据，避免父级同步过程中重新触发 Dialog 状态
  settingsOpen.value = false;
  // 使用 microtask 延迟持久化，确保弹窗关闭及 UI 状态稳定后再同步数据
  queueMicrotask(() => {
    emit('apply-settings', {
      type,
      name: payload.base.title ?? '',
      icon: displayIcon.value?.trim() ? normalizeIconName(displayIcon.value, '', DEFAULT_ICON_PREFIX) : undefined,
      description: displayDescription.value?.trim() || undefined,
      showTitle: displayShowTitle.value,
      showBackground: displayShowBackground.value,
      showBorder: displayShowBorder.value,
      data: normalizedData,
    });
    emit('update:modelValue', displayName.value);
  });
};

const handleDelete = () => {
  confirmDelete.value = true;
};

const confirmDeleteAction = () => {
  confirmDelete.value = false;
  emit('remove');
};

watch(
  () => props.modelValue,
  (value) => {
    displayName.value = value;
    logger.info('prop modelValue changed', { value });
  },
);
watch(
  () => props.icon,
  (value) => {
    displayIcon.value = typeof value === 'string' ? value : '';
  },
);
watch(
  () => props.description,
  (value) => {
    displayDescription.value = typeof value === 'string' ? value : '';
  },
);
watch(
  () => props.showTitle,
  (value) => {
    displayShowTitle.value = value ?? true;
    logger.info('prop showTitle changed', { value });
  },
);
watch(
  () => props.showBackground,
  (value) => {
    displayShowBackground.value = value ?? true;
    logger.info('prop showBackground changed', { value });
  },
);
watch(
  () => props.showBorder,
  (value) => {
    displayShowBorder.value = value ?? true;
    logger.info('prop showBorder changed', { value });
  },
);
watch(
  () => settingsOpen.value,
  (value) => {
    if (value) {
      prepareEditor();
    }
  },
);

const displayIconName = computed(() =>
  displayIcon.value?.trim() ? normalizeIconName(displayIcon.value, '', DEFAULT_ICON_PREFIX) : '',
);
const displayDescText = computed(() => displayDescription.value?.trim() || '');
</script>

<template>
  <Card
    class="grid-stack-item-content group text-card-foreground relative flex w-full flex-col gap-1 overflow-hidden py-0"
    :class="cardClass"
  >
    <div
      v-if="showControls && !displayShowTitle"
      class="border-border/35 text-muted-foreground hover:border-border/55 absolute top-4 left-4 z-10 flex h-9 w-9 cursor-grab items-center justify-center rounded-2xl border shadow-none backdrop-blur-sm transition-all select-none hover:shadow-sm active:cursor-grabbing"
      :class="overlaySurfaceClass"
      aria-hidden="true"
    >
      <GripVertical class="h-4 w-4" />
    </div>

    <div
      v-show="shouldShowControlsBar"
      ref="controlsTarget"
      class="gs-no-move border-border/35 hover:border-border/55 absolute top-4 right-4 z-10 flex items-center gap-1 rounded-2xl border p-1 shadow-none backdrop-blur-sm transition-all empty:hidden hover:opacity-100 hover:shadow-sm"
      :class="[
        overlaySurfaceClass,
        showControls
          ? 'opacity-85'
          : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-85 focus-within:pointer-events-auto focus-within:opacity-85',
      ]"
      @mousedown.stop
      @touchstart.stop
    >
      <slot name="controls" />
      <Tooltip v-if="showControls">
        <TooltipTrigger as-child>
          <Button
            data-tour="widget-settings-btn"
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-foreground rounded-xl"
            aria-label="设置卡片"
            @click.stop.prevent="openSettings"
          >
            <Settings class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">设置</TooltipContent>
      </Tooltip>

      <Tooltip v-if="showControls">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-xl"
            aria-label="删除卡片"
            @click.stop.prevent="handleDelete"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">删除</TooltipContent>
      </Tooltip>
    </div>

    <CardHeader
      v-if="displayShowTitle"
      class="grid-rows-[auto] gap-1 px-4 py-3 pr-24"
      :class="showControls ? 'cursor-grab active:cursor-grabbing' : ''"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="gs-no-move flex flex-1 items-center gap-2">
          <DynamicIcon
            v-if="displayIconName"
            :name="displayIconName"
            class="border-border/60 bg-muted/25 text-foreground h-5 w-5 rounded-md border p-0.5"
          />
          <span v-if="displayTitle" class="text-foreground line-clamp-1 text-base font-semibold">
            {{ displayTitle }}
          </span>
        </div>
      </div>
      <p v-if="displayDescText" class="text-muted-foreground line-clamp-1 text-xs">
        {{ displayDescText }}
      </p>
    </CardHeader>

    <CardContent class="text-muted-foreground min-h-0 flex-1 px-4 pb-4" :class="displayShowTitle ? 'pt-0' : 'pt-5'">
      <ScrollArea type="scroll" class="h-full max-h-full overflow-hidden">
        <slot />
      </ScrollArea>
    </CardContent>

    <div
      ref="bottomOverlayTarget"
      class="pointer-events-none absolute right-4 bottom-4 left-4 z-20 flex items-end justify-center empty:hidden"
    />

    <div
      ref="statusTarget"
      class="pointer-events-none absolute right-4 bottom-4 z-10 flex flex-col items-end gap-1 empty:hidden"
    />

    <Dialog v-if="settingsOpen" v-model:open="settingsOpen">
      <DialogContent
        data-tour="widget-settings-dialog"
        class="border-border bg-popover text-popover-foreground grid h-[min(85vh,720px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border shadow-2xl sm:max-w-[620px]"
      >
        <DialogHeader>
          <DialogTitle class="text-base font-semibold">卡片设置</DialogTitle>
        </DialogHeader>

        <div class="h-full min-h-0">
          <WidgetEditorForm
            class="h-full"
            :key="editorKey"
            v-model:base="editorBase"
            v-model:custom="editorCustom"
            final-label="保存设置"
            next-label="下一步"
            cancel-label="取消"
            @submit="handleSubmitSettings"
            @cancel="closeSettings"
          />
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="confirmDelete">
      <AlertDialogContent class="sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle class="text-base font-semibold">确认删除</AlertDialogTitle>
          <AlertDialogDescription class="text-muted-foreground text-sm">
            确定要删除卡片「{{ displayTitle }}」吗？删除后当前布局将不可恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel> 取消 </AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteAction"> 删除 </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>
</template>
<style scoped>
:deep([data-slot='scroll-area-viewport'] > div) {
  height: 100%;
}
</style>
