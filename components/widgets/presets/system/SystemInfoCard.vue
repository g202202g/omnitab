<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart';
import { VisArea, VisLine, VisXYContainer } from '@unovis/vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCcw, Copy } from 'lucide-vue-next';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  WIDGET_CARD_STATUS_TARGET_KEY,
  type WidgetCardControlsTarget,
  type WidgetCardStatusTarget,
} from '@/components/widgets/utils/widgetCardControls';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import {
  SYSTEM_PERMISSIONS,
  type SystemPermission,
  buildCpuSample,
  computeCpuUsageRatio,
  formatBool,
  formatBytes,
  formatPercent,
  readBatteryInfo,
  readChromeSystemCpuInfo,
  readChromeSystemMemoryInfo,
} from './systemInfo';

type InfoItem = { label: string; value: string; mono?: boolean; full?: boolean; sparkline?: number[] };
type InfoSection = { title: string; items: InfoItem[] };

const props = withDefaults(
  defineProps<{
    widgetId: string;
    editMode?: boolean;
    data?: Record<string, unknown>;
    showTitle?: boolean;
  }>(),
  {
    editMode: false,
    data: () => ({}),
    showTitle: true,
  },
);

const controlsTarget = inject<WidgetCardControlsTarget | null>(WIDGET_CARD_CONTROLS_TARGET_KEY, null);
const controlsTo = computed(() => controlsTarget?.value ?? null);

const statusTarget = inject<WidgetCardStatusTarget | null>(WIDGET_CARD_STATUS_TARGET_KEY, null);
const statusTo = computed(() => statusTarget?.value ?? null);

const perm = useOptionalPermission();
const permissionMap = ref<Record<SystemPermission, boolean>>({
  'system.cpu': false,
  'system.memory': false,
});

const lastCpuSample = ref<ReturnType<typeof buildCpuSample> | null>(null);

const loading = ref(false);
const errorText = ref<string | null>(null);
const updatedAt = ref<number | null>(null);
const rawSnapshot = ref<Record<string, unknown>>({});
const sections = ref<InfoSection[]>([]);
const layoutVersion = ref(0);
let layoutReflowTimer: number | undefined;
let autoRefreshTimer: number | undefined;
const cpuTrend = ref<number[]>([]);
const batteryTrend = ref<number[]>([]);
const memoryTrend = ref<number[]>([]);
const MAX_TREND_POINTS = 60;
const TREND_CHART_HEIGHT = 72;

const showBattery = computed(() => ((props.data as any)?.showBattery ?? true) !== false);
const showCpu = computed(() => ((props.data as any)?.showCpu ?? true) !== false);
const showMemory = computed(() => ((props.data as any)?.showMemory ?? true) !== false);

const refreshIntervalSeconds = computed(() => {
  const raw = Number((props.data as any)?.refreshIntervalSeconds);
  if (!Number.isFinite(raw)) return 30;
  return Math.max(0, Math.min(3600, Math.floor(raw)));
});
const autoRefreshEnabled = computed(() => refreshIntervalSeconds.value > 0);

