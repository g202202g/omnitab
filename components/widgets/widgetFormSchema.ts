import { z } from 'zod';
import { WIDGET_TYPE_LIST } from './types';
import type { ZodTypeAny } from 'zod';
import { emptyStringToUndefined } from './widgetSchemaUtils';

type WidgetBaseFormLike = {
  title?: unknown;
  icon?: unknown;
  description?: unknown;
  type?: unknown;
  showTitle?: unknown;
  showBorder?: unknown;
  showBackground?: unknown;
};

export type WidgetEditorFormValues = {
  base: WidgetBaseFormLike;
  custom: Record<string, unknown>;
};

const baseSchema = z
  .object({
    type: z
      .string()
      .min(1, '请选择卡片类型')
      .refine((v: string) => (WIDGET_TYPE_LIST as readonly string[]).includes(v), '暂不支持该类型'),
    title: z.string().trim().max(40, '标题最多 40 个字符'),
    icon: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
    description: z.preprocess(emptyStringToUndefined, z.string().trim().max(200, '描述最多 200 个字符').optional()),
    showTitle: z.coerce.boolean().optional(),
    showBorder: z.coerce.boolean().optional(),
    showBackground: z.coerce.boolean().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (data.title) return;
    if (data.icon) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['title'],
      message: '标题不能为空（或选择一个图标）',
    });
  });

/**
 * 生成 WidgetEditorForm 的整表校验 schema：
 * - `validateCustom=false` 用于第 1 步（基础设置）仅校验 base，避免阻塞“下一步”
 * - `validateCustom=true` 用于最终提交时校验 base + custom
 */
export const buildWidgetEditorSchema = (validateCustom: boolean, buildCustomSchema?: () => ZodTypeAny) => {
  return z.object({
    base: baseSchema,
    custom: validateCustom
      ? buildCustomSchema
        ? buildCustomSchema()
        : z.object({}).passthrough()
      : z.object({}).passthrough(),
  });
};
