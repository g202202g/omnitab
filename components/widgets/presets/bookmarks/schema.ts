import { z } from 'zod';
import { emptyStringToUndefined, finiteIntInRange } from '@/components/widgets/widgetSchemaUtils';

export const buildBookmarksCustomSchema = () =>
  z
    .object({
      __permissionGranted: z.coerce.boolean().refine((v) => v, '请先开启访问授权，才能显示书签'),
      folderId: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
      displayMode: z.enum(['default', 'icon-only']).optional(),
      maxItems: finiteIntInRange({
        min: 1,
        max: 200,
        finiteMessage: '最大显示数量请输入有效数字',
        intMessage: '最大显示数量必须为整数',
        minMessage: '最大显示数量至少为 1',
        maxMessage: '最大显示数量不能超过 200',
      }),
      showFavicon: z.coerce.boolean().optional(),
    })
    .passthrough()
    .transform((data) => {
      const { __permissionGranted: _ignored, ...rest } = data as Record<string, unknown>;
      return rest;
    });
