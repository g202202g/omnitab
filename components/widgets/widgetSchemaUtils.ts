import { z } from 'zod';

export const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;
  return value.trim() ? value : undefined;
};

export const isAllowedUrl = (value: string, allowProtocols: readonly string[]) => {
  try {
    const url = new URL(value);
    return allowProtocols.includes(url.protocol.toLowerCase());
  } catch {
    return false;
  }
};

export const isValidCssSelector = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (typeof document === 'undefined') return true;
  try {
    document.createElement('div').querySelector(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const finiteIntInRange = (opts: {
  min: number;
  max: number;
  minMessage: string;
  maxMessage: string;
  intMessage: string;
  finiteMessage?: string;
}) =>
  z.coerce
    .number()
    .finite(opts.finiteMessage ?? '请输入有效数字')
    .int(opts.intMessage)
    .min(opts.min, opts.minMessage)
    .max(opts.max, opts.maxMessage);
