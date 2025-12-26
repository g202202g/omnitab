import type { InjectionKey, Ref } from 'vue';
import type { MotionValue } from 'motion-v';
import type { FloatingDockIndicatorPosition, FloatingDockOrientation, FloatingDockVariant } from './types';

export const FLOATING_DOCK_VARIANT_KEY: InjectionKey<FloatingDockVariant> = Symbol('FLOATING_DOCK_VARIANT_KEY');

export const FLOATING_DOCK_MOUSE_POSITION_KEY: InjectionKey<MotionValue<number>> = Symbol(
  'FLOATING_DOCK_MOUSE_POSITION_KEY',
);

export const FLOATING_DOCK_ORIENTATION_KEY: InjectionKey<Ref<FloatingDockOrientation>> = Symbol(
  'FLOATING_DOCK_ORIENTATION_KEY',
);

export const FLOATING_DOCK_MOBILE_CLOSE_KEY: InjectionKey<() => void> = Symbol('FLOATING_DOCK_MOBILE_CLOSE_KEY');

export const FLOATING_DOCK_MOBILE_OPEN_KEY: InjectionKey<Ref<boolean>> = Symbol('FLOATING_DOCK_MOBILE_OPEN_KEY');

export const FLOATING_DOCK_MOBILE_INDEX_KEY: InjectionKey<() => number> = Symbol('FLOATING_DOCK_MOBILE_INDEX_KEY');

export const FLOATING_DOCK_INDICATOR_POSITION_KEY: InjectionKey<Ref<FloatingDockIndicatorPosition | undefined>> =
  Symbol('FLOATING_DOCK_INDICATOR_POSITION_KEY');
