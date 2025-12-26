<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field as UiField,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import OptionalPermissionField from '@/components/widgets/common/OptionalPermissionField.vue';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import { SYSTEM_PERMISSIONS, type SystemPermission } from './systemInfo';
import { Field as VeeField, useFormContext } from 'vee-validate';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from '@/components/widgets/widgetEditorValidationGate';
import type { WidgetEditorFormValues } from '@/components/widgets/widgetFormSchema';

const perm = useOptionalPermission();
const permissionSupported = computed(() => perm.isSupported);
const requesting = ref(false);
const revoking = ref(false);

const validateOnInteraction = inject(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, ref(true));
const { values, setFieldValue } = useFormContext<WidgetEditorFormValues>();
const PERMISSION_FIELD = 'custom.__permissionGranted' as const;

const showCpu = computed<boolean>({
  get: () => ((values.custom as any)?.showCpu ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showCpu' as any, !!val);
  },
});

const showBattery = computed<boolean>({
  get: () => ((values.custom as any)?.showBattery ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showBattery' as any, !!val);
  },
});

const showMemory = computed<boolean>({
  get: () => ((values.custom as any)?.showMemory ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showMemory' as any, !!val);
  },
});

const moduleOptionIdPrefix = `system-modules-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const showBatteryCheckboxId = `${moduleOptionIdPrefix}-show-battery`;
const showBatteryLabelId = `${moduleOptionIdPrefix}-show-battery-label`;
const showCpuCheckboxId = `${moduleOptionIdPrefix}-show-cpu`;
const showCpuLabelId = `${moduleOptionIdPrefix}-show-cpu-label`;
const showMemoryCheckboxId = `${moduleOptionIdPrefix}-show-memory`;
const showMemoryLabelId = `${moduleOptionIdPrefix}-show-memory-label`;

const requestedPermissions = computed<SystemPermission[]>(() => {
  const list: SystemPermission[] = [];
  if (showCpu.value) list.push('system.cpu');
  if (showMemory.value) list.push('system.memory');
  return list;
});

const permissionMap = ref<Record<SystemPermission, boolean>>({
  'system.cpu': false,
  'system.memory': false,
});

const permissionRequired = computed(() => requestedPermissions.value.some((p) => !permissionMap.value[p]));

const permissionStatusText = computed(() => {
  if (!permissionSupported.value) return '当前浏览器暂不支持此授权';
  if (!requestedPermissions.value.length) return '未选择需要展示的内容：无需开启授权';
  if (permissionRequired.value) return '尚未开启：将只展示基础信息';
  return '已开启：可展示更详细的信息';
});

const permissionDetailsText = computed(() => {
  if (!requestedPermissions.value.length) return '—';
  return '你可以按需开启授权来显示更详细的数据；不开启也能正常使用基础展示。';
});

const showPermissionRequest = computed(
  () => permissionSupported.value && requestedPermissions.value.length > 0 && permissionRequired.value,
);
const showPermissionRevoke = computed(
  () => permissionSupported.value && requestedPermissions.value.length > 0 && !permissionRequired.value,
);
const showPermissionCheck = computed(() => permissionSupported.value);

const checkPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionMap.value = {
      'system.cpu': false,
      'system.memory': false,
    };
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  const next: Record<SystemPermission, boolean> = { ...permissionMap.value };
  for (const p of SYSTEM_PERMISSIONS) {
    next[p] = await perm.contains({ permissions: [p] });
  }
  permissionMap.value = next;
  const ok = requestedPermissions.value.length ? !requestedPermissions.value.some((p) => !next[p]) : true;
  setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
  return ok;
};

const requestPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  if (!requestedPermissions.value.length) {
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  requesting.value = true;
  try {
    const ok = await perm.request({ permissions: [...requestedPermissions.value] });
    const verified = await checkPermission();
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-system-permission-changed'));
    }
    return ok && verified;
  } finally {
    requesting.value = false;
  }
};

const revokePermission = async () => {
  if (!perm.isSupported) return true;
  revoking.value = true;
  try {
    const ok = await perm.remove({ permissions: [...SYSTEM_PERMISSIONS] });
    await checkPermission();
    if (ok) {
      window.dispatchEvent(new CustomEvent('codex-system-permission-changed'));
    }
    return ok;
  } finally {
    revoking.value = false;
  }
};

onMounted(() => {
  void checkPermission();
});

watch(
  () => [showCpu.value, showMemory.value] as const,
  () => {
    void checkPermission();
  },
);
</script>

<template>
  <FieldGroup class="grid gap-4">
    <UiField>
      <FieldLabel>显示模块</FieldLabel>
      <FieldContent class="text-foreground grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <VeeField
          name="custom.showBattery"
          type="checkbox"
          :validate-on-blur="true"
          :validate-on-change="validateOnInteraction"
          :validate-on-input="validateOnInteraction"
          :validate-on-model-update="validateOnInteraction"
          v-slot="{ value, handleChange }"
        >
          <UiField orientation="horizontal" class="gap-2">
            <Checkbox
              :aria-labelledby="showBatteryLabelId"
              :model-value="(value as any) ?? showBattery"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :id="showBatteryLabelId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showBattery), validateOnInteraction)"
            >
              电池
            </FieldLabel>
          </UiField>
        </VeeField>

        <VeeField
          name="custom.showCpu"
          type="checkbox"
          :validate-on-blur="true"
          :validate-on-change="validateOnInteraction"
          :validate-on-input="validateOnInteraction"
          :validate-on-model-update="validateOnInteraction"
          v-slot="{ value, handleChange }"
        >
          <UiField orientation="horizontal" class="gap-2">
            <Checkbox
              :aria-labelledby="showCpuLabelId"
              :model-value="(value as any) ?? showCpu"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :id="showCpuLabelId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showCpu), validateOnInteraction)"
            >
              CPU
            </FieldLabel>
          </UiField>
        </VeeField>

        <VeeField
          name="custom.showMemory"
          type="checkbox"
          :validate-on-blur="true"
          :validate-on-change="validateOnInteraction"
          :validate-on-input="validateOnInteraction"
          :validate-on-model-update="validateOnInteraction"
          v-slot="{ value, handleChange }"
        >
          <UiField orientation="horizontal" class="gap-2">
            <Checkbox
              :aria-labelledby="showMemoryLabelId"
              :model-value="(value as any) ?? showMemory"
              class="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              @update:modelValue="(val) => handleChange(!!val, validateOnInteraction)"
            />
            <FieldLabel
              :id="showMemoryLabelId"
              class="cursor-pointer select-none"
              @click="() => handleChange(!((value as any) ?? showMemory), validateOnInteraction)"
            >
              系统内存
            </FieldLabel>
          </UiField>
        </VeeField>
      </FieldContent>
      <FieldDescription>关闭某项后将不再更新趋势显示，也不会再提示你开启相关授权。</FieldDescription>
    </UiField>

    <OptionalPermissionField
      :name="PERMISSION_FIELD"
      label="更多设备信息（可选）"
      :status-text="permissionStatusText"
      :details-text="permissionDetailsText"
      :validate-on-interaction="validateOnInteraction"
      :show-request="showPermissionRequest"
      request-text="开启"
      :requesting="requesting"
      :show-revoke="showPermissionRevoke"
      revoke-text="关闭"
      :revoking="revoking"
      :show-check="showPermissionCheck"
      check-text="重新检查"
      :check-disabled="requesting"
      @request="requestPermission"
      @revoke="revokePermission"
      @check="checkPermission"
    />

    <VeeField
      name="custom.refreshIntervalSeconds"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="system-refresh-interval">定时刷新间隔（秒）</FieldLabel>
        <FieldContent>
          <Input
            id="system-refresh-interval"
            v-bind="componentField"
            type="number"
            min="0"
            max="3600"
            step="1"
            class="h-10"
            placeholder="30"
          />
        </FieldContent>
        <FieldDescription>设置为 0 将关闭定时刷新；建议 15～120 秒。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>
  </FieldGroup>
</template>
