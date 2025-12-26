<script setup lang="ts">
import { computed, useSlots } from 'vue';
import LinkFaviconIcon from '@/components/widgets/common/LinkFaviconIcon.vue';

type IconVariant = 'muted' | 'secondary';
type IconSize = 'sm' | 'md';
type RootTag = 'a' | 'button';

const props = withDefaults(
  defineProps<{
    title: string;
    href: string;
    subtitle?: string;
    time?: string;
    titleAttr?: string;
    showFavicon?: boolean;
    faviconSize?: number;
    iconVariant?: IconVariant;
    iconSize?: IconSize;
    as?: RootTag;
    disabled?: boolean;
  }>(),
  {
    subtitle: undefined,
    time: undefined,
    titleAttr: undefined,
    showFavicon: true,
    faviconSize: 32,
    iconVariant: 'muted',
    iconSize: 'md',
    as: 'a',
    disabled: false,
  },
);

const slots = useSlots();

const iconContainerClass = computed(() => {
  if (props.iconVariant === 'secondary') return 'bg-secondary text-secondary-foreground';
  return 'bg-muted/60 text-muted-foreground';
});

const iconSizeClass = computed(() => {
  return props.iconSize === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
});

const isButton = computed(() => props.as === 'button');

const rootAttrs = computed(() => {
  if (isButton.value) {
    return {
      type: 'button',
      disabled: !!props.disabled,
      title: props.titleAttr ?? props.href,
    };
  }
  return {
    href: props.href,
    target: '_blank',
    rel: 'noreferrer noopener',
    title: props.titleAttr ?? props.href,
  };
});

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const handleClick = () => {
  if (!isButton.value) return;
  if (props.disabled) return;
  emit('select');
};
</script>

<template>
  <component
    :is="as"
    v-bind="rootAttrs"
    class="hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
    @click="handleClick"
  >
    <LinkFaviconIcon
      :href="href"
      :title="title"
      :show-favicon="showFavicon"
      :favicon-size="faviconSize"
      :container-class="`h-8 w-8 shrink-0 rounded-lg ${iconContainerClass}`"
      :img-class="iconSizeClass"
    >
      <template v-if="slots.fallback" #fallback>
        <slot name="fallback" />
      </template>
    </LinkFaviconIcon>

    <div class="min-w-0 flex-1">
      <div class="text-foreground line-clamp-1 text-sm font-medium">
        {{ title }}
      </div>
      <slot v-if="slots.subtitle" name="subtitle" />
      <div v-else-if="subtitle" class="text-muted-foreground line-clamp-1 text-xs">
        {{ subtitle }}
      </div>
    </div>

    <div v-if="time" class="text-muted-foreground shrink-0 text-xs">
      {{ time }}
    </div>

    <slot name="after" />
  </component>
</template>
