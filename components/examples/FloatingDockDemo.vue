<template>
  <div class="flex h-[35rem] w-full items-center justify-center">
    <FloatingDock desktop-class-name="shadow-lg" mobile-class-name="translate-y-20">
      <template v-for="(item, index) in dockItems" :key="item.type === 'separator' ? `sep-${index}` : item.title">
        <FloatingDockSeparator v-if="item.type === 'separator'" :class="item.class" />
        <FloatingDockIcon
          v-else
          :title="item.title"
          :icon="item.icon"
          :href="item.href"
          :icon-class="item.iconClass"
          :aria-label="item.title"
        />
      </template>
    </FloatingDock>
  </div>
</template>

<script setup lang="ts">
import {
  FloatingDock,
  FloatingDockIcon,
  FloatingDockSeparator,
  type FloatingDockItemProps,
} from '@/components/ui/floating-dock';
import { IconBrandGithub, IconBrandX, IconExchange, IconHome, IconNewSection, IconTerminal2 } from '@tabler/icons-vue';
import { defineComponent, h } from 'vue';

const LogoMark = defineComponent({
  name: 'AceternityLogoMark',
  setup() {
    return () =>
      h('img', {
        src: 'https://assets.aceternity.com/logo-dark.png',
        width: 20,
        height: 20,
        alt: 'Aceternity Logo',
        class: 'h-full w-full object-contain',
      });
  },
});

const iconClass = 'h-full w-full text-neutral-500 dark:text-neutral-300';

type DemoDockItem = { type: 'separator'; class?: string } | (FloatingDockItemProps & { type?: 'item' });

const dockItems: DemoDockItem[] = [
  { title: 'Home', icon: IconHome, href: '#', iconClass },
  { title: 'Products', icon: IconTerminal2, href: '#', iconClass },
  { title: 'Components', icon: IconNewSection, href: '#', iconClass },
  { title: 'Aceternity UI', icon: LogoMark, href: '#' },
  { type: 'separator', class: 'opacity-60' },
  { title: 'Changelog', icon: IconExchange, href: '#', iconClass },
  { title: 'Twitter', icon: IconBrandX, href: '#', iconClass },
  { title: 'GitHub', icon: IconBrandGithub, href: '#', iconClass },
];
</script>
