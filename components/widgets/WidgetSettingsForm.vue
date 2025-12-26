<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field as UiField,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import IconPicker from '@/components/ui/icon/IconPicker.vue';
import { computed, inject, ref, watch } from 'vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { resolveWidgetDefinition, widgetDefinitions, DEFAULT_WIDGET_TYPE } from './registry';
import type { WidgetType } from './types';
import { Field as VeeField, useFormContext } from 'vee-validate';
import type { WidgetEditorFormValues } from './widgetFormSchema';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from './widgetEditorValidationGate';
import { ChevronDown } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    allowTypePick?: boolean;
  }>(),
  {
    allowTypePick: false,
  },
);

const validateOnInteraction = inject(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, ref(true));
const { values, setFieldValue } = useFormContext<WidgetEditorFormValues>();

const widgetOptions = computed(() => Object.values(widgetDefinitions));
const normalizedWidgetOptions = computed(() =>
  widgetOptions.value.map((option) => {
    const keywords = [option.type, option.title, option.description, option.defaults?.name]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    return { ...option, keywords };
  }),
);
const widgetTypeKeyword = ref('');
const trimmedWidgetTypeKeyword = computed(() => widgetTypeKeyword.value.trim().toLowerCase());
const widgetTypeMenuOpen = ref(false);
const widgetTypeTriggerRef = ref<HTMLInputElement | null>(null);
const widgetTypeMenuStyle = ref<Record<string, string>>({});

const selectedType = computed(() => (values.base?.type as WidgetType | undefined) ?? DEFAULT_WIDGET_TYPE);
const selectedTypeMeta = computed(() => resolveWidgetDefinition(selectedType.value));
const filteredWidgetOptions = computed(() => {
  const q = trimmedWidgetTypeKeyword.value;
  if (!q) return normalizedWidgetOptions.value;
  return normalizedWidgetOptions.value.filter((option) => option.keywords.some((word) => word.includes(q)));
});
const resolvedName = computed(
  () =>
    String(values.base?.title ?? '').trim() ||
    resolveWidgetDefinition(selectedType.value).defaults.name ||
    resolveWidgetDefinition(selectedType.value).title,
);

const showTitle = computed({
  get: () => (values.base?.showTitle as boolean | undefined) ?? true,
  set: (val) => setFieldValue('base.showTitle', !!val),
});

const showBackground = computed({
  get: () => (values.base?.showBackground as boolean | undefined) ?? true,
  set: (val) => setFieldValue('base.showBackground', !!val),
});

const showBorder = computed({
  get: () => (values.base?.showBorder as boolean | undefined) ?? true,
  set: (val) => setFieldValue('base.showBorder', !!val),
});

