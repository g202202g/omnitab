<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Field as UiField, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { ShieldCheck } from 'lucide-vue-next';
import { Field as VeeField } from 'vee-validate';

const DEFAULT_TIP = '提示：如果你刚安装/更新扩展，按钮还没变化，可以到浏览器的扩展管理页里刷新一下扩展。';

const props = withDefaults(
  defineProps<{
    name: string;
    label?: string;
    statusText: string;
    descriptionText?: string;
    detailsText?: string;
    tipText?: string;

    validateOnInteraction?: boolean;

    showRequest?: boolean;
    requestText?: string;
    requestingText?: string;
    requesting?: boolean;
    requestDisabled?: boolean;

    showRevoke?: boolean;
    revokeText?: string;
    revokingText?: string;
    revoking?: boolean;
    revokeDisabled?: boolean;

    showCheck?: boolean;
    checkText?: string;
    checkDisabled?: boolean;

    showRequestIcon?: boolean;
  }>(),
  {
    label: '访问授权',
    tipText: DEFAULT_TIP,
    validateOnInteraction: true,
    showRequest: false,
    requesting: false,
    requestDisabled: false,
    showRevoke: false,
    revoking: false,
    revokeDisabled: false,
    showCheck: true,
    checkDisabled: false,
    showRequestIcon: true,
  },
);

defineEmits<{
  (e: 'request'): void;
  (e: 'revoke'): void;
  (e: 'check'): void;
}>();
</script>

<template>
  <VeeField
    :name="props.name"
    :validate-on-blur="true"
    :validate-on-change="props.validateOnInteraction"
    :validate-on-input="props.validateOnInteraction"
    :validate-on-model-update="props.validateOnInteraction"
    v-slot="{ errors }"
  >
    <UiField :data-invalid="!!errors.length">
      <FieldLabel>{{ props.label }}</FieldLabel>
      <FieldContent class="grid gap-2">
        <div class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm">
          <div class="text-foreground text-sm">
            {{ props.statusText }}
          </div>
          <div v-if="props.descriptionText" class="text-muted-foreground mt-1 text-xs">
            {{ props.descriptionText }}
          </div>
          <div v-if="props.detailsText" class="text-muted-foreground mt-1 text-xs">
            {{ props.detailsText }}
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Button
              v-if="props.showRequest"
              type="button"
              size="sm"
              :disabled="props.requesting || props.requestDisabled"
              @click="$emit('request')"
            >
              <ShieldCheck v-if="props.showRequestIcon" class="mr-2 h-4 w-4" />
              {{ props.requesting ? (props.requestingText ?? '正在开启…') : (props.requestText ?? '开启') }}
            </Button>

            <Button
              v-if="props.showRevoke"
              type="button"
              size="sm"
              variant="outline"
              :disabled="props.revoking || props.revokeDisabled"
              @click="$emit('revoke')"
            >
              {{ props.revoking ? (props.revokingText ?? '正在关闭…') : (props.revokeText ?? '关闭授权') }}
            </Button>

            <Button
              v-if="props.showCheck"
              type="button"
              size="sm"
              variant="outline"
              :disabled="props.checkDisabled"
              @click="$emit('check')"
            >
              {{ props.checkText ?? '重新检查' }}
            </Button>
          </div>
        </div>
      </FieldContent>
      <FieldDescription v-if="props.tipText">
        {{ props.tipText }}
      </FieldDescription>
      <FieldError v-if="errors.length" :errors="errors" class="text-xs" />
    </UiField>
  </VeeField>
</template>
