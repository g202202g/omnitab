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
import OptionalPermissionField from '@/components/widgets/common/OptionalPermissionField.vue';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import { Field as VeeField, useFormContext } from 'vee-validate';
import type { WidgetEditorFormValues } from '@/components/widgets/widgetFormSchema';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from '@/components/widgets/widgetEditorValidationGate';

const validateOnInteraction = inject(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, ref(true));
const { values, setFieldValue } = useFormContext<WidgetEditorFormValues>();
const PERMISSION_FIELD = 'custom.__permissionGranted' as const;

const showUrl = computed<boolean>({
  get: () => ((values.custom as any)?.showUrl ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showUrl' as any, !!val);
  },
});

const displayOptionIdPrefix = `downloads-display-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const showUrlCheckboxId = `${displayOptionIdPrefix}-show-url`;
const showUrlLabelId = `${displayOptionIdPrefix}-show-url-label`;

const perm = useOptionalPermission();
const permissionRequired = ref(false);
const requestingPermission = ref(false);
const revokingPermission = ref(false);

const checkPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionRequired.value = false;
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  const ok = await perm.contains({ permissions: ['downloads'] });
  permissionRequired.value = !ok;
  setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
  return ok;
};

const requestPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionRequired.value = false;
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  requestingPermission.value = true;
  try {
    const ok = await perm.request({ permissions: ['downloads'] });
    permissionRequired.value = !ok;
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-downloads-permission-changed'));
    }
    return ok;
  } finally {
    requestingPermission.value = false;
  }
};

const revokePermission = async () => {
  if (!perm.isSupported) return true;
  revokingPermission.value = true;
  try {
    const ok = await perm.remove({ permissions: ['downloads'] });
    await checkPermission();
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-downloads-permission-changed'));
    }
    return ok;
  } finally {
    revokingPermission.value = false;
  }
};

onMounted(() => {
  void checkPermission();
});
</script>

<template>
  <FieldGroup class="grid gap-4">
    <OptionalPermissionField
      :name="PERMISSION_FIELD"
      label="访问授权"
      :status-text="permissionRequired ? '需要先开启下载列表访问授权' : '已开启下载列表访问授权'"
      description-text="开启后可以查看下载进度，并进行暂停/继续/取消等操作。"
      :validate-on-interaction="validateOnInteraction"
      :show-request="permissionRequired"
      request-text="开启"
      :requesting="requestingPermission"
      :show-revoke="!permissionRequired"
      revoke-text="关闭"
      :revoking="revokingPermission"
      :check-disabled="requestingPermission"
      @request="requestPermission"
      @revoke="revokePermission"
      @check="checkPermission"
    />

    <VeeField
      name="custom.maxItems"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="downloads-max">显示数量</FieldLabel>
        <FieldContent>
          <Input id="downloads-max" v-bind="componentField" type="number" min="5" max="200" step="1" class="h-10" />
        </FieldContent>
        <FieldDescription>展示最近 N 条下载任务（按开始时间倒序）。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="custom.autoRefreshSeconds"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="downloads-auto">自动刷新（秒）</FieldLabel>
        <FieldContent>
          <Input id="downloads-auto" v-bind="componentField" type="number" min="0" max="60" step="1" class="h-10" />
        </FieldContent>
        <FieldDescription>设置为 0 表示关闭自动刷新；建议 3～10 秒。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="custom.state"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="downloads-state">状态筛选</FieldLabel>
        <FieldContent>
          <select
            id="downloads-state"
            v-bind="componentField"
            class="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-hidden"
          >
            <option value="in_progress">进行中</option>
            <option value="complete">已完成</option>
            <option value="interrupted">失败/中断</option>
            <option value="all">全部</option>
          </select>
        </FieldContent>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <UiField>
      <FieldLabel>显示选项</FieldLabel>
      <FieldContent class="text-foreground grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <VeeField
          name="custom.showUrl"
          type="checkbox"
          :validate-on-blur="true"
          :validate-on-change="validateOnInteraction"
          :validate-on-input="validateOnInteraction"
          :validate-on-model-update="validateOnInteraction"
          v-slot="{ value, handleChange }"
        >
          <UiField orientation="horizontal" class="gap-2">
            <Checkbox
              :aria-labelledby="showUrlLabelId"
              :model-value="(value as any) ?? showUrl"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :id="showUrlLabelId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showUrl), validateOnInteraction)"
            >
              显示下载来源链接（若可用）
            </FieldLabel>
          </UiField>
        </VeeField>
      </FieldContent>
    </UiField>
  </FieldGroup>
</template>
