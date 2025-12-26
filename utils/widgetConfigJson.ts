import { widgetDefinitions } from '@/components/widgets/registry';
import type { WidgetType } from '@/components/widgets/types';

export type WidgetConfigJsonV1 = {
  version: 1;
  kind?: 'card';
  type: WidgetType;
  name?: string;
  icon?: string;
  description?: string;
  showBorder?: boolean;
  showTitle?: boolean;
  showBackground?: boolean;
  w?: number;
  h?: number;
  data?: Record<string, unknown>;
};

export type WidgetConfigJsonParseResult = { ok: true; value: WidgetConfigJsonV1 } | { ok: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isWidgetType = (value: unknown): value is WidgetType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(widgetDefinitions, value);

export const parseWidgetConfigJson = (text: string): WidgetConfigJsonParseResult => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: '请先粘贴或选择一个配置文件。' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, message: '内容无法识别，请确认这是一个配置文件。' };
  }

  if (!isRecord(parsed)) return { ok: false, message: '内容无法识别，请确认这是一个配置文件。' };

  const version = Number(parsed.version);
  if (version !== 1) return { ok: false, message: '这个配置文件暂不支持。' };

  const typeRaw = parsed.type;
  if (!isWidgetType(typeRaw)) return { ok: false, message: '这个配置文件里的卡片类型当前不可用。' };

  const normalizeText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const normalizeBool = (value: unknown) => (typeof value === 'boolean' ? value : undefined);
  const normalizeNumber = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const dataRaw = parsed.data;
  const data = isRecord(dataRaw) ? { ...dataRaw } : undefined;

  const value: WidgetConfigJsonV1 = {
    version: 1,
    kind: parsed.kind === 'card' ? 'card' : undefined,
    type: typeRaw,
    name: normalizeText(parsed.name),
    icon: normalizeText(parsed.icon),
    description: normalizeText(parsed.description),
    showBorder: normalizeBool(parsed.showBorder),
    showTitle: normalizeBool(parsed.showTitle),
    showBackground: normalizeBool(parsed.showBackground),
    w: normalizeNumber(parsed.w),
    h: normalizeNumber(parsed.h),
    data,
  };

  return { ok: true, value };
};
