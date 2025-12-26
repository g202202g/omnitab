import { onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import { storage } from 'wxt/utils/storage';

/**
 * 参考 WXT 官方示例：读取一次，双向同步 storage，监听外部变更。
 * 用法：
 * const state = useStoredValue('local:key', { foo: 1 });
 * state.state.value 读写；state.reload() 重新加载存储。
 */
export function useStoredValue<T>(
  key: `local:${string}` | `session:${string}` | `sync:${string}` | `managed:${string}`,
  fallback: T,
) {
  const item = storage.defineItem<T>(key, { fallback });

  const state = ref<T>(fallback);
  const ready = ref(false);
  let stopWatchStorage: (() => void) | null = null;

  const load = async () => {
    const value = await item.getValue();
    state.value = value;
    ready.value = true;
  };

  const persist = async (value: T) => {
    const raw = toRaw(value) as T;
    const plain = (() => {
      try {
        return structuredClone(raw);
      } catch {
        return JSON.parse(JSON.stringify(raw)) as T;
      }
    })();
    await item.setValue(plain);
  };

  const isRestoreLocked = () => {
    try {
      return (globalThis as unknown as { __OMNITAB_RESTORE_LOCK__?: boolean }).__OMNITAB_RESTORE_LOCK__ === true;
    } catch {
      return false;
    }
  };

  onMounted(async () => {
    await load();
    stopWatchStorage = item.watch((value) => {
      state.value = value;
    });
  });

  onBeforeUnmount(() => {
    stopWatchStorage?.();
  });

  watch(
    state,
    (value) => {
      if (!ready.value) return;
      if (isRestoreLocked()) return;
      void persist(value);
    },
    { deep: true },
  );

  return {
    state,
    ready,
    reload: load,
    set: (value: T) => {
      state.value = value;
    },
  };
}
