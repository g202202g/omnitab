import { z } from 'zod';
import { finiteIntInRange } from '@/components/widgets/widgetSchemaUtils';

const stateSchema = z
  .string()
  .refine((v) => ['all', 'in_progress', 'complete', 'interrupted'].includes(v), '下载状态筛选不受支持');

export const buildDownloadsCustomSchema = () =>
  z
    .object({
      __permissionGranted: z.coerce.boolean().refine((v) => v, '请先开启访问授权，才能显示下载列表'),
      maxItems: finiteIntInRange({
        min: 5,
        max: 200,
        finiteMessage: '显示数量请输入有效数字',
        intMessage: '显示数量必须为整数',
        minMessage: '显示数量至少为 5',
        maxMessage: '显示数量不能超过 200',
      }),
      state: stateSchema.default('in_progress'),
      autoRefreshSeconds: finiteIntInRange({
        min: 0,
        max: 60,
        finiteMessage: '自动刷新间隔请输入有效数字',
        intMessage: '自动刷新间隔必须为整数',
        minMessage: '自动刷新间隔不能小于 0 秒',
        maxMessage: '自动刷新间隔不能超过 60 秒',
      }),
      showUrl: z.coerce.boolean().optional(),
    })
    .passthrough()
    .transform((data) => {
      const { __permissionGranted: _ignored, ...rest } = data as Record<string, unknown>;
      return rest;
    });
