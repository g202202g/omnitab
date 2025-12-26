<script lang="ts" setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView } from 'vue-router';
import PageSidebar from '@/components/layout/PageSidebar.vue';
import { usePageNavigation } from '@/composables/usePageNavigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePageDocumentMeta } from '@/composables/usePageDocumentMeta';

const navigation = usePageNavigation();

usePageDocumentMeta(navigation.store.activePage, {
  defaultTitle: '万象标签',
  defaultDescription: '为不同需求拆分页面，后续每个页面都能放不同的卡片和布局。',
});

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('[contenteditable="true"]'));
};

const HOTKEY_DEDUPE_MS = 160;
let lastHotkeyAt = 0;
let lastHotkeyCode = '';

const resolveDigit = (event: KeyboardEvent) => {
  const codeMatch = event.code.match(/^(?:Digit|Numpad)([0-9])$/);
  if (codeMatch) return { digit: Number(codeMatch[1]), isNumpad: event.code.startsWith('Numpad'), code: event.code };
  const keyMatch = String(event.key ?? '').match(/^([0-9])$/);
  if (keyMatch)
    return {
      digit: Number(keyMatch[1]),
      isNumpad: event.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD,
      code: event.code,
    };
  return null;
};

const tryHandlePageHotkey = (event: KeyboardEvent) => {
  const isAltGraph = event.getModifierState?.('AltGraph') ?? false;
  if (!event.altKey && !isAltGraph) return;
  if (event.metaKey) return;
  if (event.isComposing) return;

  const resolved = resolveDigit(event);
  if (!resolved) return;

  // 允许在输入框中使用“主键盘数字行”切换页面（常见：搜索框会自动聚焦），但保留 Numpad 以避免影响 Windows 的 Alt+小键盘输入法（AltCode）。
  if (isEditableTarget(event.target) && resolved.isNumpad) return;

  const digit = resolved.digit;
  if (!Number.isFinite(digit)) return;

  const index = digit === 0 ? 9 : digit - 1;
  const pages = navigation.store.pages.value;
  const page = pages[index];
  if (!page) return;
  if (navigation.store.activePageId.value === page.id) return;

  const now = Date.now();
  if (event.type === 'keyup' && lastHotkeyCode === resolved.code && now - lastHotkeyAt < HOTKEY_DEDUPE_MS) return;

  event.preventDefault();
  navigation.handleSelect(page.id);

  lastHotkeyAt = now;
  lastHotkeyCode = resolved.code;
};

onMounted(async () => {
  await navigation.init();
  window.addEventListener('keydown', tryHandlePageHotkey, true);
  window.addEventListener('keyup', tryHandlePageHotkey, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', tryHandlePageHotkey, true);
  window.removeEventListener('keyup', tryHandlePageHotkey, true);
});
</script>

<template>
  <TooltipProvider :delay-duration="120">
    <div class="bg-background text-foreground relative flex min-h-screen w-full">
      <PageSidebar
        :pages="navigation.store.pages.value"
        :active-page-id="navigation.store.activePageId.value"
        @add="navigation.handleAdd"
        @select="navigation.handleSelect"
        @remove="navigation.handleRemove"
        @rename="navigation.handleRename"
      />

      <main class="flex-1">
        <RouterView v-slot="{ Component, route }">
          <KeepAlive>
            <component
              :is="Component"
              :key="route.name === 'page' ? String(route.params.pageId ?? '__default__') : String(route.fullPath)"
            />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </TooltipProvider>
</template>
