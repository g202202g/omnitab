export const LAYOUT_BREAKPOINTS = ['base', 'sm', 'md', 'lg', 'xl', '2xl'] as const;

export type LayoutBreakpoint = (typeof LAYOUT_BREAKPOINTS)[number];

export const isLayoutBreakpoint = (value: unknown): value is LayoutBreakpoint =>
  typeof value === 'string' && (LAYOUT_BREAKPOINTS as readonly string[]).includes(value);

/**
 * 按 Tailwind 的断点语义（sm=640, md=768, lg=1024, xl=1280, 2xl=1536）。
 * 这里建议使用“网格容器宽度”来判断，避免页面 padding/侧边栏导致误判。
 */
export const resolveLayoutBreakpoint = (width: number): LayoutBreakpoint => {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return 'base';
  if (w >= 1536) return '2xl';
  if (w >= 1280) return 'xl';
  if (w >= 1024) return 'lg';
  if (w >= 768) return 'md';
  if (w >= 640) return 'sm';
  return 'base';
};

