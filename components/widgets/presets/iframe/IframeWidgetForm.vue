<script setup lang="ts">
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
import { Textarea } from '@/components/ui/textarea';
import { computed, inject, ref } from 'vue';
import { Field as VeeField, useFormContext } from 'vee-validate';
import type { WidgetEditorFormValues } from '@/components/widgets/widgetFormSchema';
import { WIDGET_EDITOR_VALIDATE_ON_INTERACTION } from '@/components/widgets/widgetEditorValidationGate';

const validateOnInteraction = inject(WIDGET_EDITOR_VALIDATE_ON_INTERACTION, ref(true));
const { values } = useFormContext<WidgetEditorFormValues>();

const urlStatus = computed(() => {
  const trimmed = String((values.custom as any)?.url ?? '').trim();
  if (!trimmed) {
    return {
      text: '填一个网页链接，就能在卡片里打开。',
      variant: 'muted' as const,
    };
  }
  if (/^(https?:\/\/|data:)/i.test(trimmed)) {
    return {
      text: '会在卡片里打开这个网页。',
      variant: 'muted' as const,
    };
  }
  return {
    text: '这个链接看起来不太对，建议直接从浏览器地址栏复制。',
    variant: 'warning' as const,
  };
});
</script>

<template>
  <FieldGroup class="grid gap-4">
    <VeeField
      name="custom.url"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="iframe-url">网页链接</FieldLabel>
        <FieldContent>
          <Input
            id="iframe-url"
            v-bind="componentField"
            class="h-10"
            placeholder="粘贴网页链接"
            autocomplete="on"
            inputmode="url"
            autocapitalize="none"
            spellcheck="false"
          />
        </FieldContent>
        <FieldDescription :class="urlStatus.variant === 'warning' ? 'text-amber-600 dark:text-amber-500' : ''">
          {{ urlStatus.text }}
        </FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="custom.selector"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="iframe-selector">只显示其中一块（可选）</FieldLabel>
        <FieldContent>
          <Input
            id="iframe-selector"
            v-bind="componentField"
            class="h-10"
            placeholder="不熟悉可留空"
            maxlength="200"
            autocapitalize="none"
            spellcheck="false"
          />
        </FieldContent>
        <FieldDescription>留空显示完整页面；需要只看某一块内容时再填写。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="custom.uaMode"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel>显示效果</FieldLabel>
        <FieldContent>
          <Select v-bind="componentField">
            <SelectTrigger id="iframe-ua-trigger" class="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desktop">电脑（默认）</SelectItem>
              <SelectItem value="mobile">手机</SelectItem>
            </SelectContent>
          </Select>
        </FieldContent>
        <FieldDescription> 切换后网页会更像电脑/手机的样子；同一网站的多个卡片会以最后一次保存为准。 </FieldDescription>
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
        <FieldLabel for="iframe-auto-refresh">自动刷新（秒）</FieldLabel>
        <FieldContent>
          <Input
            id="iframe-auto-refresh"
            v-bind="componentField"
            type="number"
            min="0"
            max="3600"
            step="1"
            class="h-10"
          />
        </FieldContent>
        <FieldDescription>填 0 表示关闭；建议 30～300 秒。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>

    <VeeField
      name="custom.customStyle"
      :validate-on-blur="true"
      :validate-on-change="validateOnInteraction"
      :validate-on-input="validateOnInteraction"
      :validate-on-model-update="validateOnInteraction"
      v-slot="{ componentField, errors }"
    >
      <UiField :data-invalid="!!errors.length">
        <FieldLabel for="iframe-style">外观微调（可选）</FieldLabel>
        <FieldContent>
          <Textarea
            id="iframe-style"
            v-bind="componentField"
            class="min-h-[120px] font-mono text-xs"
            placeholder="不熟悉可留空"
            maxlength="8000"
            autocapitalize="none"
            spellcheck="false"
          />
        </FieldContent>
        <FieldDescription>用于微调页面外观；不熟悉可留空。</FieldDescription>
        <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
      </UiField>
    </VeeField>
  </FieldGroup>
</template>
