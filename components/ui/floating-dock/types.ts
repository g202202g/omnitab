import type { Component, HTMLAttributes } from 'vue';

export type FloatingDockOrientation = 'horizontal' | 'vertical';
export type FloatingDockDirection = 'top' | 'middle' | 'bottom';
export type FloatingDockVariant = 'desktop' | 'mobile';
export type FloatingDockIndicatorPosition = 'top' | 'bottom' | 'left' | 'right';

export interface FloatingDockItemProps {
  title: string;
  href?: string;
  icon?: Component;
  iconClass?: HTMLAttributes['class'];
  target?: HTMLAnchorElement['target'];
  rel?: HTMLAnchorElement['rel'];
  ariaLabel?: string;
  active?: boolean;
  indicatorPosition?: FloatingDockIndicatorPosition;
  onClick?: () => void;
}
