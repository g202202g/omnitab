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

const displayOptionIdPrefix = `sessions-display-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const showFaviconCheckboxId = `${displayOptionIdPrefix}-show-favicon`;
const showFaviconLabelId = `${displayOptionIdPrefix}-show-favicon-label`;

const displayMode = computed<'default' | 'icon-only'>({
  get: () => {
    const raw = (values.custom as any)?.displayMode;
    return raw === 'icon-only' ? 'icon-only' : 'default';
  },
  set: (val) => {
    setFieldValue('custom.displayMode' as any, val === 'icon-only' ? 'icon-only' : 'default');
  },
});

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
  const ok = await perm.contains({ permissions: ['sessions'] });
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
    const ok = await perm.request({ permissions: ['sessions'] });
    permissionRequired.value = !ok;
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-sessions-permission-changed'));
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
    const ok = await perm.remove({ permissions: ['sessions'] });
    await checkPermission();
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-sessions-permission-changed'));
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
      :status-text="permissionRequired ? '需要先开启“最近关闭”访问授权' : '已开启“最近关闭”访问授权'"
      description-text="开启后可以显示最近关闭的标签页，方便一键恢复。"
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
        <FieldLabel for="sessions-max">显示数量</FieldLabel>
        <FieldContent>
          <Input id="sessions-max" v-bind="componentField" type="number" min="5" max="50" step="1" class="h-10" />
        </FieldContent>
        <FieldDescription>展示最近关闭的 N 条会话记录。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <UiField>
      <FieldLabel>显示选项</FieldLabel>
      <FieldContent class="text-foreground grid grid-cols-1 gap-2 text-sm">
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
              :id="showFaviconCheckboxId"
              :aria-labelledby="showFaviconLabelId"
              :model-value="(value as any) ?? showFavicon"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :for="showFaviconCheckboxId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showFavicon), validateOnInteraction)"
            >
              显示站点图标（仅标签页）
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