const formatTime = (ts?: number | null) => {
  if (!ts || !Number.isFinite(ts)) return '—';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const pushTrend = (target: typeof cpuTrend, value: number) => {
  const next = [...target.value, clamp01(value)];
  target.value = next.slice(Math.max(0, next.length - MAX_TREND_POINTS));
};

const trendChartConfig = {
  display: {
    label: '占用率',
    color: 'var(--primary)',
  },
} as const;

const buildTrendData = (values: number[]) => {
  const list = Array.isArray(values) ? values : [];
  return list.map((value, index) => {
    const normalized = clamp01(Number(value));
    return { index, value: normalized, display: formatPercent(normalized) };
  });
};

// 参考 shadcn-vue 官方示例：tooltip 由 ChartCrosshair.template + ChartTooltipContent 渲染
// 引用 props.widgetId 防止 script setup 被编译期提升到模块作用域（会导致 useId 生命周期告警）
const trendTooltipTemplate = componentToString(trendChartConfig, ChartTooltipContent, {
  indicator: 'line',
  hideLabel: true,
  class: props.widgetId ? `codex-trend-tooltip-${props.widgetId}` : 'codex-trend-tooltip',
});

const checkPermissions = async () => {
  if (!perm.isSupported) {
    permissionMap.value = {
      'system.cpu': false,
      'system.memory': false,
    };
    return permissionMap.value;
  }
  const next: Record<SystemPermission, boolean> = { ...permissionMap.value };
  next['system.cpu'] = showCpu.value ? await perm.contains({ permissions: ['system.cpu'] }) : false;
  next['system.memory'] = showMemory.value ? await perm.contains({ permissions: ['system.memory'] }) : false;
  permissionMap.value = next;
  return next;
};

const buildSections = (payload: { battery: any; cpuInfo: any; memoryInfo: any; cpuUsageRatio: number | null }) => {
  const built: InfoSection[] = [];

  if (showBattery.value) {
    const battery = payload.battery;
    const batteryItems: InfoItem[] = [];
    if (battery && autoRefreshEnabled.value && batteryTrend.value.length >= 2) {
      batteryItems.push({ label: '趋势', value: '', full: true, sparkline: [...batteryTrend.value] });
    }
    if (battery && typeof battery.level === 'number') {
      batteryItems.push({ label: '电量', value: formatPercent(battery.level) });
    }
    if (battery) {
      batteryItems.push(
        { label: '充电中', value: formatBool(battery.charging) },
        {
          label: '充电剩余',
          value:
            typeof battery.chargingTime === 'number' && Number.isFinite(battery.chargingTime)
              ? `${Math.max(0, Math.round(battery.chargingTime))} 秒`
              : '—',
        },
        {
          label: '可用时长',
          value:
            typeof battery.dischargingTime === 'number' && Number.isFinite(battery.dischargingTime)
              ? `${Math.max(0, Math.round(battery.dischargingTime))} 秒`
              : '—',
        },
      );
    } else {
      batteryItems.push({ label: '电池', value: '当前环境不可用（部分桌面浏览器不再支持）' });
    }
    if (batteryItems.length) built.push({ title: '电池', items: batteryItems });
  }

  if (showCpu.value) {
    const cpuInfo = payload.cpuInfo;
    const cpu: InfoItem[] = [];
    if (autoRefreshEnabled.value && cpuTrend.value.length >= 2) {
      cpu.push({ label: '趋势', value: '', full: true, sparkline: [...cpuTrend.value] });
    }
    if (cpuInfo) {
      cpu.push(
        { label: 'CPU 架构', value: String(cpuInfo.archName ?? '—'), mono: true },
        { label: 'CPU 型号', value: String(cpuInfo.modelName ?? '—') },
        { label: 'CPU 核心数', value: Number.isFinite(cpuInfo.numOfProcessors) ? `${cpuInfo.numOfProcessors}` : '—' },
        {
          label: 'CPU 使用率（估算）',
          value: payload.cpuUsageRatio === null ? '—' : formatPercent(payload.cpuUsageRatio),
        },
      );
    } else {
      cpu.push({
        label: 'CPU 详情',
        value: perm.isSupported ? '暂时无法获取（可能未开启访问授权，或当前环境不支持）' : '当前环境不可用',
      });
    }
    if (cpu.length) built.push({ title: 'CPU', items: cpu });
  }

  if (showMemory.value) {
    const memoryInfo = payload.memoryInfo;
    const memory: InfoItem[] = [];
    if (autoRefreshEnabled.value && memoryTrend.value.length >= 2) {
      memory.push({ label: '趋势', value: '', full: true, sparkline: [...memoryTrend.value] });
    }
    if (memoryInfo) {
      const capacity = Number(memoryInfo.capacity);
      const available = Number(memoryInfo.availableCapacity);
      const used = Number.isFinite(capacity) && Number.isFinite(available) ? Math.max(0, capacity - available) : null;
      memory.push(
        { label: '系统内存总量', value: formatBytes(capacity) },
        { label: '系统内存可用', value: formatBytes(available) },
        { label: '系统内存已用', value: used === null ? '—' : formatBytes(used) },
        {
          label: '系统内存占用',
          value: used === null || !Number.isFinite(capacity) || capacity <= 0 ? '—' : formatPercent(used / capacity),
        },
      );
    } else {
      memory.push({
        label: '系统内存',
        value: perm.isSupported ? '暂时无法获取（可能未开启访问授权，或当前环境不支持）' : '当前环境不可用',
      });
    }
    if (memory.length) built.push({ title: '内存', items: memory });
  }

  return built;
};

const refresh = async () => {
  if (loading.value) return;
  loading.value = true;
  errorText.value = null;
  try {
    const perms = await checkPermissions();
    const battery = showBattery.value ? await readBatteryInfo() : null;

    const cpuInfo = showCpu.value && perms['system.cpu'] ? await readChromeSystemCpuInfo() : null;
    const nextCpuSample = cpuInfo ? buildCpuSample(cpuInfo) : null;
    const cpuUsageRatio = showCpu.value ? computeCpuUsageRatio(lastCpuSample.value, nextCpuSample) : null;
    lastCpuSample.value = nextCpuSample ?? lastCpuSample.value;

    const memoryInfo = showMemory.value && perms['system.memory'] ? await readChromeSystemMemoryInfo() : null;

    if (autoRefreshEnabled.value) {
      if (showCpu.value && cpuUsageRatio !== null) {
        pushTrend(cpuTrend, cpuUsageRatio);
      }
      if (showBattery.value && battery && typeof battery.level === 'number') {
        pushTrend(batteryTrend, battery.level);
      }
      if (showMemory.value && memoryInfo) {
        const capacity = Number((memoryInfo as any).capacity);
        const available = Number((memoryInfo as any).availableCapacity);
        if (Number.isFinite(capacity) && capacity > 0 && Number.isFinite(available)) {
          const usedRatio = Math.max(0, Math.min(1, (capacity - available) / capacity));
          pushTrend(memoryTrend, usedRatio);
        }
      }
    }

    updatedAt.value = Date.now();
    rawSnapshot.value = {
      updatedAt: updatedAt.value,
      permission: { supported: perm.isSupported, ...perms },
      navigator: {
        userAgent: navigator.userAgent,
        platform: (navigator as any).platform,
        language: navigator.language,
        languages: navigator.languages,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        maxTouchPoints: (navigator as any).maxTouchPoints,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: (navigator as any).doNotTrack,
      },
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        orientation: (screen.orientation as any)?.type,
      },
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      ...(showBattery.value ? { battery } : {}),
      chromeSystem: {
        cpuInfo,
        memoryInfo,
      },
    };

    sections.value = buildSections({
      battery,
      cpuInfo,
      memoryInfo,
      cpuUsageRatio,
    });
  } catch (error) {
    void error;
    errorText.value = '读取失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
};

const copySnapshot = async () => {
  const text = JSON.stringify(rawSnapshot.value ?? {}, null, 2);
  try {
    await navigator.clipboard?.writeText?.(text);
  } catch (err) {
    console.warn('copy snapshot failed', err);
  }
};

const handleResize = () => {
  // 仅更新屏幕/窗口类字段即可：简单起见直接触发一次 refresh（读取代价很低）
  void refresh();
};

const resetAutoRefresh = () => {
  if (autoRefreshTimer) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
  const seconds = refreshIntervalSeconds.value;
  if (!seconds) {
    cpuTrend.value = [];
    batteryTrend.value = [];
    memoryTrend.value = [];
    return;
  }
  autoRefreshTimer = window.setInterval(() => {
    if (loading.value) return;
    void refresh();
  }, seconds * 1000);
};

const scheduleLayoutReflow = () => {
  if (!props.editMode) return;
  if (layoutReflowTimer) window.clearTimeout(layoutReflowTimer);
  layoutReflowTimer = window.setTimeout(() => {
    layoutVersion.value += 1;
  }, 120);
};

watch(
  () => refreshIntervalSeconds.value,
  () => {
    resetAutoRefresh();
  },
);

watch(
  () => [showBattery.value, showCpu.value, showMemory.value] as const,
  () => {
    if (!showBattery.value) batteryTrend.value = [];
    if (!showCpu.value) cpuTrend.value = [];
    if (!showMemory.value) memoryTrend.value = [];
    void refresh();
  },
);

onMounted(async () => {
  await refresh();
  resetAutoRefresh();
  window.addEventListener('resize', handleResize);
  window.addEventListener('online', refresh as EventListener);
  window.addEventListener('offline', refresh as EventListener);
  window.addEventListener('codex-system-permission-changed', refresh as EventListener);
  window.addEventListener('codex-grid-reflow', scheduleLayoutReflow as EventListener);
});

onBeforeUnmount(() => {
  if (autoRefreshTimer) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
  if (layoutReflowTimer) {
    window.clearTimeout(layoutReflowTimer);
    layoutReflowTimer = undefined;
  }
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('online', refresh as EventListener);
  window.removeEventListener('offline', refresh as EventListener);
  window.removeEventListener('codex-system-permission-changed', refresh as EventListener);
  window.removeEventListener('codex-grid-reflow', scheduleLayoutReflow as EventListener);
});
</script>

<template>
  <div class="text-foreground flex h-full min-h-0 flex-col gap-3">
    <Teleport v-if="controlsTo" :to="controlsTo">
      <Tooltip>
        <TooltipTrigger as-child>
          <span class="inline-flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
              aria-label="刷新系统信息"
              :disabled="loading"
              @click.stop.prevent="refresh"
            >
              <RefreshCcw class="h-3.5 w-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">刷新</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
            aria-label="复制系统信息"
            @click.stop.prevent="copySnapshot"
          >
            <Copy class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">复制</TooltipContent>
      </Tooltip>
    </Teleport>

    <Teleport v-if="statusTo" :to="statusTo">
      <Badge
        variant="outline"
        class="border-border/40 bg-background/50 text-muted-foreground text-[11px] shadow-sm backdrop-blur-sm"
      >
        {{ autoRefreshEnabled ? `自动刷新 ${refreshIntervalSeconds} 秒` : '未开启自动刷新' }}
      </Badge>
      <Badge
        variant="outline"
        class="border-border/40 bg-background/50 text-muted-foreground text-[11px] shadow-sm backdrop-blur-sm"
      >
        更新时间 {{ formatTime(updatedAt) }}
      </Badge>
    </Teleport>

    <div v-if="!props.showTitle" class="text-foreground px-1 text-sm font-medium">系统信息</div>

    <div
      v-if="errorText"
      class="border-border/60 bg-muted/30 rounded-xl border px-3 py-2 text-sm text-amber-700 dark:text-amber-500"
    >
      {{ errorText }}
    </div>

    <div v-else class="@container/system min-h-0 flex-1 pr-1">
      <div class="space-y-4">
        <div
          :key="layoutVersion"
          class="grid grid-cols-1 gap-4 @[680px]/system:grid-cols-2 @[980px]/system:grid-cols-3 @[1280px]/system:grid-cols-4"
        >
          <div v-for="section in sections" :key="section.title" class="@container/section min-w-0 space-y-2">
            <div class="flex items-center gap-2">
              <div class="text-foreground text-xs font-semibold">{{ section.title }}</div>
              <Separator class="flex-1 opacity-50" />
            </div>
            <div class="grid gap-1.5 @[26rem]/section:grid-cols-2">
              <div
                v-for="item in section.items"
                :key="`${section.title}-${item.label}`"
                class="border-border/50 bg-background/20 overflow-hidden rounded-xl border px-3 py-2"
                :class="item.full ? '@[26rem]/section:col-span-2' : ''"
              >
                <div class="text-muted-foreground text-[11px] font-medium">{{ item.label }}</div>
                <div
                  class="text-foreground mt-0.5 text-sm break-words"
                  :class="item.mono ? 'font-mono text-[12px]' : ''"
                >
                  <div v-if="item.sparkline?.length" class="pt-1">
                    <ChartContainer :config="trendChartConfig" cursor class="text-primary aspect-auto h-[72px] w-full">
                      <VisXYContainer
                        :data="buildTrendData(item.sparkline)"
                        :height="TREND_CHART_HEIGHT"
                        :margin="{ top: 6, right: 6, bottom: 6, left: 6 }"
                        :y-domain="[0, 1]"
                      >
                        <ChartTooltip />
                        <ChartCrosshair
                          :x="(d: any) => d.index"
                          :y="(d: any) => d.value"
                          :template="trendTooltipTemplate"
                          color="#0000"
                        />
                        <VisArea
                          :x="(d: any) => d.index"
                          :y="(d: any) => d.value"
                          :color="() => 'currentColor'"
                          :opacity="0.18"
                        />
                        <VisLine
                          :x="(d: any) => d.index"
                          :y="(d: any) => d.value"
                          :color="() => 'currentColor'"
                          :line-width="1"
                        />
                      </VisXYContainer>
                    </ChartContainer>
                  </div>
                  <span v-else>{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
