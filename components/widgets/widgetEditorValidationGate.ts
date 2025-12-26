import type { InjectionKey, Ref } from 'vue';

export const WIDGET_EDITOR_VALIDATE_ON_INTERACTION: InjectionKey<Ref<boolean>> = Symbol(
  'codex-widget-editor-validate-on-interaction',
);
