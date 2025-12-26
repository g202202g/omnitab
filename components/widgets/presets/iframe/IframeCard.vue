<script setup lang="ts">
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCcw, TriangleAlert } from 'lucide-vue-next';
import {
  WIDGET_CARD_BOTTOM_OVERLAY_TARGET_KEY,
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardBottomOverlayTarget,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';

const props = withDefaults(
  defineProps<{
    widgetId: string;
    editMode?: boolean;
    data?: Record<string, unknown>;
  }>(),
  {
    editMode: false,
    data: () => ({}),
  },
);

const initialUrl = computed(() =>
  typeof props.data?.url === 'string' && props.data.url.trim()
    ? props.data.url.trim()
    : 'https://developer.mozilla.org/',
);
const appliedUrl = ref(initialUrl.value);
const iframeReloadKey = ref(0);
const iframeRef = ref<HTMLIFrameElement | null>(null);
const iframeSrc = ref('about:blank');
const iframeLoading = ref(true);
const iframeLoadedOnce = ref(false);
const selector = computed(() => (typeof props.data?.selector === 'string' ? props.data.selector.trim() : ''));
const rootEl = ref<HTMLElement | null>(null);
const rootHeight = ref(0);
let rootResizeObserver: ResizeObserver | null = null;
const frameContainerEl = ref<HTMLElement | null>(null);
const frameContainerHeight = ref(0);
let frameContainerResizeObserver: ResizeObserver | null = null;
const reportedHeight = ref<number | null>(null);
const frameHref = ref('');
const frameAuthLike = ref(false);
const authHintDismissed = ref(false);
const pendingAuthRefresh = ref(false);
const bottomOverlayTarget = inject<WidgetCardBottomOverlayTarget | null>(WIDGET_CARD_BOTTOM_OVERLAY_TARGET_KEY, null);

const displayUrl = computed(() => appliedUrl.value || 'https://developer.mozilla.org/');
const isShort = computed(() => rootHeight.value > 0 && rootHeight.value < 180);
const uaMode = computed<'desktop' | 'mobile'>(() => ((props.data as any)?.uaMode === 'mobile' ? 'mobile' : 'desktop'));
const autoRefreshSeconds = computed(() => {
  const raw = Number((props.data as any)?.autoRefreshSeconds);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(3600, Math.floor(raw)));
});
let applySeq = 0;
const controlsTarget = inject<WidgetCardControlsTarget | null>(WIDGET_CARD_CONTROLS_TARGET_KEY, null);
const controlsTo = computed(() => controlsTarget?.value ?? null);
const authHintTo = computed(() => bottomOverlayTarget?.value ?? null);
const isActive = ref(true);

const clampHeight = (value: number) => {
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.max(400, Math.min(Math.ceil(value), 12000));
};

const iframeHeightStyle = computed(() => {
  const reported = clampHeight(reportedHeight.value ?? 420);
  const minimum = clampHeight(frameContainerHeight.value);
  const height = Math.max(reported ?? 0, minimum ?? 0);
  if (!height) return undefined;
  return { height: `${height}px` };
});

const resetInputFromProps = () => {
  appliedUrl.value = initialUrl.value || appliedUrl.value;
};

const postWidgetId = () => {
  const frameWindow = iframeRef.value?.contentWindow;
  if (!frameWindow) return;
  try {
    frameWindow.postMessage(
      {
        source: 'codex-widget',
        type: 'codex-widget-id',
        widgetId: props.widgetId,
      },
      '*',
    );
    frameWindow.postMessage(
      {
        source: 'codex-widget',
        type: 'codex-frame-token',
        token: props.widgetId,
        widgetId: props.widgetId,
      },
      '*',
    );
  } catch (error) {
    console.warn('[iframe-card] postMessage widget id failed', error);
  }
};

const scheduleWidgetId = () => {
  requestAnimationFrame(() => {
    postWidgetId();
  });
};

const handleIframeLoad = () => {
  reportedHeight.value = null;
  iframeLoading.value = false;
  iframeLoadedOnce.value = true;
  scheduleWidgetId();
};

const refreshIframe = () => {
  void syncIframeSrc();
};

const openAuthInTopLevel = () => {
  const url = displayUrl.value;
  if (!url) return;
  pendingAuthRefresh.value = true;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const closeAuthHint = () => {
  authHintDismissed.value = true;
};

const prepareIframe = async (url: string, mode: 'desktop' | 'mobile') => {
  const runtime = (browser as any)?.runtime;
  if (!runtime?.sendMessage) return;
  try {
    await runtime.sendMessage({ type: 'prepare-iframe', url, mode });
  } catch (error) {
    console.error('[iframe-card] prepare-iframe failed', error);
  }
};

const syncIframeSrc = async () => {
  if (!isActive.value) return;
  const seq = (applySeq += 1);
  const nextUrl = displayUrl.value;
  reportedHeight.value = null;
  iframeLoading.value = true;
  await prepareIframe(nextUrl, uaMode.value);
  if (seq !== applySeq) return;
  iframeSrc.value = nextUrl;
  iframeReloadKey.value += 1;
};

let refreshTimer: number | null = null;
const setupAutoRefresh = () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (!isActive.value) return;
  const seconds = autoRefreshSeconds.value;
  if (!seconds || seconds <= 0) return;
  refreshTimer = window.setInterval(() => {
    if (!isActive.value) return;
    if (document.visibilityState !== 'visible') return;
    void syncIframeSrc();
  }, seconds * 1000);
};

const stopAutoRefresh = () => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
};

