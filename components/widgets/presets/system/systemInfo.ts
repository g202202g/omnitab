import { browser } from 'wxt/browser';

export const SYSTEM_PERMISSIONS = ['system.cpu', 'system.memory'] as const;

export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number];

export type CpuSample = {
  timestamp: number;
  processors: Array<{ usage: { idle: number; total: number } }>;
};

const formatNumber = (value: number, fractionDigits = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(num);
};

export const formatBytes = (bytes?: number | null) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${formatNumber(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'] as const;
  let cursor = value / 1024;
  let unitIndex = 0;
  while (cursor >= 1024 && unitIndex < units.length - 1) {
    cursor /= 1024;
    unitIndex += 1;
  }
  const digits = cursor >= 100 ? 0 : cursor >= 10 ? 1 : 2;
  return `${formatNumber(cursor, digits)} ${units[unitIndex]}`;
};

export const formatPercent = (ratio?: number | null) => {
  const value = Number(ratio);
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value * 100, 1)}%`;
};

export const formatBool = (value?: boolean | null) => {
  if (value === true) return '是';
  if (value === false) return '否';
  return '—';
};

export const readChromeRuntimeManifest = () => {
  try {
    return (browser as any)?.runtime?.getManifest?.() ?? null;
  } catch {
    return null;
  }
};

export const readNavigatorUserAgentData = async () => {
  const uaData = (navigator as any)?.userAgentData;
  if (!uaData) return null;
  try {
    const highEntropy =
      typeof uaData.getHighEntropyValues === 'function'
        ? await uaData.getHighEntropyValues([
            'architecture',
            'bitness',
            'model',
            'platform',
            'platformVersion',
            'uaFullVersion',
            'fullVersionList',
          ])
        : null;
    return {
      mobile: uaData.mobile ?? undefined,
      platform: uaData.platform ?? undefined,
      brands: Array.isArray(uaData.brands) ? uaData.brands : undefined,
      highEntropy: highEntropy ?? undefined,
    };
  } catch {
    return {
      mobile: uaData.mobile ?? undefined,
      platform: uaData.platform ?? undefined,
      brands: Array.isArray(uaData.brands) ? uaData.brands : undefined,
    };
  }
};

export const readNavigatorConnection = () => {
  const conn =
    (navigator as any)?.connection ?? (navigator as any)?.mozConnection ?? (navigator as any)?.webkitConnection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType ?? undefined,
    downlink: conn.downlink ?? undefined,
    downlinkMax: conn.downlinkMax ?? undefined,
    rtt: conn.rtt ?? undefined,
    saveData: conn.saveData ?? undefined,
    type: conn.type ?? undefined,
  };
};

export const readBatteryInfo = async () => {
  const getBattery = (navigator as any)?.getBattery;
  if (typeof getBattery !== 'function') return null;
  try {
    const battery = await getBattery.call(navigator);
    if (!battery) return null;
    return {
      charging: battery.charging ?? undefined,
      level: typeof battery.level === 'number' ? battery.level : undefined,
      chargingTime: typeof battery.chargingTime === 'number' ? battery.chargingTime : undefined,
      dischargingTime: typeof battery.dischargingTime === 'number' ? battery.dischargingTime : undefined,
    };
  } catch {
    return null;
  }
};

export const readStorageEstimate = async () => {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate ?? null;
  } catch {
    return null;
  }
};

export const readStoragePersisted = async () => {
  try {
    const persisted = await navigator.storage?.persisted?.();
    return typeof persisted === 'boolean' ? persisted : null;
  } catch {
    return null;
  }
};

export const readPerformanceMemory = () => {
  const perf: any = performance as any;
  const mem = perf?.memory;
  if (!mem) return null;
  return {
    jsHeapSizeLimit: typeof mem.jsHeapSizeLimit === 'number' ? mem.jsHeapSizeLimit : undefined,
    totalJSHeapSize: typeof mem.totalJSHeapSize === 'number' ? mem.totalJSHeapSize : undefined,
    usedJSHeapSize: typeof mem.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : undefined,
  };
};

export const buildCpuSample = (cpuInfo: any): CpuSample | null => {
  const processors = Array.isArray(cpuInfo?.processors) ? cpuInfo.processors : null;
  if (!processors?.length) return null;
  const mapped = processors
    .map((p: any) => {
      const usage = p?.usage;
      const idle = Number(usage?.idle);
      const total = Number(usage?.total);
      if (!Number.isFinite(idle) || !Number.isFinite(total) || total <= 0) return null;
      return { usage: { idle, total } };
    })
    .filter(Boolean) as Array<{ usage: { idle: number; total: number } }>;
  if (!mapped.length) return null;
  return { timestamp: Date.now(), processors: mapped };
};

export const computeCpuUsageRatio = (prev?: CpuSample | null, next?: CpuSample | null) => {
  if (!prev || !next) return null;
  const count = Math.min(prev.processors.length, next.processors.length);
  if (count <= 0) return null;
  let deltaTotal = 0;
  let deltaIdle = 0;
  for (let i = 0; i < count; i += 1) {
    const p0 = prev.processors[i]?.usage;
    const p1 = next.processors[i]?.usage;
    if (!p0 || !p1) continue;
    const dt = p1.total - p0.total;
    const di = p1.idle - p0.idle;
    if (!Number.isFinite(dt) || !Number.isFinite(di) || dt <= 0) continue;
    deltaTotal += dt;
    deltaIdle += Math.max(0, di);
  }
  if (deltaTotal <= 0) return null;
  const used = Math.max(0, deltaTotal - deltaIdle);
  return Math.max(0, Math.min(1, used / deltaTotal));
};

export const readChromeSystemCpuInfo = async () => {
  const api: any = (browser as any)?.system?.cpu;
  if (!api?.getInfo) return null;
  try {
    return (await api.getInfo()) ?? null;
  } catch {
    return null;
  }
};

export const readChromeSystemMemoryInfo = async () => {
  const api: any = (browser as any)?.system?.memory;
  if (!api?.getInfo) return null;
  try {
    return (await api.getInfo()) ?? null;
  } catch {
    return null;
  }
};

// 存储（磁盘）信息如需展示，可启用 system.storage（当前卡片未使用）