const displayOptionIdPrefix = `widget-display-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const showTitleCheckboxId = `${displayOptionIdPrefix}-show-title`;
const showTitleLabelId = `${displayOptionIdPrefix}-show-title-label`;
const showBackgroundCheckboxId = `${displayOptionIdPrefix}-show-background`;
const showBackgroundLabelId = `${displayOptionIdPrefix}-show-background-label`;
const showBorderCheckboxId = `${displayOptionIdPrefix}-show-border`;
const showBorderLabelId = `${displayOptionIdPrefix}-show-border-label`;

const closeWidgetTypeMenu = () => {
  widgetTypeMenuOpen.value = false;
  widgetTypeKeyword.value = '';
};

const preventAutoFocus = (event: Event) => {
  event.preventDefault();
};

const selectWidgetType = (type: string) => {
  setFieldValue('base.type', type, validateOnInteraction.value);
  closeWidgetTypeMenu();
};

watch(
  () => widgetTypeMenuOpen.value,
  (open) => {
    if (!open) return;
    const width = widgetTypeTriggerRef.value?.getBoundingClientRect().width;
    widgetTypeMenuStyle.value = width ? { width: `${width}px` } : {};
  },
);
</script>

<template>
  <FieldGroup class="grid gap-4">
    <VeeField
      v-if="allowTypePick"
      name="base.type"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel>卡片类型</FieldLabel>
        <FieldContent>
          <DropdownMenu v-model:open="widgetTypeMenuOpen" :modal="false">
            <div class="relative">
              <DropdownMenuTrigger as-child :disabled="true">
                <div>
                  <input
                    ref="widgetTypeTriggerRef"
                    v-model="widgetTypeKeyword"
                    data-slot="input"
                    type="search"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="`当前：${selectedTypeMeta.title}（输入筛选）`"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 pr-10 pl-12 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-[3px] focus-visible:outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    @focus="widgetTypeMenuOpen = true"
                    @input="widgetTypeMenuOpen = true"
                    @keydown.esc.stop.prevent="closeWidgetTypeMenu"
                  />
                </div>
              </DropdownMenuTrigger>

              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span
                  class="border-border/60 bg-muted/25 text-foreground grid h-7 w-7 place-items-center rounded-xl border text-[11px] font-semibold"
                  aria-hidden="true"
                >
                  {{ selectedTypeMeta.title.slice(0, 1) }}
                </span>
              </div>

              <button
                type="button"
                class="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3 transition"
                aria-label="展开卡片类型选择"
                title="展开卡片类型选择"
                @click.stop.prevent="widgetTypeMenuOpen ? closeWidgetTypeMenu() : (widgetTypeMenuOpen = true)"
              >
                <ChevronDown class="h-4 w-4" :class="widgetTypeMenuOpen ? 'text-primary rotate-180' : ''" />
              </button>
            </div>

            <DropdownMenuContent
              align="start"
              side="bottom"
              :side-offset="8"
              :style="widgetTypeMenuStyle"
              class="border-border bg-popover/98 text-popover-foreground overflow-hidden rounded-2xl border p-2 shadow-2xl"
              @open-auto-focus="preventAutoFocus"
              @close-auto-focus="preventAutoFocus"
            >
              <div class="space-y-2">
                <div
                  class="text-muted-foreground/70 flex items-center justify-between px-1 text-[11px] font-medium tracking-wide uppercase"
                >
                  <span>可选卡片</span>
                  <span>{{ filteredWidgetOptions.length }}</span>
                </div>

                <div class="border-border/50 bg-background/90 rounded-xl border shadow-inner">
                  <ScrollArea class="grid h-[280px] overscroll-contain">
                    <div class="grid grid-cols-2 gap-2 p-2 pr-1 pb-4">
                      <DropdownMenuItem
                        v-for="option in filteredWidgetOptions"
                        :key="option.type"
                        class="border-border/60 bg-background/30 text-foreground hover:bg-background/45 focus:bg-accent/30 focus:text-foreground w-full flex-col items-start gap-2 rounded-2xl border p-3 text-left transition"
                        :class="option.type === selectedType ? 'border-ring/50 bg-accent/30' : ''"
                        @select="() => selectWidgetType(option.type)"
                      >
                        <div class="flex w-full items-center gap-2">
                          <div
                            class="bg-secondary text-secondary-foreground grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                          >
                            <span class="text-sm font-semibold">{{ option.title.slice(0, 1) }}</span>
                          </div>
                          <div class="min-w-0 flex-1">
                            <div class="text-foreground line-clamp-1 text-sm font-semibold">
                              {{ option.title }}
                            </div>
                            <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span
                                class="bg-muted/60 text-muted-foreground rounded-full px-2 py-[2px] text-[11px] tabular-nums"
                              >
                                {{ option.defaults.w }}×{{ option.defaults.h }}
                              </span>
                              <span class="bg-muted/40 text-muted-foreground rounded-full px-2 py-[2px] text-[11px]">
                                {{ option.type }}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p class="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                          {{ option.description }}
                        </p>
                      </DropdownMenuItem>

                      <p
                        v-if="!filteredWidgetOptions.length"
                        class="text-muted-foreground col-span-2 py-8 text-center text-xs"
                      >
                        暂无匹配结果
                      </p>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </FieldContent>
        <FieldDescription>创建后仍可在卡片设置中修改类型与显示选项。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="base.title"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors: titleErrors }"
    >
      <VeeField
        name="base.icon"
        :validate-on-blur="true"
        :validate-on-change="validateOnInteraction"
        :validate-on-input="validateOnInteraction"
        :validate-on-model-update="validateOnInteraction"
        v-slot="{ value: iconValue, handleChange: handleIconChange, errors: iconErrors }"
      >
        <UiField :data-invalid="!!titleErrors.length || !!iconErrors.length">
          <FieldLabel for="widget-title">卡片标题</FieldLabel>
          <FieldContent>
            <div class="flex items-start gap-2">
              <div class="w-[220px] max-w-[45%] shrink-0">
                <IconPicker
                  :model-value="(iconValue as any) ?? ''"
                  allow-empty
                  :search-all-prefixes="true"
                  class="w-full"
                  @update:modelValue="(val) => handleIconChange(val, validateOnInteraction)"
                />
              </div>
              <Input
                id="widget-title"
                v-bind="componentField"
                class="border-input bg-background text-foreground min-w-0 flex-1"
                :placeholder="resolvedName"
                maxlength="40"
              />
            </div>
          </FieldContent>
          <FieldDescription>图标在前、标题在后；标题可留空（仅展示图标）。</FieldDescription>
          <FieldError v-if="titleErrors.length" :errors="titleErrors" class="text-xs" />
          <FieldError v-else-if="iconErrors.length" :errors="iconErrors" class="text-xs" />
        </UiField>
      </VeeField>
    </VeeField>

    <VeeField
      name="base.description"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="widget-desc">卡片描述（可选）</FieldLabel>
        <FieldContent>
          <Input
            id="widget-desc"
            v-bind="componentField"
            class="border-input bg-background text-foreground"
            placeholder="一句话说明这个卡片做什么"
            maxlength="200"
          />
        </FieldContent>
        <FieldDescription>会显示在标题下方（若开启“显示标题”）。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>
    <UiField>
      <FieldLabel>显示选项</FieldLabel>
      <FieldContent class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <UiField orientation="horizontal">
          <FieldContent class="flex-none flex-row items-center justify-end gap-2">
            <VeeField
              name="base.showTitle"
              type="checkbox"
              :validate-on-blur="true"
              :validate-on-change="validateOnInteraction"
              :validate-on-input="validateOnInteraction"
              :validate-on-model-update="validateOnInteraction"
              v-slot="{ value, handleChange }"
            >
              <Checkbox
                :aria-labelledby="showTitleLabelId"
                :model-value="(value as any) ?? showTitle"
                class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
              />
              <FieldLabel
                :id="showTitleLabelId"
                class="cursor-pointer select-none"
                @click="() => handleChange(!((value as any) ?? showTitle), validateOnInteraction)"
              >
                显示标题
              </FieldLabel>
            </VeeField>
          </FieldContent>
        </UiField>
        <UiField orientation="horizontal">
          <FieldContent class="flex-none flex-row items-center justify-end gap-2">
            <VeeField
              name="base.showBackground"
              type="checkbox"
              :validate-on-blur="true"
              :validate-on-change="validateOnInteraction"
              :validate-on-input="validateOnInteraction"
              :validate-on-model-update="validateOnInteraction"
              v-slot="{ value, handleChange }"
            >
              <Checkbox
                :aria-labelledby="showBackgroundLabelId"
                :model-value="(value as any) ?? showBackground"
                class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
              />
              <FieldLabel
                :id="showBackgroundLabelId"
                class="cursor-pointer select-none"
                @click="() => handleChange(!((value as any) ?? showBackground), validateOnInteraction)"
              >
                显示背景
              </FieldLabel>
            </VeeField>
          </FieldContent>
        </UiField>

        <UiField orientation="horizontal">
          <FieldContent class="flex-none flex-row items-center justify-end gap-2">
            <VeeField
              name="base.showBorder"
              type="checkbox"
              :validate-on-blur="true"
              :validate-on-change="validateOnInteraction"
              :validate-on-input="validateOnInteraction"
              :validate-on-model-update="validateOnInteraction"
              v-slot="{ value, handleChange }"
            >
              <Checkbox
                :aria-labelledby="showBorderLabelId"
                :model-value="(value as any) ?? showBorder"
                class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
              />
              <FieldLabel
                :id="showBorderLabelId"
                class="cursor-pointer select-none"
                @click="() => handleChange(!((value as any) ?? showBorder), validateOnInteraction)"
              >
                显示边框
              </FieldLabel>
            </VeeField>
          </FieldContent>
        </UiField>
      </FieldContent>
    </UiField>
  </FieldGroup>
</template>
