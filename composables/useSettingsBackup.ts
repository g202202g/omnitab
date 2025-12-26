import { ref, shallowRef } from 'vue';
import { browser } from 'wxt/browser';
import { useLog } from './useLog';
import { usePageStore } from './usePageStore';
import { useWidgetStore } from './useWidgetStore';

type BackupPayload = {
  version: 1;
  createdAt: number;
  storageLocal: Record<string, unknown>;
  storageSync?: Record<string, unknown>;
  localPrefs?: Record<string, string>;
};

const logger = useLog('settings-backup');

const readLocalPrefs = () => {
  const prefs: Record<string, string> = {};
  try {
    const color = window.localStorage.getItem('newtab-color-mode');
    if (typeof color === 'string' && color.trim()) prefs['newtab-color-mode'] = color;
  } catch {
    // ignore
  }
  return prefs;
};

const applyLocalPrefs = (prefs: Record<string, string> | undefined) => {
  if (!prefs) return;
  try {
    Object.entries(prefs).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
  } catch {
    // ignore
  }
};

const buildBackupFileName = () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `omnitab-backup-${stamp}.json`;
};

const downloadText = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noreferrer';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function useSettingsBackup() {
  const backupWorking = ref(false);
  const backupExportMessage = ref('');
  const backupImportMessage = ref('');

  const backupDialogOpen = ref(false);
  const pendingBackupImport = shallowRef<BackupPayload | null>(null);

  const backupFileInputRef = ref<HTMLInputElement | null>(null);

  const normalizeSnapshotKeys = (area: 'local' | 'sync', snapshot: Record<string, unknown>) => {
    const normalized: Record<string, unknown> = { ...snapshot };

    const isRecord = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === 'object' && !Array.isArray(value);

    const getPageCount = (value: unknown) => {
      if (!isRecord(value)) return 0;
      const pages = value.pages as unknown;
      if (Array.isArray(pages)) return pages.length;
      return 0;
    };

    const getWidgetPageCount = (value: unknown) => {
      if (!isRecord(value)) return 0;
      const pages = value.pages as unknown;
      if (!isRecord(pages)) return 0;
      return Object.keys(pages).length;
    };

    const isBetterValue = (key: string, candidate: unknown, current: unknown) => {
      if (current == null && candidate != null) return true;
      if (key === 'page-state') return getPageCount(candidate) > getPageCount(current);
      if (key === 'page-widgets') return getWidgetPageCount(candidate) > getWidgetPageCount(current);
      return false;
    };

    Object.entries(snapshot).forEach(([key, value]) => {
      const match = key.match(/^([a-z]+):(.+)$/);
      if (!match) return;
      const prefix = match[1];
      const driverKey = match[2];
      if (prefix !== area || !driverKey) return;

      const current = normalized[driverKey];
      if (!(driverKey in normalized) || isBetterValue(driverKey, value, current)) {
        normalized[driverKey] = value;
      }

      // 清理重复键，避免后续再次导出/导入时产生混淆
      delete normalized[key];
    });

    return normalized;
  };

  const exportBackup = async () => {
    backupExportMessage.value = '';
    if (!browser.storage?.local?.get) {
      backupExportMessage.value = '当前浏览器暂不支持在这里导出备份。';
      return;
    }
    backupWorking.value = true;
    try {
      const storageLocalRaw = (await browser.storage.local.get(null)) as Record<string, unknown>;
      const storageLocal = { ...storageLocalRaw };
      delete storageLocal['iconify-svg'];
      const storageSync = browser.storage?.sync?.get
        ? ((await browser.storage.sync.get(null)) as Record<string, unknown>)
        : undefined;
      const payload: BackupPayload = {
        version: 1,
        createdAt: Date.now(),
        storageLocal,
        storageSync,
        localPrefs: readLocalPrefs(),
      };
      downloadText(buildBackupFileName(), JSON.stringify(payload, null, 2));
      backupExportMessage.value = '已导出备份文件。';
    } catch (error) {
      logger.warn('export failed', error);
      backupExportMessage.value = '导出失败，请稍后再试。';
    } finally {
      backupWorking.value = false;
    }
  };

  const chooseBackupFile = () => {
    backupImportMessage.value = '';
    backupFileInputRef.value?.click?.();
  };

  const handleBackupFileChange = async (event: Event) => {
    backupImportMessage.value = '';
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (input) input.value = '';
    if (!file) return;

    backupWorking.value = true;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BackupPayload> | null;
      const storageLocal = parsed?.storageLocal;
      if (!parsed || parsed.version !== 1 || !storageLocal || typeof storageLocal !== 'object') {
        backupImportMessage.value = '这个文件好像不是备份文件。';
        return;
      }
      pendingBackupImport.value = {
        version: 1,
        createdAt: Number(parsed.createdAt) || Date.now(),
        storageLocal: storageLocal as Record<string, unknown>,
        storageSync:
          parsed.storageSync && typeof parsed.storageSync === 'object'
            ? (parsed.storageSync as Record<string, unknown>)
            : undefined,
        localPrefs:
          parsed.localPrefs && typeof parsed.localPrefs === 'object'
            ? (parsed.localPrefs as Record<string, string>)
            : undefined,
      };
      backupDialogOpen.value = true;
    } catch (error) {
      logger.warn('read file failed', error);
      backupImportMessage.value = '读取失败，请确认选择的是备份文件。';
    } finally {
      backupWorking.value = false;
    }
  };

  const confirmImportBackup = async () => {
    const payload = pendingBackupImport.value;
    if (!payload) return;
    if (!browser.storage?.local?.set || !browser.storage?.local?.get || !browser.storage?.local?.remove) {
      backupImportMessage.value = '当前浏览器暂不支持在这里导入备份。';
      backupDialogOpen.value = false;
      pendingBackupImport.value = null;
      return;
    }

    backupWorking.value = true;
    backupImportMessage.value = '';
    try {
      (globalThis as unknown as { __OMNITAB_RESTORE_LOCK__?: boolean }).__OMNITAB_RESTORE_LOCK__ = true;
      logger.info('import backup: start', { createdAt: payload.createdAt, version: payload.version });
      const toPlainJson = <T>(value: T): T => {
        try {
          return JSON.parse(JSON.stringify(value)) as T;
        } catch {
          return value;
        }
      };

      const storageLocal = normalizeSnapshotKeys('local', toPlainJson(payload.storageLocal));

      try {
        const pageState = storageLocal['page-state'] as any;
        const pages = pageState?.pages;
        if (pageState && typeof pageState === 'object' && pages && !Array.isArray(pages) && typeof pages === 'object') {
          const converted = Object.values(pages as Record<string, unknown>);
          pageState.pages = converted;
          logger.warn('import backup: coerce page-state.pages to array', {
            from: 'object',
            to: 'array',
            count: converted.length,
          });
        }
      } catch (error) {
        logger.warn('import backup: normalize page-state failed', error);
      }

      const beforeLocal = (await browser.storage.local.get(null)) as Record<string, unknown>;
      logger.info('import backup: local before', { keys: Object.keys(beforeLocal) });
      await browser.storage.local.set(storageLocal);
      logger.info('import backup: local set', { keys: Object.keys(storageLocal) });
      const removeLocalKeys = Object.keys(beforeLocal).filter((key) => !(key in storageLocal) && key !== 'iconify-svg');
      if (removeLocalKeys.length) {
        logger.info('import backup: local remove', { count: removeLocalKeys.length });
        await browser.storage.local.remove(removeLocalKeys);
      }

      if (
        payload.storageSync &&
        browser.storage?.sync?.set &&
        browser.storage?.sync?.get &&
        browser.storage?.sync?.remove
      ) {
        const storageSync = normalizeSnapshotKeys('sync', toPlainJson(payload.storageSync));
        const beforeSync = (await browser.storage.sync.get(null)) as Record<string, unknown>;
        logger.info('import backup: sync before', { keys: Object.keys(beforeSync) });
        await browser.storage.sync.set(storageSync);
        logger.info('import backup: sync set', { keys: Object.keys(storageSync) });
        const removeSyncKeys = Object.keys(beforeSync).filter((key) => !(key in storageSync));
        if (removeSyncKeys.length) {
          logger.info('import backup: sync remove', { count: removeSyncKeys.length });
          await browser.storage.sync.remove(removeSyncKeys);
        }
      }

      applyLocalPrefs(payload.localPrefs);

      try {
        const after = (await browser.storage.local.get(['page-state'])) as Record<string, unknown>;
        const pageState = after['page-state'] as any;
        const pages = pageState?.pages;
        if (pageState && pages && !Array.isArray(pages) && typeof pages === 'object') {
          const converted = Object.values(pages as Record<string, unknown>);
          await browser.storage.local.set({
            'page-state': {
              ...pageState,
              pages: converted,
            },
          });
          logger.warn('import backup: fix page-state.pages after set', {
            from: 'object',
            to: 'array',
            count: converted.length,
          });
        }
      } catch (error) {
        logger.warn('import backup: post-fix page-state failed', error);
      }

      try {
        const after = (await browser.storage.local.get(['page-state'])) as Record<string, unknown>;
        const pageState = after['page-state'] as unknown;
        const pages = (pageState as any)?.pages;
        const count = Array.isArray(pages) ? pages.length : 0;
        logger.info('import backup: page-state after', {
          count,
          activePageId: (pageState as any)?.activePageId,
          pagesType: Array.isArray(pages) ? 'array' : typeof pages,
        });
        if (count <= 0) {
          logger.warn('import backup: page state missing/empty after restore', { pageState });
          backupImportMessage.value = '备份已导入，但页面内容没有恢复出来。请确认选择的是正确的备份文件。';
          return;
        }
      } catch (error) {
        logger.warn('import backup: verify failed', error);
      }

      try {
        const pageStore = usePageStore();
        const widgetStore = useWidgetStore();
        await pageStore.reload();
        await widgetStore.init();
        logger.info('import backup: reload stores done', {
          pages: pageStore.pages.value.length,
          activePageId: pageStore.activePageId.value,
        });
      } catch (error) {
        logger.warn('import backup: reload stores failed', error);
      }

      backupImportMessage.value = '已导入备份。';
      window.setTimeout(async () => {
        try {
          const after = (await browser.storage.local.get(['page-state'])) as Record<string, unknown>;
          const pageState = after['page-state'] as any;
          const pages = pageState?.pages;
          const count = Array.isArray(pages) ? pages.length : 0;
          logger.info('import backup: page-state after delay', { count, activePageId: pageState?.activePageId });
        } catch (error) {
          logger.warn('import backup: delayed verify failed', error);
        }
      }, 600);
    } catch (error) {
      logger.warn('import failed', error);
      backupImportMessage.value = '导入失败，请稍后再试。';
    } finally {
      (globalThis as unknown as { __OMNITAB_RESTORE_LOCK__?: boolean }).__OMNITAB_RESTORE_LOCK__ = false;
      backupWorking.value = false;
      backupDialogOpen.value = false;
      pendingBackupImport.value = null;
    }
  };

  return {
    backupWorking,
    backupExportMessage,
    backupImportMessage,
    backupDialogOpen,
    pendingBackupImport,
    backupFileInputRef,
    exportBackup,
    chooseBackupFile,
    handleBackupFileChange,
    confirmImportBackup,
  };
}
