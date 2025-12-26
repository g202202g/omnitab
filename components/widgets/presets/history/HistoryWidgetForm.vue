<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import OptionalPermissionField from '@/components/widgets/common/OptionalPermissionField.vue';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import { Field as VeeField, useFormContext } from 'vee-validate';
import type { WidgetEditorFormValues } from '@/components/widgets/widgetFormSchema';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from '@/components/widgets/widgetEditorValidationGate';

const validateOnInteraction = inject(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, ref(true));
const { values, setFieldValue } = useFormContext<WidgetEditorFormValues>();
const PERMISSION_FIELD = 'custom.__permissionGranted' as const;

const showFavicon = computed<boolean>({
  get: () => ((values.custom as any)?.showFavicon ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showFavicon' as any, !!val);
  },
});

const showTime = computed<boolean>({
  get: () => ((values.custom as any)?.showTime ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showTime' as any, !!val);
  },
});

const displayMode = computed<'default' | 'icon-only'>({
  get: () => {
    const raw = (values.custom as any)?.displayMode;
    return raw === 'icon-only' ? 'icon-only' : 'default';
  },
  set: (val) => {
    setFieldValue('custom.displayMode' as any, val === 'icon-only' ? 'icon-only' : 'default');
  },
});

const displayOptionIdPrefix = `history-display-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const showFaviconCheckboxId = `${displayOptionIdPrefix}-show-favicon`;
const showFaviconLabelId = `${displayOptionIdPrefix}-show-favicon-label`;
const showTimeCheckboxId = `${displayOptionIdPrefix}-show-time`;
const showTimeLabelId = `${displayOptionIdPrefix}-show-time-label`;

const perm = useOptionalPermission();
const permissionRequired = ref(false);
const requestingPermission = ref(false);
const revokingPermission = ref(false);

const checkHistoryPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionRequired.value = false;
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  const ok = await perm.contains({ permissions: ['history'] });
  permissionRequired.value = !ok;
  setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
  return ok;
};

const requestHistoryPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionRequired.value = false;
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  requestingPermission.value = true;
  try {
    const ok = await perm.request({ permissions: ['history'] });
    permissionRequired.value = !ok;
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-history-permission-changed'));
    }
    return ok;
  } finally {
    requestingPermission.value = false;
  }
};

const revokeHistoryPermission = async () => {
  if (!perm.isSupported) return true;
  revokingPermission.value = true;
  try {
    const ok = await perm.remove({ permissions: ['history'] });
    await checkHistoryPermission();
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-history-permission-changed'));
    }
    return ok;
  } finally {
    revokingPermission.value = false;
  }
};

onMounted(() => {
  void checkHistoryPermission();
});
</script>

<template>
  <FieldGroup class="grid gap-4">
    <OptionalPermissionField
      :name="PERMISSION_FIELD"
      label="访问授权"
      :status-text="permissionRequired ? '需要先开启浏览记录访问授权' : '已开启浏览记录访问授权'"
      description-text="开启后才能在卡片里展示最近访问过的网页。"
      :validate-on-interaction="validateOnInteraction"
      :show-request="permissionRequired"
      request-text="开启"
      :requesting="requestingPermission"
      :show-revoke="!permissionRequired"
      revoke-text="关闭"
      :revoking="revokingPermission"
      :check-disabled="requestingPermission"
      @request="requestHistoryPermission"
      @revoke="revokeHistoryPermission"
      @check="checkHistoryPermission"
    />

    <VeeField
      name="custom.daysRange"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="history-days">时间范围（天）</FieldLabel>
        <FieldContent>
          <Input id="history-days" v-bind="componentField" type="number" min="1" max="365" step="1" class="h-10" />
        </FieldContent>
        <FieldDescription>仅展示最近 N 天的历史记录，范围越小越省性能。</FieldDescription>
        <FieldDescription class="text-muted-foreground text-xs"
          >如果列表为空，通常是还没开启访问授权。</FieldDescription
        >
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="custom.maxItems"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="history-max">每次加载数量</FieldLabel>
        <FieldContent>
          <Input id="history-max" v-bind="componentField" type="number" min="1" max="200" step="1" class="h-10" />
        </FieldContent>
        <FieldDescription>滚动触底时会按该数量继续加载，不再限制总条数。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <UiField>
      <FieldLabel>显示选项</FieldLabel>
      <FieldContent class="text-foreground grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <VeeField
          name="custom.showFavicon"
          type="checkbox"
          :validate-on-blur="true"
          :validate-on-change="validateOnInteraction"
          :validate-on-input="validateOnInteraction"
          :validate-on-model-update="validateOnInteraction"
          v-slot="{ value, handleChange }"
        >
          <UiField orientation="horizontal" class="gap-2">
            <Checkbox
              :aria-labelledby="showFaviconLabelId"
              :model-value="(value as any) ?? showFavicon"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :id="showFaviconLabelId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showFavicon), validateOnInteraction)"
            >
              显示站点图标（若可用）
            </FieldLabel>
          </UiField>
        </VeeField>

        <VeeField
          name="custom.showTime"
          type="checkbox"
          :validate-on-blur="true"
          :validate-on-change="validateOnInteraction"
          :validate-on-input="validateOnInteraction"
          :validate-on-model-update="validateOnInteraction"
          v-slot="{ value, handleChange }"
        >
          <UiField orientation="horizontal" class="gap-2">
            <Checkbox
              :id="showTimeCheckboxId"
              :aria-labelledby="showTimeLabelId"
              :model-value="(value as any) ?? showTime"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :id="showTimeLabelId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showTime), validateOnInteraction)"
            >
              显示访问时间
            </FieldLabel>
          </UiField>
        </VeeField>
      </FieldContent>
    </UiField>

    <UiField>
      <FieldLabel>显示模式</FieldLabel>
      <FieldContent>
        <Select v-model="displayMode">
          <SelectTrigger class="h-10">
            <SelectValue placeholder="请选择显示模式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">列表</SelectItem>
            <SelectItem value="icon-only">仅图标</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
      <FieldDescription>“仅图标”会在卡片内以图标格展示，具体链接/时间在悬浮提示中查看。</FieldDescription>
    </UiField>
  </FieldGroup>
</template>
