import { z } from 'zod';

/**
 * 系统信息组件的自定义配置校验。
 * - refreshIntervalSeconds: 定时刷新间隔（秒），0 表示关闭。
 * - showBattery/showCpu/showMemory: 是否展示电池/CPU/系统内存模块（会影响权限校验与采样逻辑）。
 */
export const buildSystemCustomSchema = () =>
  z
    .object({
      __permissionGranted: z.coerce.boolean().optional(),
      refreshIntervalSeconds: z.coerce
        .number()
        .finite('刷新间隔请输入有效数字')
        .int('刷新间隔必须为整数')
        .min(0, '刷新间隔不能小于 0（0 表示关闭）')
        .max(3600, '刷新间隔不能超过 3600 秒')
        .optional(),
      showBattery: z.coerce.boolean().optional(),
      showCpu: z.coerce.boolean().optional(),
      showMemory: z.coerce.boolean().optional(),
    })
    .passthrough()
    .superRefine((data, ctx) => {
      const showCpu = (data as any)?.showCpu !== false;
      const showMemory = (data as any)?.showMemory !== false;
      if (!showCpu && !showMemory) return;
      const ok = Boolean((data as any).__permissionGranted);
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '请先开启所选内容的访问授权',
          path: ['__permissionGranted'],
        });
      }
    })
    .transform((data: any) => {
      const showBattery = (data as any)?.showBattery !== false;
      const showCpu = (data as any)?.showCpu !== false;
      const showMemory = (data as any)?.showMemory !== false;
      const raw = Number((data as any)?.refreshIntervalSeconds);
      const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(3600, Math.floor(raw))) : 30;
      const { __permissionGranted: _ignored, ...rest } = data as Record<string, unknown>;
      return {
        ...rest,
        refreshIntervalSeconds: normalized,
        showBattery,
        showCpu,
        showMemory,
      };
    });
