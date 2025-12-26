import { z } from 'zod';
import {
  emptyStringToUndefined,
  finiteIntInRange,
  isAllowedUrl,
  isValidCssSelector,
} from '@/components/widgets/widgetSchemaUtils';

export const buildIframeCustomSchema = () =>
  z
    .object({
      url: z
        .string()
        .trim()
        .min(1, '请输入网页链接')
        .refine(
          (v) => isAllowedUrl(v, ['https:', 'http:', 'data:']),
          '链接格式不正确，建议直接粘贴浏览器地址栏里的完整链接',
        ),
      selector: z.preprocess(
        emptyStringToUndefined,
        z
          .string()
          .trim()
          .max(200, '内容最多 200 个字符')
          .refine((v) => isValidCssSelector(v), '内容格式不正确')
          .optional(),
      ),
      customStyle: z.preprocess(emptyStringToUndefined, z.string().max(8000, '内容过长（最多 8000 字符）').optional()),
      uaMode: z.enum(['desktop', 'mobile']).optional(),
      autoRefreshSeconds: finiteIntInRange({
        min: 0,
        max: 3600,
        finiteMessage: '请输入有效数字',
        intMessage: '请输入整数',
        minMessage: '不能小于 0',
        maxMessage: '不能超过 3600',
      }).optional(),
    })
    .passthrough();
