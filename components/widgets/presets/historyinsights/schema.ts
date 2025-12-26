import { z } from 'zod';
import { finiteIntInRange } from '@/components/widgets/widgetSchemaUtils';

export const buildHistoryInsightsCustomSchema = () =>
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
      topDomains: finiteIntInRange({
        min: 3,
        max: 50,
        finiteMessage: '常访问网站数量请输入有效数字',
        intMessage: '常访问网站数量必须为整数',
        minMessage: '常访问网站数量至少为 3',
        maxMessage: '常访问网站数量不能超过 50',
      }),
      showFavicon: z.coerce.boolean().optional(),
    })
    .passthrough()
    .transform((data) => {
      const { __permissionGranted: _ignored, ...rest } = data as Record<string, unknown>;
      return rest;
    });
