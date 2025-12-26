<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Badge } from '@/components/ui/badge';

const props = withDefaults(
  defineProps<{
    showTitle?: boolean;
  }>(),
  {
    showTitle: true,
  },
);

const now = ref(new Date());
let timer: number | undefined;
const rootEl = ref<HTMLElement | null>(null);
const cardSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | undefined;
let resizeRaf: number | undefined;
let fitRaf: number | undefined;
let fitSeq = 0;
const fitLevel = ref(0);
const fontScale = ref(1);

const formatNumber = (value: number) => value.toString().padStart(2, '0');
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

const hourText = computed(() => formatNumber(now.value.getHours()));
const minuteText = computed(() => formatNumber(now.value.getMinutes()));
const secondText = computed(() => formatNumber(now.value.getSeconds()));
const mainTimeText = computed(() => `${hourText.value}:${minuteText.value}`);

const dateText = computed(() => {
  const y = now.value.getFullYear();
  const m = formatNumber(now.value.getMonth() + 1);
  const d = formatNumber(now.value.getDate());
  return `${y}-${m}-${d} 周${weekdays[now.value.getDay()]}`;
});

const shortDateText = computed(() => {
  const m = formatNumber(now.value.getMonth() + 1);
  const d = formatNumber(now.value.getDate());
  return `${m}-${d} 周${weekdays[now.value.getDay()]}`;
});

const periodText = computed(() => {
  const h = now.value.getHours();
  if (h < 6) return '夜深了，注意休息';
  if (h < 12) return '早上好，开启高效一天';
  if (h < 18) return '下午好，保持专注';
  return '晚上好，适当放松';
});

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const isNarrow = computed(() => cardSize.value.width > 0 && cardSize.value.width < 340);
const isVeryNarrow = computed(() => cardSize.value.width > 0 && cardSize.value.width < 260);
const isShort = computed(() => cardSize.value.height > 0 && cardSize.value.height < 150);

const showSyncBadge = computed(() => !isVeryNarrow.value && !isShort.value && fitLevel.value === 0);
const showPeriodLine = computed(() => !isShort.value && fitLevel.value === 0);
const showSecond = computed(() => true);
const showTimezone = computed(() => !isVeryNarrow.value && !isShort.value);

const metaLayout = computed<'inline' | 'stacked'>(() => {
  if (fitLevel.value >= 1) return 'inline';
  if (isNarrow.value || isShort.value) return 'stacked';
  return 'inline';
});

const mainFontSize = computed(() => {
  const { width, height } = cardSize.value;
  if (!width || !height) return 52;
  const widthBased = width * 0.22;
  const heightBased = height * 0.55;
  const raw = Math.min(widthBased, heightBased);
  return Math.max(28, Math.min(84, raw)) * fontScale.value;
});

const secondFontSize = computed(() => Math.max(14, Math.round(mainFontSize.value * 0.44)));

const isOverflowing = () => {
  const el = rootEl.value;
  if (!el) return false;
  return el.scrollHeight > el.clientHeight + 1;
};

const scheduleFit = () => {
  fitSeq += 1;
  const seq = fitSeq;
  if (fitRaf) {
    window.cancelAnimationFrame(fitRaf);
  }
  fitRaf = window.requestAnimationFrame(async () => {
    if (seq !== fitSeq) return;
    const el = rootEl.value;
    if (!el) return;

    const attemptFit = async (level: number) => {
      fitLevel.value = level;
      fontScale.value = 1;
      await nextTick();
      if (!isOverflowing()) return true;

      const available = el.clientHeight;
      const needed = el.scrollHeight;
      if (!available || !needed) return false;
      const ratio = available / needed;
      fontScale.value = Math.max(0.64, Math.min(1, ratio));
      await nextTick();
      return !isOverflowing();
    };

    if (await attemptFit(0)) return;
    if (await attemptFit(1)) return;
    await attemptFit(2);
  });
};

const updateSize = (width: number, height: number) => {
  cardSize.value = {
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  };
  scheduleFit();
};

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);

  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const rect = entry?.contentRect;
      if (!rect) return;

      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
      }
      resizeRaf = window.requestAnimationFrame(() => {
        updateSize(rect.width, rect.height);
      });
    });
    resizeObserver.observe(rootEl.value);
    const rect = rootEl.value.getBoundingClientRect();
    updateSize(rect.width, rect.height);
  }
});

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer);
  }
  if (resizeRaf) {
    window.cancelAnimationFrame(resizeRaf);
  }
  if (fitRaf) {
    window.cancelAnimationFrame(fitRaf);
  }
  resizeObserver?.disconnect();
});

watch(
  () => props.showTitle,
  () => scheduleFit(),
);
</script>

<template>
  <div ref="rootEl" class="text-foreground flex h-full min-h-0 flex-col overflow-hidden">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col">
        <span v-if="!props.showTitle" class="text-foreground text-sm font-semibold">当前时间</span>
        <span v-if="showPeriodLine" class="text-muted-foreground line-clamp-1 text-xs">{{ periodText }}</span>
      </div>
      <Badge v-if="showSyncBadge" variant="outline" class="border-border/40 bg-background/30 text-muted-foreground">
        <span class="bg-primary/70 inline-block h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        自动同步
      </Badge>
    </div>

    <div class="flex min-h-0 flex-1 flex-col justify-end" :class="isShort ? 'gap-2' : 'gap-3'">
      <div class="flex items-end justify-between gap-3 overflow-hidden">
        <div class="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap tabular-nums">
          <span
            class="leading-none font-semibold tracking-tight"
            :style="{ fontSize: `${Math.round(mainFontSize)}px` }"
          >
            {{ mainTimeText }}
          </span>
          <span
            v-if="showSecond"
            class="text-muted-foreground shrink-0 leading-none font-semibold"
            :style="{ fontSize: `${secondFontSize}px` }"
          >
            {{ secondText }}
          </span>
        </div>

        <div v-if="metaLayout === 'inline'" class="text-muted-foreground flex min-w-0 flex-col items-end gap-2 text-xs">
          <Badge
            variant="outline"
            class="border-border/40 bg-background/30 text-muted-foreground !w-auto max-w-full min-w-0 !shrink truncate"
          >
            {{ dateText }}
          </Badge>
          <Badge
            v-if="showTimezone"
            variant="outline"
            class="border-border/40 bg-background/30 text-muted-foreground !w-auto max-w-full min-w-0 !shrink truncate"
          >
            时区：{{ timezone }}
          </Badge>
        </div>
      </div>

      <div
        v-if="metaLayout === 'stacked'"
        class="text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 text-xs"
      >
        <Badge
          variant="outline"
          class="border-border/40 bg-background/30 text-muted-foreground !w-auto max-w-full min-w-0 !shrink truncate"
        >
          {{ isVeryNarrow ? shortDateText : dateText }}
        </Badge>
        <Badge
          v-if="showTimezone"
          variant="outline"
          class="border-border/40 bg-background/30 text-muted-foreground !w-auto max-w-full min-w-0 !shrink truncate"
        >
          时区：{{ timezone }}
        </Badge>
      </div>
    </div>
  </div>
</template>
