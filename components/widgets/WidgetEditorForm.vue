<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import WidgetSettingsForm from './WidgetSettingsForm.vue';
import { DEFAULT_WIDGET_TYPE, resolveWidgetDefinition } from './registry';
import type { WidgetType } from './types';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildWidgetEditorSchema, type WidgetEditorFormValues } from './widgetFormSchema';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from './widgetEditorValidationGate';

export type WidgetBaseForm = {
  title?: string;
  icon?: string;
  description?: string;
  type?: WidgetType;
  showTitle?: boolean;
  showBorder?: boolean;
  showBackground?: boolean;
};

const props = withDefaults(
  defineProps<{
    base?: WidgetBaseForm;
    custom?: Record<string, unknown>;
    allowTypePick?: boolean;
    finalLabel?: string;
    nextLabel?: string;
    cancelLabel?: string;
    showCancel?: boolean;
  }>(),
  {
    base: () => ({
      type: DEFAULT_WIDGET_TYPE,
      title: '',
      icon: '',
      description: '',
      showTitle: true,
      showBorder: true,
      showBackground: true,
    }),
    custom: () => ({}),
    allowTypePick: true,
    finalLabel: '确认添加',
    nextLabel: '下一步',
    cancelLabel: '取消',
    showCancel: true,
  },
);

const emit = defineEmits<{
  (e: 'update:base', value: WidgetBaseForm): void;
  (e: 'update:custom', value: Record<string, unknown>): void;
  (e: 'submit', payload: { base: WidgetBaseForm; custom: Record<string, unknown> }): void;
  (e: 'cancel'): void;
}>();

const normalizeBase = (value?: WidgetBaseForm): WidgetBaseForm => {
  const type = value?.type ?? DEFAULT_WIDGET_TYPE;
  const def = resolveWidgetDefinition(type);
  return {
    type,
    title: typeof value?.title === 'string' ? value.title : '',
    icon: typeof value?.icon === 'string' ? value.icon : '',
    description: typeof value?.description === 'string' ? value.description : '',
    showTitle: typeof value?.showTitle === 'boolean' ? value?.showTitle : (def.defaults.showTitle ?? true),
    showBorder: typeof value?.showBorder === 'boolean' ? value?.showBorder : (def.defaults.showBorder ?? true),
    showBackground:
      typeof value?.showBackground === 'boolean' ? value?.showBackground : (def.defaults.showBackground ?? true),
  };
};

const normalizeCustom = (value: Record<string, unknown> | undefined, type: WidgetType) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  const def = resolveWidgetDefinition(type);
  const initial = def.buildInitialData ? def.buildInitialData() : {};
  return initial && typeof initial === 'object' && !Array.isArray(initial) ? { ...initial } : {};
};

const initialBase = normalizeBase(props.base);
const selectedType = ref<WidgetType>((initialBase.type ?? DEFAULT_WIDGET_TYPE) as WidgetType);
const validateOnInteraction = ref(true);
provide(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, validateOnInteraction);

const activeStep = ref(1);

const currentDefinition = computed(() => resolveWidgetDefinition(selectedType.value ?? DEFAULT_WIDGET_TYPE));
const hasCustomForm = computed(() => !!currentDefinition.value.formComponent);
const stepList = computed(() =>
  hasCustomForm.value
    ? [
        { title: '基础设置', description: '选择类型并设置显示选项' },
        { title: '内容设置', description: '填写卡片的内容' },
      ]
    : [{ title: '基础设置', description: '选择类型并设置显示选项' }],
);

const handlePrimary = () => {
  if (hasCustomForm.value && activeStep.value === 1) {
    void validateAndNext();
    return;
  }
  void validateAndSubmit();
};

const goPrevStep = () => {
  activeStep.value = Math.max(1, activeStep.value - 1);
};

const primaryLabel = computed(() =>
  hasCustomForm.value && activeStep.value === 1 ? props.nextLabel : props.finalLabel,
);

const validateCustom = computed(() => !hasCustomForm.value || activeStep.value === 2);

const form = useForm<WidgetEditorFormValues>({
  validationSchema: computed(() =>
    toTypedSchema(
      buildWidgetEditorSchema(
        validateCustom.value,
        resolveWidgetDefinition(selectedType.value ?? DEFAULT_WIDGET_TYPE).buildCustomSchema,
      ),
    ),
  ),
  keepValuesOnUnmount: true,
  initialValues: {
    base: { ...initialBase },
    custom: { ...normalizeCustom(props.custom, (initialBase.type ?? DEFAULT_WIDGET_TYPE) as WidgetType) },
  },
});

