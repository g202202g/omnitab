import { browser } from 'wxt/browser';

/**
 * 可选权限申请/检查封装，使用 WXT 提供的 browser API。
 * 用法：
 * const perm = useOptionalPermission();
 * // 申请可选 host 权限
 * if (!(await perm.contains(['https://foo/*']))) await perm.request(['https://foo/*']);
 * // 申请可选 API 权限（需在 manifest.optional_permissions 声明）
 * if (!(await perm.contains({ permissions: ['history'] }))) await perm.request({ permissions: ['history'] });
 */
export function useOptionalPermission() {
  type OptionalPermissionPayload = { origins?: string[]; permissions?: string[] };

  const normalizePayload = (payload: OptionalPermissionPayload | string[]): OptionalPermissionPayload =>
    Array.isArray(payload) ? { origins: payload } : (payload ?? {});

  const buildRequestPayload = (payload: OptionalPermissionPayload | string[]) => {
    const normalized = normalizePayload(payload);
    const requestPayload: OptionalPermissionPayload = {};
    if (Array.isArray(normalized.origins) && normalized.origins.length) requestPayload.origins = normalized.origins;
    if (Array.isArray(normalized.permissions) && normalized.permissions.length)
      requestPayload.permissions = normalized.permissions;
    return requestPayload;
  };

  const permApi: any = (browser as any)?.permissions;
  const isSupported = !!permApi;

  const contains = async (payload: OptionalPermissionPayload | string[]) => {
    if (!isSupported) return false;
    try {
      return !!(await permApi.contains(buildRequestPayload(payload)));
    } catch (err) {
      console.warn('permission.contains failed', err);
      return false;
    }
  };

  const request = async (payload: OptionalPermissionPayload | string[]) => {
    if (!isSupported) return true; // 无 API 时默认放行，由调用方自行处理失败
    try {
      return !!(await permApi.request(buildRequestPayload(payload)));
    } catch (err) {
      console.warn('permission.request failed', err);
      return false;
    }
  };

  const remove = async (payload: OptionalPermissionPayload | string[]) => {
    if (!isSupported) return true;
    try {
      return !!(await permApi.remove(buildRequestPayload(payload)));
    } catch (err) {
      console.warn('permission.remove failed', err);
      return false;
    }
  };

  const getAll = async (): Promise<{ origins?: string[]; permissions?: string[] } | null> => {
    if (!isSupported) return null;
    try {
      const result = await permApi.getAll?.();
      if (!result || typeof result !== 'object') return null;
      const origins = Array.isArray((result as any).origins) ? (result as any).origins : undefined;
      const permissions = Array.isArray((result as any).permissions) ? (result as any).permissions : undefined;
      return { origins, permissions };
    } catch (err) {
      console.warn('permission.getAll failed', err);
      return null;
    }
  };

  return {
    isSupported,
    contains,
    request,
    remove,
    getAll,
  };
}
