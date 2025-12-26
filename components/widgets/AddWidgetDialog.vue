<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { resolveWidgetDefinition, DEFAULT_WIDGET_TYPE } from './registry';
import type { WidgetType } from './types';
import WidgetEditorForm, { type WidgetBaseForm } from './WidgetEditorForm.vue';
import { parseWidgetConfigJson, type WidgetConfigJsonV1 } from '@/utils/widgetConfigJson';
import { Upload } from 'lucide-vue-next';
import { useLog } from '@/composables/useLog';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    defaultType?: WidgetType;
  }>(),
  {
    open: false,
    defaultType: DEFAULT_WIDGET_TYPE,
  },
);

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'close'): void;
  (
    e: 'confirm',
    payload: {
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
    },
  ): void;
}>();

const open = computed({
  get: () => props.open ?? false,
  set: (value) => emit('update:open', value),
});

const buildBaseDefaults = (type: WidgetType): WidgetBaseForm => {
  const def = resolveWidgetDefinition(type);
  return {
    type,
    title: '',
    icon: '',
    description: '',
    showTitle: def.defaults.showTitle ?? true,
    showBorder: def.defaults.showBorder ?? true,
    showBackground: def.defaults.showBackground ?? true,
  };
};

const buildCustomDefaults = (type: WidgetType) => {
  const def = resolveWidgetDefinition(type);
  const initial = def.buildInitialData ? def.buildInitialData() : {};
  return initial;
};

const baseForm = ref<WidgetBaseForm>(buildBaseDefaults(props.defaultType ?? DEFAULT_WIDGET_TYPE));
const customForm = ref<Record<string, unknown>>(buildCustomDefaults(props.defaultType ?? DEFAULT_WIDGET_TYPE));
const editorKey = ref(0);

const logger = useLog('add-widget-dialog');
const tab = ref<'create' | 'import'>('create');

const importText = ref('');
const importError = ref('');
const importPreview = ref<WidgetConfigJsonV1 | null>(null);
const importFileInputRef = ref<HTMLInputElement | null>(null);

const resetAddForm = (type: WidgetType = DEFAULT_WIDGET_TYPE) => {
  baseForm.value = buildBaseDefaults(type);
  customForm.value = buildCustomDefaults(type);
  editorKey.value += 1;
};

const handleSubmit = (payload: { base: WidgetBaseForm; custom: Record<string, unknown> }) => {
  const type = (payload.base.type as WidgetType | undefined) ?? DEFAULT_WIDGET_TYPE;
  const name = payload.base.title?.trim() ?? '';
  const icon = typeof payload.base.icon === 'string' && payload.base.icon.trim() ? payload.base.icon.trim() : undefined;
  const description =
    typeof payload.base.description === 'string' && payload.base.description.trim()
      ? payload.base.description.trim()
      : undefined;
  const normalizedData = { ...(payload.custom ?? {}) };
  emit('confirm', {
    type,
    name,
    icon,
    description,
    showTitle: payload.base.showTitle ?? true,
    showBorder: payload.base.showBorder ?? true,
    showBackground: payload.base.showBackground ?? true,
    data: normalizedData,
  });
  open.value = false;
};

const resetImport = () => {
  importText.value = '';
  importError.value = '';
  importPreview.value = null;
};

const parseImport = (text: string) => {
  const res = parseWidgetConfigJson(text);
  if (!res.ok) {
    importError.value = res.message;
    importPreview.value = null;
    return null;
  }
  importError.value = '';
  importPreview.value = res.value;
  return res.value;
};

const chooseImportFile = () => {
  importError.value = '';
  importFileInputRef.value?.click?.();
};

const handleImportFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;
  if (input) input.value = '';
  if (!file) return;
  try {
    importText.value = await file.text();
    parseImport(importText.value);
  } catch {
    importError.value = '读取失败，请换一个文件试试。';
    importPreview.value = null;
  }
};