watch(
  () => (form.values.base?.type as WidgetType | undefined) ?? DEFAULT_WIDGET_TYPE,
  (type) => {
    selectedType.value = (type ?? DEFAULT_WIDGET_TYPE) as WidgetType;
  },
  { immediate: true },
);

let syncingTypeChange = false;
watch(
  () => selectedType.value ?? DEFAULT_WIDGET_TYPE,
  (type, prev) => {
    if (syncingTypeChange) return;
    if (type === prev) return;

    const def = resolveWidgetDefinition(type);
    const nextBase = normalizeBase({
      ...(form.values.base as any),
      type,
      showTitle: def.defaults.showTitle ?? true,
      showBorder: def.defaults.showBorder ?? true,
      showBackground: def.defaults.showBackground ?? true,
    });
    const nextCustom = normalizeCustom(undefined, type);

    syncingTypeChange = true;
    form.setValues({ base: { ...nextBase }, custom: { ...nextCustom } }, false);
    form.setErrors({});
    syncingTypeChange = false;

    activeStep.value = 1;
  },
);

watch(
  () => form.values.base,
  (value) => {
    emit('update:base', { ...(value as any) });
  },
  { deep: true },
);

watch(
  () => form.values.custom,
  (value) => {
    emit('update:custom', { ...(value as any) });
  },
  { deep: true },
);

const handleValidationFailed = async () => {
  const errors = (form.errors.value ?? {}) as Record<string, string | undefined>;
  const keys = Object.entries(errors)
    .filter(([, message]) => Boolean(message))
    .map(([key]) => key);
  const baseKeys = keys.filter((key) => key.startsWith('base.'));

  if (hasCustomForm.value && activeStep.value === 2 && baseKeys.length) {
    activeStep.value = 1;
    await nextTick();
    return;
  }
};

const validateAndSubmit = async () => {
  const result = await form.validate();
  if (!result.valid) {
    await handleValidationFailed();
    return;
  }
  const values = (result.values ?? form.values) as WidgetEditorFormValues;
  if (result.values) {
    form.setValues(result.values as any, false);
  }
  emit('submit', {
    base: { ...(values.base as any) },
    custom: { ...(values.custom as any) },
  });
  activeStep.value = 1;
};

const validateAndNext = async () => {
  const result = await form.validate();
  if (!result.valid) {
    await handleValidationFailed();
    return;
  }
  if (result.values) {
    form.setValues(result.values as any, false);
  }
  activeStep.value = 2;
};

const cancel = () => {
  activeStep.value = 1;
  form.resetForm();
  emit('cancel');
};
</script>

<template>
  <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
    <Stepper v-model="activeStep" class="w-full gap-3">
      <StepperItem v-for="(step, idx) in stepList" :key="step.title" :step="idx + 1" class="flex-1">
        <StepperTrigger
          class="border-border/45 bg-background/25 hover:bg-background/35 w-full flex-row items-center justify-start gap-3 rounded-2xl border px-3 py-2 text-left transition"
        >
          <StepperIndicator class="border-border bg-background text-foreground border">
            {{ idx + 1 }}
          </StepperIndicator>
          <div class="flex flex-col">
            <StepperTitle class="text-foreground text-sm font-medium">{{ step.title }}</StepperTitle>
            <StepperDescription v-if="step.description" class="text-muted-foreground text-xs">
              {{ step.description }}
            </StepperDescription>
          </div>
        </StepperTrigger>
        <StepperSeparator v-if="idx < stepList.length - 1" class="bg-border/70 w-10" />
      </StepperItem>
    </Stepper>

    <ScrollArea type="scroll" class="min-h-0 pr-3">
      <div class="space-y-4">
        <div v-if="activeStep === 1">
          <WidgetSettingsForm :allow-type-pick="props.allowTypePick" />
        </div>

        <div v-if="hasCustomForm && activeStep === 2">
          <component :is="currentDefinition.formComponent" :key="selectedType" />
        </div>
      </div>
    </ScrollArea>

    <div class="flex items-center justify-between pt-2">
      <Button v-if="props.showCancel" data-tour="widget-editor-cancel" variant="outline" type="button" @click="cancel">
        {{ props.cancelLabel }}
      </Button>
      <div v-else></div>
      <div class="flex items-center gap-2">
        <Button v-if="hasCustomForm && activeStep === 2" variant="outline" type="button" @click="goPrevStep">
          上一步
        </Button>
        <Button data-tour="widget-editor-primary" type="button" @click="handlePrimary">
          {{ primaryLabel }}
        </Button>
      </div>
    </div>
  </div>
</template>
