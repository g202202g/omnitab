import { z } from 'zod';
import { finiteIntInRange } from '@/components/widgets/widgetSchemaUtils';

export const buildHistoryCustomSchema = () =>
  z
    .object({
      __permissionGranted: z.coerce.boolean().refine((v) => v, '请先开启访问授权，才能显示浏览记录'),
      daysRange: finiteIntInRange({
        min: 1,
        max: 365,
        finiteMessage: '时间范围请输入有效数字',
        intMessage: '时间范围必须为整数',
        minMessage: '时间范围至少为 1 天',
        maxMessage: '时间范围不能超过 365 天',
      }),
      maxItems: finiteIntInRange({
        min: 1,
        max: 200,
        finiteMessage: '每次加载数量请输入有效数字',
        intMessage: '每次加载数量必须为整数',
        minMessage: '每次加载数量至少为 1',
        maxMessage: '每次加载数量不能超过 200',
      }),
      displayMode: z
        .string()
        .refine((v) => ['default', 'icon-only'].includes(v), '显示模式不受支持')
        .default('default'),
      showFavicon: z.coerce.boolean().optional(),
      showTime: z.coerce.boolean().optional(),
    })
    .passthrough()
    .transform((data) => {
      const { __permissionGranted: _ignored, ...rest } = data as Record<string, unknown>;
      return rest;
    });
