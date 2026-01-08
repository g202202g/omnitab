import { storage } from 'wxt/utils/storage';

export type PendingWebCardPick = {
  url: string;
  selector: string;
  title?: string;
  createdAt: number;
};

type PendingState = {
  pending?: PendingWebCardPick;
  nonce?: string;
};

const pendingItem = storage.defineItem<PendingState>('session:pending-dom-pick', {
  fallback: {},
});

export async function setPendingWebCardPick(payload: PendingWebCardPick) {
  const nonce = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await pendingItem.setValue({ pending: payload, nonce });
  return nonce;
}

export async function consumePendingWebCardPick(options?: { maxAgeMs?: number }) {
  const maxAgeMs = Math.max(5_000, Math.min(options?.maxAgeMs ?? 60_000, 10 * 60_000));
  const state = await pendingItem.getValue();
  const pending = state?.pending;
  const nonce = typeof state?.nonce === 'string' ? state.nonce : '';
  await pendingItem.setValue({});
  if (!pending) return null;
  if (!pending.url || !pending.selector) return null;
  const age = Date.now() - Number(pending.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
  return { ...pending, nonce };
}
