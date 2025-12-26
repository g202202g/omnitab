import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import { useLog } from './useLog';

type GrantedPermissions = { permissions: string[]; origins: string[] };

const logger = useLog('settings-permissions');

const normalizeList = (values: unknown) => {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value)).filter(Boolean);
};

const permissionReasonMap: Record<string, { title: string; description: string }> = {
  storage: { title: '保存设置', description: '用于记住你的页面、布局、背景和偏好。' },
  declarativeNetRequestWithHostAccess: {
    title: '网页卡片可用性',
    description: '让更多网站能在网页卡片里正常打开。',
  },
  favicon: { title: '网站图标', description: '用于显示网站的小图标，方便识别。' },
  history: { title: '浏览记录', description: '用于在卡片里显示最近访问过的网页。' },
  bookmarks: { title: '书签', description: '用于在卡片里显示你的书签列表。' },
  'system.cpu': { title: '处理器信息', description: '用于显示更详细的处理器信息。' },
  'system.memory': { title: '内存信息', description: '用于显示更详细的内存信息。' },
  topSites: { title: '常访问站点', description: '用于显示常访问的网站列表。' },
  downloads: { title: '下载列表', description: '用于显示下载进度并进行简单操作。' },
  sessions: { title: '最近关闭', description: '用于显示最近关闭的标签页，方便一键恢复。' },
};

const permissionFeatureOrder = [
  '保存设置',
  '网页卡片可用性',
  '网站图标',
  '浏览记录',
  '常访问站点',
  '书签',
  '下载列表',
  '最近关闭',
  '处理器信息',
  '内存信息',
  '功能支持',
];

const getPermissionReason = (permission: string) =>
  permissionReasonMap[permission] ?? { title: '功能支持', description: '用于支持相关功能。' };

const getOriginReason = (origin: string) => {
  const value = origin.trim();
  if (!value) return { title: '网站范围', description: '用于打开对应网站。' };
  return {
    title: '网站范围',
    description: '用于让网页卡片打开这个网站。',
  };
};

