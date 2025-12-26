<script setup lang="ts">
import { useSlots } from 'vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import LinkFaviconIcon from '@/components/widgets/common/LinkFaviconIcon.vue';

type RootTag = 'a' | 'button';

const props = withDefaults(
  defineProps<{
    title: string;
    href: string;
    subtitle?: string;
    showFavicon?: boolean;
    as?: RootTag;
    disabled?: boolean;
  }>(),
  {
    subtitle: undefined,
    showFavicon: true,
    as: 'a',
    disabled: false,
  },
);

const slots = useSlots();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const handleClick = () => {
  if (props.as !== 'button') return;
  if (props.disabled) return;
  emit('select');
};
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <component
        :is="as"
        v-bind="
          as === 'button'
            ? { type: 'button', disabled: !!disabled, title: href, 'aria-label': title }
            : { href, target: '_blank', rel: 'noopener noreferrer', title: href, 'aria-label': title }
        "
        class="group border-border/40 bg-background/25 text-muted-foreground hover:border-border/65 hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/40 mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none active:translate-y-0 active:shadow-sm disabled:pointer-events-none disabled:opacity-60"
        @click="handleClick"
      >
        <LinkFaviconIcon
          :href="href"
          :title="title"
          :show-favicon="showFavicon"
          :container-class="'h-10 w-10 rounded-xl bg-secondary/55 text-secondary-foreground ring-1 ring-border/35'"
          :img-class="'h-5 w-5'"
        >
          <template v-if="slots.fallback" #fallback>
            <slot name="fallback" />
          </template>
        </LinkFaviconIcon>
      </component>
    </TooltipTrigger>

    <TooltipContent
      side="top"
      align="center"
      :side-offset="8"
      class="border-border bg-popover/98 text-popover-foreground max-w-[260px] rounded-xl border px-3 py-2 shadow-xl"
    >
      <div class="grid gap-0.5">
        <div class="line-clamp-2 font-medium">{{ title }}</div>
        <div v-if="subtitle" class="text-muted-foreground line-clamp-1 text-[11px]">{{ subtitle }}</div>
      </div>
    </TooltipContent>
  </Tooltip>
</template>
