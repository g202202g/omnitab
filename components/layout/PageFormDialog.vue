<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import IconPicker from '@/components/ui/icon/IconPicker.vue';
import type { PageInfo } from '@/composables/usePageStore';
import { DEFAULT_ICON_NAME, normalizeIconName } from '@/lib/iconify';
import { DEFAULT_BG_IMAGE_URL } from '@/composables/usePageStore';

const props = defineProps<{
  open: boolean;
  page: PageInfo | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  create: [payload?: { name?: string; icon?: string; bgValue?: string; bgMask?: number }];
  save: [
    payload: {
      id: string;
      name: string;
      icon?: string;
      bgValue?: string;
      bgMask?: number;
    },
  ];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const mode = computed<'create' | 'edit'>(() => (props.page ? 'edit' : 'create'));

const formName = ref('');
const formIcon = ref(DEFAULT_ICON_NAME);
const formBgValue = ref(DEFAULT_BG_IMAGE_URL);
const formBgMask = ref(0.35);
const submitAttempted = ref(false);
const nameTouched = ref(false);
const bgValueTouched = ref(false);

const trimmedName = computed(() => formName.value.trim());
const trimmedBgValue = computed(() => formBgValue.value.trim());

const isAllowedUrl = (value: string, allowProtocols: readonly string[]) => {
  try {
    const url = new URL(value);
    return allowProtocols.includes(url.protocol.toLowerCase());
  } catch {
    return false;
  }
};

const rawNameError = computed(() => {
  if (mode.value === 'edit' && !trimmedName.value) return '标题不能为空';
  if (trimmedName.value && trimmedName.value.length > 20) return '标题最多 20 个字符';
  return '';
});

const rawBgValueError = computed(() => {
  const value = trimmedBgValue.value;
  if (!value) return '';
  if (isAllowedUrl(value, ['https:', 'http:', 'data:'])) return '';
  return '背景图片链接看起来不太对，建议直接从浏览器地址栏复制完整链接。';
});

const nameError = computed(() => (submitAttempted.value || nameTouched.value ? rawNameError.value : ''));
const bgValueError = computed(() => (submitAttempted.value || bgValueTouched.value ? rawBgValueError.value : ''));

const formBgMaskArray = computed({
  get: () => [formBgMask.value],
  set: (val: number[]) => {
    const n = Array.isArray(val) ? val[0] : 0;
    formBgMask.value = Math.min(Math.max(Number(n) || 0, 0), 1);
  },
});

const resetToCreateDefaults = () => {
  formName.value = '';
  formIcon.value = DEFAULT_ICON_NAME;
  formBgValue.value = DEFAULT_BG_IMAGE_URL;
  formBgMask.value = 0.35;
  submitAttempted.value = false;
  nameTouched.value = false;
  bgValueTouched.value = false;
};

const fillFromPage = (page: PageInfo) => {
  formName.value = page.name;
  formIcon.value = normalizeIconName(page.icon, DEFAULT_ICON_NAME);
  formBgValue.value = page.bgValue ?? DEFAULT_BG_IMAGE_URL;
  formBgMask.value = Math.min(Math.max(typeof page.bgMask === 'number' ? page.bgMask : 0.35, 0), 1);
  submitAttempted.value = false;
  nameTouched.value = false;
  bgValueTouched.value = false;
};

watch(
  () => [props.open, props.page] as const,
  ([isOpen, page]) => {
    if (!isOpen) return;
    submitAttempted.value = false;
    nameTouched.value = false;
    bgValueTouched.value = false;
    if (page) fillFromPage(page);
    else resetToCreateDefaults();
  },
  { immediate: true },
);

const closeDialog = () => {
  dialogOpen.value = false;
};

const handleSubmit = () => {
  submitAttempted.value = true;
  if (rawNameError.value || rawBgValueError.value) return;

  if (mode.value === 'edit') {
    if (!props.page) return;
    emit('save', {
      id: props.page.id,
      name: trimmedName.value,
      icon: normalizeIconName(formIcon.value, DEFAULT_ICON_NAME),
      bgValue: trimmedBgValue.value,
      bgMask: formBgMask.value,
    });
    closeDialog();
    return;
  }

  emit('create', {
    name: trimmedName.value || undefined,
    icon: normalizeIconName(formIcon.value, DEFAULT_ICON_NAME),
    bgValue: trimmedBgValue.value,
    bgMask: formBgMask.value,
  });
  resetToCreateDefaults();
  closeDialog();
};
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent data-tour="page-dialog" class="border-border bg-popover text-popover-foreground border shadow-2xl">
      <DialogHeader>
        <DialogTitle>{{ mode === 'create' ? '新建页面' : '编辑页面' }}</DialogTitle>
      </DialogHeader>
      <FieldGroup class="gap-4">
        <Field :data-invalid="!!nameError">
          <FieldLabel>标题</FieldLabel>
          <FieldContent>
            <Input
              data-tour="page-dialog-title"
              v-model="formName"
              name="pageTitle"
              placeholder="输入页面标题"
              class="border-input bg-background"
              @blur="nameTouched = true"
            />
          </FieldContent>
          <FieldError v-if="nameError" :errors="[nameError]" class="text-xs" />
        </Field>

        <Field>
          <FieldLabel>图标</FieldLabel>
          <FieldContent>
            <IconPicker v-model="formIcon" :search-all-prefixes="true" class="w-full" />
          </FieldContent>
        </Field>

        <Field :data-invalid="!!bgValueError">
          <FieldLabel>背景</FieldLabel>
          <FieldContent class="gap-2">
            <Input
              v-model="formBgValue"
              name="pageBackground"
              placeholder="输入背景图片地址"
              class="border-input bg-background"
              @blur="bgValueTouched = true"
            />
            <FieldDescription>留空将不使用图片背景。</FieldDescription>
            <FieldError v-if="bgValueError" :errors="[bgValueError]" class="text-xs" />
            <div class="space-y-1 pt-1">
              <div class="text-muted-foreground flex items-center justify-between text-xs">
                <span>遮罩透明度</span>
                <span>{{ (formBgMask * 100).toFixed(0) }}%</span>
              </div>
              <div class="px-1">
                <Slider v-model="formBgMaskArray" :min="0" :max="1" :step="0.02" class="mt-1" />
              </div>
            </div>
          </FieldContent>
        </Field>
      </FieldGroup>
      <DialogFooter class="pt-2 sm:justify-between">
        <Button data-tour="page-dialog-cancel" variant="outline" @click="closeDialog">取消</Button>
        <Button data-tour="page-dialog-submit" variant="default" @click="handleSubmit">
          {{ mode === 'create' ? '创建' : '保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
