import { z } from 'zod';
import { finiteIntInRange } from '@/components/widgets/widgetSchemaUtils';

export const buildTopSitesCustomSchema = () =>
  z
    .object({
      __permissionGranted: z.coerce.boolean().refine((v) => v, '请先开启访问授权，才能显示常访问站点'),
      maxItems: finiteIntInRange({
        min: 4,
        max: 60,
        finiteMessage: '显示数量请输入有效数字',
        intMessage: '显示数量必须为整数',
        minMessage: '显示数量至少为 4',
        maxMessage: '显示数量不能超过 60',
      }),
      displayMode: z
        .string()
        .refine((v) => ['default', 'icon-only'].includes(v), '显示模式不受支持')
        .default('default'),
      showFavicon: z.coerce.boolean().optional(),
    })
    .passthrough()
    .transform((data) => {
      const { __permissionGranted: _ignored, ...rest } = data as Record<string, unknown>;
      return rest;
    });
