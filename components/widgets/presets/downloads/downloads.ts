import { browser } from 'wxt/browser';

export type DownloadStateFilter = 'all' | 'in_progress' | 'complete' | 'interrupted';

export type DownloadItem = {
  id: number;
  filename: string;
  url?: string;
  state?: string;
  paused?: boolean;
  totalBytes?: number;
  bytesReceived?: number;
  danger?: string;
  startTime?: string;
  endTime?: string;
  exists?: boolean;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const searchDownloads = async (params: {
  limit: number;
  state: DownloadStateFilter;
}): Promise<DownloadItem[] | null> => {
  const api: any = (browser as any)?.downloads ?? (globalThis as any)?.browser?.downloads;
  if (!api?.search) return null;

  const limitRaw = Number(params.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 50;

  const query: any = {
    limit,
    orderBy: ['-startTime'],
  };
  if (params.state && params.state !== 'all') query.state = params.state;

  const result = await api.search(query);
  const items = Array.isArray(result) ? result : [];
  return items
    .map((item: any) => {
      const id = Number(item?.id);
      if (!Number.isFinite(id)) return null;
      const filename = normalizeText(item?.filename) || `下载 #${id}`;
      const url = normalizeText(item?.finalUrl) || normalizeText(item?.url) || undefined;
      const totalBytes = typeof item?.totalBytes === 'number' ? item.totalBytes : undefined;
      const bytesReceived = typeof item?.bytesReceived === 'number' ? item.bytesReceived : undefined;
      return {
        id,
        filename,
        url,
        state: normalizeText(item?.state) || undefined,
        paused: typeof item?.paused === 'boolean' ? item.paused : undefined,
        totalBytes,
        bytesReceived,
        danger: normalizeText(item?.danger) || undefined,
        startTime: normalizeText(item?.startTime) || undefined,
        endTime: normalizeText(item?.endTime) || undefined,
        exists: typeof item?.exists === 'boolean' ? item.exists : undefined,
      } satisfies DownloadItem;
    })
    .filter(Boolean) as DownloadItem[];
};

export const pauseDownload = async (downloadId: number) => {
  const api: any = (browser as any)?.downloads ?? (globalThis as any)?.browser?.downloads;
  if (!api?.pause) return false;
  await api.pause(downloadId);
  return true;
};

export const resumeDownload = async (downloadId: number) => {
  const api: any = (browser as any)?.downloads ?? (globalThis as any)?.browser?.downloads;
  if (!api?.resume) return false;
  await api.resume(downloadId);
  return true;
};

export const cancelDownload = async (downloadId: number) => {
  const api: any = (browser as any)?.downloads ?? (globalThis as any)?.browser?.downloads;
  if (!api?.cancel) return false;
  await api.cancel(downloadId);
  return true;
};

export const openDownload = async (downloadId: number) => {
  const api: any = (browser as any)?.downloads ?? (globalThis as any)?.browser?.downloads;
  if (!api?.open) return false;
  await api.open(downloadId);
  return true;
};

export const showDownloadInFolder = async (downloadId: number) => {
  const api: any = (browser as any)?.downloads ?? (globalThis as any)?.browser?.downloads;
  if (!api?.show) return false;
  await api.show(downloadId);
  return true;
};