export function useSettingsPermissions() {
  const loading = ref(false);
  const errorMessage = ref('');
  const granted = ref<GrantedPermissions>({ permissions: [], origins: [] });

  const manifestOptional = computed(() => {
    const manifest: any = browser.runtime.getManifest?.() ?? {};
    const permissions = normalizeList(manifest.optional_permissions);
    const origins = normalizeList(manifest.optional_host_permissions);
    return { permissions, origins };
  });

  const manifestRequired = computed(() => {
    const manifest: any = browser.runtime.getManifest?.() ?? {};
    const permissions = normalizeList(manifest.permissions);
    const origins = normalizeList(manifest.host_permissions);
    return { permissions, origins };
  });

  const grantedSorted = computed(() => ({
    permissions: [...new Set(granted.value.permissions)].sort(),
    origins: [...new Set(granted.value.origins)].sort(),
  }));

  const grantedItems = computed(() => {
    const requiredPermissions = new Set(manifestRequired.value.permissions);
    const optionalPermissions = new Set(manifestOptional.value.permissions);
    const requiredOrigins = new Set(manifestRequired.value.origins);
    const optionalOrigins = new Set(manifestOptional.value.origins);

    const sortGranted = <T extends { value: string; required: boolean; optional: boolean; reason: { title: string } }>(
      a: T,
      b: T,
    ) => {
      const rank = (item: T) => (item.optional ? 0 : item.required ? 1 : 2);
      const diff = rank(a) - rank(b);
      if (diff) return diff;
      const getFeatureIndex = (item: T) => {
        const idx = permissionFeatureOrder.indexOf(item.reason.title);
        return idx === -1 ? permissionFeatureOrder.length : idx;
      };
      const featureDiff = getFeatureIndex(a) - getFeatureIndex(b);
      if (featureDiff) return featureDiff;
      return a.value.localeCompare(b.value, 'en', { numeric: true });
    };

    const permissions = grantedSorted.value.permissions
      .map((value) => {
        const required = requiredPermissions.has(value);
        const optional = optionalPermissions.has(value);
        return {
          kind: 'permission' as const,
          value,
          required,
          optional,
          reason: getPermissionReason(value),
        };
      })
      .sort(sortGranted);

    const origins = grantedSorted.value.origins
      .map((value) => {
        const required = requiredOrigins.has(value);
        const optional = optionalOrigins.has(value);
        return {
          kind: 'origin' as const,
          value,
          required,
          optional,
          reason: getOriginReason(value),
        };
      })
      .sort(sortGranted);

    return { permissions, origins };
  });

  const toRequest = computed(() => {
    const havePermissions = new Set(granted.value.permissions);
    const haveOrigins = new Set(granted.value.origins);
    return {
      permissions: manifestOptional.value.permissions.filter((p) => !havePermissions.has(p)),
      origins: manifestOptional.value.origins.filter((o) => !haveOrigins.has(o)),
    };
  });

  const refresh = async () => {
    errorMessage.value = '';
    loading.value = true;
    try {
      if (!browser.permissions?.getAll) {
        logger.warn('permissions.getAll not available');
        errorMessage.value = '当前浏览器暂不支持在这里管理访问授权。';
        return;
      }
      const res = await browser.permissions.getAll();
      granted.value = {
        permissions: normalizeList(res?.permissions),
        origins: normalizeList(res?.origins),
      };
    } catch (error) {
      logger.warn('refresh failed', error);
      errorMessage.value = '读取失败，请稍后再试。';
    } finally {
      loading.value = false;
    }
  };

  const requestAllOptional = async () => {
    errorMessage.value = '';
    if (!browser.permissions?.request) {
      errorMessage.value = '当前浏览器暂不支持在这里开启访问授权。';
      return;
    }
    const payload: any = {};
    if (toRequest.value.permissions.length) payload.permissions = toRequest.value.permissions;
    if (toRequest.value.origins.length) payload.origins = toRequest.value.origins;
    if (!payload.permissions && !payload.origins) return;

    loading.value = true;
    try {
      await browser.permissions.request(payload);
      await refresh();
    } catch (error) {
      logger.warn('request failed', error);
      errorMessage.value = '未完成，请稍后再试。';
    } finally {
      loading.value = false;
    }
  };

  const requestSingle = async (item: { kind: 'permission' | 'origin'; value: string }) => {
    errorMessage.value = '';
    if (!browser.permissions?.request) {
      errorMessage.value = '当前浏览器暂不支持在这里开启访问授权。';
      return;
    }
    loading.value = true;
    try {
      const payload = item.kind === 'permission' ? { permissions: [item.value] } : { origins: [item.value] };
      await browser.permissions.request(payload as any);
      await refresh();
    } catch (error) {
      logger.warn('request single failed', error);
      errorMessage.value = '未完成，请稍后再试。';
    } finally {
      loading.value = false;
    }
  };

  const revokeDialogOpen = ref(false);
  const pendingRevoke = ref<{ kind: 'permission' | 'origin'; value: string; required: boolean } | null>(null);

  const openRevoke = (item: { kind: 'permission' | 'origin'; value: string; required: boolean }) => {
    if (item.required) return;
    pendingRevoke.value = item;
    revokeDialogOpen.value = true;
  };

  const confirmRevoke = async () => {
    const item = pendingRevoke.value;
    if (!item) return;
    if (item.required) return;
    if (!browser.permissions?.remove) {
      errorMessage.value = '当前浏览器暂不支持在这里关闭访问授权。';
      revokeDialogOpen.value = false;
      pendingRevoke.value = null;
      return;
    }
    loading.value = true;
    errorMessage.value = '';
    try {
      const payload = item.kind === 'permission' ? { permissions: [item.value] } : { origins: [item.value] };
      await browser.permissions.remove(payload as any);
      await refresh();
    } catch (error) {
      logger.warn('revoke failed', error);
      errorMessage.value = '未完成，请稍后再试。';
    } finally {
      loading.value = false;
      revokeDialogOpen.value = false;
      pendingRevoke.value = null;
    }
  };

  return {
    loading,
    errorMessage,
    grantedSorted,
    grantedItems,
    toRequest,
    getPermissionReason,
    getOriginReason,
    refresh,
    requestAllOptional,
    requestSingle,
    revokeDialogOpen,
    pendingRevoke,
    openRevoke,
    confirmRevoke,
  };
}