watch(
  () => importText.value,
  (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      importError.value = '';
      importPreview.value = null;
      return;
    }
    // 避免每个按键都报错：只有看起来像 JSON 时才尝试解析
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
    void parseImport(value);
  },
);

const confirmImport = () => {
  const parsed = importPreview.value ?? parseImport(importText.value);
  if (!parsed) return;
  emit('confirm', {
    type: parsed.type,
    name: parsed.name,
    icon: parsed.icon,
    description: parsed.description,
    showBorder: parsed.showBorder,
    showTitle: parsed.showTitle,
    showBackground: parsed.showBackground,
    w: typeof parsed.w === 'number' ? parsed.w : undefined,
    h: typeof parsed.h === 'number' ? parsed.h : undefined,
    data: parsed.data,
  });
  logger.info('import widget config', { type: parsed.type });
  open.value = false;
};

watch(
  () => props.defaultType,
  (type) => {
    resetAddForm(type ?? DEFAULT_WIDGET_TYPE);
  },
);

watch(
  () => props.open,
  (value, prev) => {
    if (value) {
      tab.value = 'create';
      resetImport();
      resetAddForm(props.defaultType ?? DEFAULT_WIDGET_TYPE);
    } else if (prev) {
      emit('close');
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent
      data-tour="add-card-dialog"
      class="border-border bg-popover text-popover-foreground grid h-[min(85vh,720px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border shadow-2xl sm:max-w-[620px]"
    >
      <DialogHeader>
        <DialogTitle>添加卡片</DialogTitle>
        <DialogDescription>可以新建卡片，也可以从配置文件导入。</DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab" class="flex h-full min-h-0 flex-col gap-3">
        <TabsList
          class="border-border bg-background/60 h-auto w-full shrink-0 justify-start rounded-2xl border p-1 shadow-sm"
        >
          <TabsTrigger value="create" class="h-9 !flex-none rounded-xl px-4">新建</TabsTrigger>
          <TabsTrigger value="import" class="h-9 !flex-none rounded-xl px-4">从 JSON 导入</TabsTrigger>
        </TabsList>

        <TabsContent value="create" class="min-h-0 flex-1">
          <div class="h-full min-h-0">
            <WidgetEditorForm
              class="h-full"
              :key="editorKey"
              v-model:base="baseForm"
              v-model:custom="customForm"
              allow-type-pick
              final-label="确认添加"
              next-label="下一步"
              cancel-label="取消"
              @submit="handleSubmit"
              @cancel="open = false"
            />
          </div>
        </TabsContent>

        <TabsContent value="import" class="min-h-0 flex-1">
          <div class="flex h-full min-h-0 flex-col gap-3">
            <input ref="importFileInputRef" type="file" class="hidden" @change="handleImportFileChange" />

            <div class="flex flex-wrap items-center justify-between gap-2">
              <Button size="sm" variant="secondary" @click="chooseImportFile">
                <Upload class="mr-2 h-4 w-4" />
                选择文件
              </Button>
              <div class="text-muted-foreground text-xs">导入后仍可在卡片里继续修改。</div>
            </div>

            <Textarea
              v-model="importText"
              class="min-h-[200px] flex-1 resize-none rounded-2xl text-xs"
              placeholder="把卡片配置（JSON）粘贴到这里，或点上面“选择文件”。"
            />

            <div
              v-if="importPreview"
              class="border-border/60 bg-muted/20 text-muted-foreground rounded-2xl border px-3 py-2 text-xs"
            >
              已识别：{{ resolveWidgetDefinition(importPreview.type).title }}
              <span v-if="importPreview.w && importPreview.h"> · 大小 {{ importPreview.w }}×{{ importPreview.h }}</span>
            </div>
            <div
              v-else-if="importError"
              class="border-destructive/30 bg-destructive/10 text-destructive rounded-2xl border px-3 py-2 text-xs"
            >
              {{ importError }}
            </div>

            <div class="flex items-center justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" @click="open = false">取消</Button>
              <Button size="sm" :disabled="!importPreview" @click="confirmImport">确认添加</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
