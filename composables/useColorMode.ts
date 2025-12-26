import { computed, effectScope, watch } from 'vue';
import { useDark, usePreferredDark, useStorage } from '@vueuse/core';

export type ColorPreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'newtab-color-mode';
const preference = useStorage<ColorPreference>(STORAGE_KEY, 'system');
const preferredDark = usePreferredDark();
const appliedDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
  storageKey: undefined,
});

const scope = effectScope();
scope.run(() => {
  watch(
    [preference, preferredDark],
    ([pref, systemDark]) => {
      appliedDark.value = pref === 'system' ? systemDark : pref === 'dark';
    },
    { immediate: true },
  );
});

const resolvedMode = computed<'dark' | 'light'>(() => (appliedDark.value ? 'dark' : 'light'));

let initialized = false;
export const initColorMode = () => {
  if (!initialized) {
    initialized = true;
    // preference watcher already active via effect scope
  }
  return preference.value;
};

export function useColorModePreference() {
  const setPreference = (value: ColorPreference) => {
    preference.value = value;
  };

  const togglePreference = () => {
    setPreference(preference.value === 'dark' ? 'light' : 'dark');
  };

  return {
    preference,
    resolvedMode,
    isDark: computed(() => resolvedMode.value === 'dark'),
    setPreference,
    togglePreference,
  };
}
