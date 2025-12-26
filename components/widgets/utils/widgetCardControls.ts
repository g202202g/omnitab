import type { Ref } from 'vue';

export const WIDGET_CARD_CONTROLS_TARGET_KEY: unique symbol = Symbol('codex-widget-card-controls-target');
export const WIDGET_CARD_STATUS_TARGET_KEY: unique symbol = Symbol('codex-widget-card-status-target');
export const WIDGET_CARD_BOTTOM_OVERLAY_TARGET_KEY: unique symbol = Symbol('codex-widget-card-bottom-overlay-target');

export type WidgetCardControlsTarget = Ref<HTMLElement | null>;
export type WidgetCardStatusTarget = Ref<HTMLElement | null>;
export type WidgetCardBottomOverlayTarget = Ref<HTMLElement | null>;