const handleHeightMessage = (event: MessageEvent) => {
  const frameWindow = iframeRef.value?.contentWindow;
  if (!frameWindow || event.source !== frameWindow) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if ((data as any).type !== 'codex-frame-height') return;
  const widgetId = (data as any).widgetId;
  if (typeof widgetId === 'string' && widgetId && widgetId !== props.widgetId) return;
  const height = typeof (data as any).height === 'number' ? (data as any).height : Number((data as any).height);
  const clamped = clampHeight(height);
  if (!clamped) return;
  reportedHeight.value = clamped;
};

const handleLocationMessage = (event: MessageEvent) => {
  const frameWindow = iframeRef.value?.contentWindow;
  if (!frameWindow || event.source !== frameWindow) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if ((data as any).type !== 'codex-frame-location') return;
  const widgetId = (data as any).widgetId;
  if (typeof widgetId === 'string' && widgetId && widgetId !== props.widgetId) return;
  const href = typeof (data as any).href === 'string' ? (data as any).href : '';
  if (href) frameHref.value = href;
  frameAuthLike.value = Boolean((data as any).authLike);
};

const handleVisibility = () => {
  if (document.visibilityState !== 'visible') return;
  if (!pendingAuthRefresh.value) return;
  pendingAuthRefresh.value = false;
  void syncIframeSrc();
};

const showAuthHint = computed(() => {
  if (authHintDismissed.value) return false;
  if (!frameAuthLike.value) return false;
  // 仅在 iframe 内位于登录/授权相关页面时提示，避免影响普通浏览。
  return true;
});

onMounted(() => {
  resetInputFromProps();
  window.addEventListener('message', handleHeightMessage);
  window.addEventListener('message', handleLocationMessage);
  document.addEventListener('visibilitychange', handleVisibility);
  void syncIframeSrc();
  setupAutoRefresh();
  rootHeight.value = rootEl.value?.clientHeight ?? 0;
  if (rootEl.value) {
    rootResizeObserver = new ResizeObserver((entries) => {
      rootHeight.value = entries[0]?.contentRect.height ?? 0;
    });
    rootResizeObserver.observe(rootEl.value);
  }
  frameContainerHeight.value = frameContainerEl.value?.clientHeight ?? 0;
  if (frameContainerEl.value) {
    frameContainerResizeObserver = new ResizeObserver((entries) => {
      frameContainerHeight.value = entries[0]?.contentRect.height ?? 0;
    });
    frameContainerResizeObserver.observe(frameContainerEl.value);
  }
});

onActivated(() => {
  isActive.value = true;
  setupAutoRefresh();
});

onDeactivated(() => {
  isActive.value = false;
  stopAutoRefresh();
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleHeightMessage);
  window.removeEventListener('message', handleLocationMessage);
  document.removeEventListener('visibilitychange', handleVisibility);
  rootResizeObserver?.disconnect();
  rootResizeObserver = null;
  frameContainerResizeObserver?.disconnect();
  frameContainerResizeObserver = null;
  stopAutoRefresh();
});

watch(
  () => [displayUrl.value, uaMode.value],
  () => {
    iframeLoadedOnce.value = false;
    authHintDismissed.value = false;
    void syncIframeSrc();
  },
);

watch(
  () => autoRefreshSeconds.value,
  () => {
    setupAutoRefresh();
  },
);

watch(
  () => props.data,
  () => {
    resetInputFromProps();
    setupAutoRefresh();
  },
  { deep: true },
);

watch(
  () => selector.value,
  () => {
    scheduleWidgetId();
  },
);
</script>

<template>
  <div ref="rootEl" class="text-foreground flex h-full min-h-0 w-full flex-col" :class="isShort ? 'gap-2' : 'gap-3'">
    <Teleport v-if="controlsTo" :to="controlsTo">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
            aria-label="刷新页面"
            @click.stop.prevent="refreshIframe"
          >
            <RefreshCcw class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">刷新</TooltipContent>
      </Tooltip>
    </Teleport>

    <Teleport v-if="authHintTo" :to="authHintTo">
      <div v-if="showAuthHint" class="pointer-events-none w-full">
        <div
          class="border-border/60 bg-background/85 pointer-events-none mx-auto flex w-full max-w-[760px] items-start justify-between gap-3 rounded-2xl border p-3 shadow-sm backdrop-blur"
        >
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert class="text-muted-foreground h-4 w-4" />
              <span>需要登录</span>
            </div>
            <div class="text-muted-foreground text-xs">建议先在新页面完成一次登录，回来后刷新窗口。</div>
          </div>
          <div class="pointer-events-auto flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" @click="openAuthInTopLevel">去登录</Button>
            <Button size="sm" variant="ghost" @click="closeAuthHint">关闭</Button>
          </div>
        </div>
      </div>
    </Teleport>

    <div ref="frameContainerEl" class="relative min-h-0 w-full flex-1 rounded-lg">
      <div
        v-if="iframeLoading && !iframeLoadedOnce"
        class="bg-background/10 absolute inset-0 z-10 grid place-items-center backdrop-blur-[1px]"
      >
        <div class="w-full max-w-[520px] px-4">
          <div class="border-border/50 bg-background/40 rounded-2xl border p-4 shadow-sm">
            <div class="animate-pulse space-y-3">
              <div class="bg-muted/60 h-4 w-2/3 rounded-md" />
              <div class="bg-muted/50 h-3 w-1/2 rounded-md" />
              <div class="bg-muted/50 h-40 w-full rounded-xl" />
            </div>
            <div class="text-muted-foreground mt-3 text-center text-xs">正在加载…</div>
          </div>
        </div>
      </div>

      <iframe
        :key="iframeReloadKey"
        :src="iframeSrc"
        ref="iframeRef"
        @load="handleIframeLoad"
        class="w-full"
        :style="iframeHeightStyle"
        sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads"
        scrolling="no"
        border="0"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </div>
  </div>
</template>
