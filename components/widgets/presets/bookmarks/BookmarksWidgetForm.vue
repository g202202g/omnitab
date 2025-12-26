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
import {
  buildBookmarkIndex,
  buildFolderOptions,
  getNodePathTitles,
  findDefaultFolderId,
  loadBookmarkTree,
} from './bookmarks';
import OptionalPermissionField from '@/components/widgets/common/OptionalPermissionField.vue';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import { Field as VeeField, useFormContext } from 'vee-validate';
import type { WidgetEditorFormValues } from '@/components/widgets/widgetFormSchema';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from '@/components/widgets/widgetEditorValidationGate';

const AUTO_FOLDER_VALUE = '__auto__';
const PERMISSION_FIELD = 'custom.__permissionGranted' as const;

const validateOnInteraction = inject(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, ref(true));
const { values, setFieldValue } = useFormContext<WidgetEditorFormValues>();

const folderId = computed<string>({
  get: () => {
    const raw = (values.custom as any)?.folderId;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : AUTO_FOLDER_VALUE;
  },
  set: (val) => {
    const next = typeof val === 'string' ? val : '';
    setFieldValue('custom.folderId' as any, next === AUTO_FOLDER_VALUE ? '' : next, validateOnInteraction.value);
  },
});

const showFavicon = computed<boolean>({
  get: () => ((values.custom as any)?.showFavicon ?? true) !== false,
  set: (val) => {
    setFieldValue('custom.showFavicon' as any, !!val);
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

const displayOptionIdPrefix = `bookmarks-display-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const showFaviconCheckboxId = `${displayOptionIdPrefix}-show-favicon`;
const showFaviconLabelId = `${displayOptionIdPrefix}-show-favicon-label`;

const loading = ref(false);
const folderOptions = ref<{ id: string; label: string; path: string; depth: number }[]>([]);
const loadError = ref<string | null>(null);
const autoFolderHint = ref<string>('');
const permissionRequired = ref(false);
const requestingPermission = ref(false);
const revokingPermission = ref(false);

const perm = useOptionalPermission();

const checkBookmarkPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionRequired.value = false;
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  const ok = await perm.contains({ permissions: ['bookmarks'] });
  permissionRequired.value = !ok;
  setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
  return ok;
};

const requestBookmarkPermission = async () => {
  setFieldValue(PERMISSION_FIELD as any, false, false);
  if (!perm.isSupported) {
    permissionRequired.value = false;
    setFieldValue(PERMISSION_FIELD as any, true, false);
    return true;
  }
  requestingPermission.value = true;
  try {
    const ok = await perm.request({ permissions: ['bookmarks'] });
    permissionRequired.value = !ok;
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    return ok;
  } finally {
    requestingPermission.value = false;
  }
};

const revokeBookmarkPermission = async () => {
  if (!perm.isSupported) return true;
  revokingPermission.value = true;
  try {
    const ok = await perm.remove({ permissions: ['bookmarks'] });
    await checkBookmarkPermission();
    setFieldValue(PERMISSION_FIELD as any, ok, validateOnInteraction.value);
    return ok;
  } finally {
    revokingPermission.value = false;
  }
};

const handleGrantPermission = async () => {
  const ok = await requestBookmarkPermission();
  if (ok) {
    window.dispatchEvent(new CustomEvent('codex-bookmarks-permission-changed'));
    await loadFolders();
  }
};

const handleRevokePermission = async () => {
  const ok = await revokeBookmarkPermission();
  if (ok) {
    window.dispatchEvent(new CustomEvent('codex-bookmarks-permission-changed'));
    await loadFolders();
  }
};

const loadFolders = async () => {
  loading.value = true;
  loadError.value = null;
  permissionRequired.value = false;
  try {
    const hasPerm = await checkBookmarkPermission();
    if (!hasPerm) {
      folderOptions.value = [];
      autoFolderHint.value = '';
      return;
    }
    const tree = await loadBookmarkTree();
    if (!tree) {
      folderOptions.value = [];
      loadError.value = '暂时无法读取书签，请确认已开启“书签”访问授权，并刷新页面后重试。';
      autoFolderHint.value = '';
      return;
    }
    const index = buildBookmarkIndex(tree);
    const options = buildFolderOptions(index);
    const defaultId = findDefaultFolderId(index);
    folderOptions.value = options;
    autoFolderHint.value = defaultId ? getNodePathTitles(index, defaultId).join(' / ') : '';
  } catch (error) {
    folderOptions.value = [];
    loadError.value = '加载失败，请稍后再试。';
    autoFolderHint.value = '';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void loadFolders();
});

const folderPlaceholder = computed(() => {
  if (loading.value) return '正在加载书签文件夹…';
  if (permissionRequired.value) return '需要先开启书签访问授权';
  if (loadError.value) return '无法读取书签文件夹';
  if (folderId.value === AUTO_FOLDER_VALUE) {
    return autoFolderHint.value ? `自动（${autoFolderHint.value}）` : '自动（推荐）';
  }
  return '请选择文件夹';
});
</script>

<template>
  <FieldGroup class="grid gap-4">
    <OptionalPermissionField
      :name="PERMISSION_FIELD"
      label="访问授权"
      :status-text="permissionRequired ? '需要先开启书签访问授权' : '已开启书签访问授权'"
      description-text="开启后才可以在这里选择要展示的书签文件夹。"
      :validate-on-interaction="validateOnInteraction"
      :show-request="permissionRequired"
      request-text="开启"
      :requesting="requestingPermission"
      :show-revoke="!permissionRequired"
      revoke-text="关闭"
      :revoking="revokingPermission"
      :check-disabled="requestingPermission"
      @request="handleGrantPermission"
      @revoke="handleRevokePermission"
      @check="loadFolders"
    />

    <VeeField
      name="custom.folderId"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel>书签文件夹</FieldLabel>
        <FieldContent>
          <Select v-model="folderId" :disabled="loading || permissionRequired || !!loadError">
            <SelectTrigger id="bookmarks-folder-trigger" class="h-10">
              <SelectValue :placeholder="folderPlaceholder" />
            </SelectTrigger>
            <SelectContent class="max-h-[320px]">
              <SelectItem :value="AUTO_FOLDER_VALUE">自动（优先书签栏）</SelectItem>
              <SelectItem v-for="folder in folderOptions" :key="folder.id" :value="folder.id" class="cursor-pointer">
                <span class="font-medium">{{ folder.label }}</span>
                <span class="text-muted-foreground ml-2 text-xs">{{ folder.path }}</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </FieldContent>
        <FieldDescription>
          选择后会显示该文件夹下的书签与子文件夹；“自动”会尝试选中书签栏/工具栏作为默认入口。
        </FieldDescription>
        <FieldDescription v-if="loadError" class="text-amber-600 dark:text-amber-500">
          {{ loadError }}
        </FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <UiField>
      <FieldLabel>显示模式</FieldLabel>
      <FieldContent>
        <Select v-model="displayMode">
          <SelectTrigger id="bookmarks-display-mode" class="h-10">
            <SelectValue placeholder="选择显示模式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">列表（图标 + 标题）</SelectItem>
            <SelectItem value="icon-only">仅图标</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
      <FieldDescription> “仅图标”适合做快捷入口；鼠标悬停可通过标题提示区分不同书签。 </FieldDescription>
    </UiField>

    <VeeField
      name="custom.maxItems"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="bookmarks-max">最大显示数量</FieldLabel>
        <FieldContent>
          <Input id="bookmarks-max" v-bind="componentField" type="number" min="1" max="200" step="1" class="h-10" />
        </FieldContent>
        <FieldDescription>仅限制当前目录的显示条目数量，避免卡片过长。</FieldDescription>
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
              :id="showFaviconCheckboxId"
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
      </FieldContent>
    </UiField>
  </FieldGroup>
</template>
