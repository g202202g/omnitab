import { browser } from 'wxt/browser';

type DomPickerStartMessage = {
  type: 'dom-picker:start';
};

type DomPickerResultMessage = {
  type: 'dom-picker:selected';
  url: string;
  title: string;
  selector: string;
};

type DomPickerResponse =
  | { ok: true }
  | { ok: false; error?: string }
  | undefined;

type PickerState = {
  active: boolean;
  currentTarget: HTMLElement | null;
  shiftKey: boolean;
  lastPointerX: number | null;
  lastPointerY: number | null;
  stickySelection: boolean;
  highlighterEl: HTMLDivElement | null;
  labelEl: HTMLDivElement | null;
  panelEl: HTMLDivElement | null;
  toastEl: HTMLDivElement | null;
  cleanup: (() => void) | null;
};

const state: PickerState = {
  active: false,
  currentTarget: null,
  shiftKey: false,
  lastPointerX: null,
  lastPointerY: null,
  stickySelection: false,
  highlighterEl: null,
  labelEl: null,
  panelEl: null,
  toastEl: null,
  cleanup: null,
};

const DEBUG = (import.meta as any).env?.DEV === true || (globalThis as any).__OMNITAB_DOM_PICKER_DEBUG__ === true;
const debug = (...args: unknown[]) => {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log('[dom-picker]', ...args);
};

const INSTALL_KEY = '__OMNITAB_DOM_PICKER_INSTALLED__';
const isInstalled = () => Boolean((globalThis as any)[INSTALL_KEY]);
const markInstalled = () => {
  (globalThis as any)[INSTALL_KEY] = true;
};

const SELECTOR_MAX_DEPTH = 10;

const isRestrictedDocument = () => {
  try {
    // 某些页面（如 about:、chrome:）content script 不会注入，这里只是兜底。
    const href = String(location.href ?? '');
    return href.startsWith('chrome://') || href.startsWith('chrome-extension://') || href.startsWith('about:');
  } catch {
    return true;
  }
};

const safeEscape = (value: string) => {
  try {
    return (globalThis as any).CSS?.escape?.(value) ?? value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  } catch {
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
};

const isUniqueId = (id: string) => {
  if (!id.trim()) return false;
  try {
    const selector = `#${safeEscape(id)}`;
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

const buildNthOfType = (el: Element) => {
  const parent = el.parentElement;
  if (!parent) return null;
  const tag = el.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter((child) => (child as Element).tagName.toLowerCase() === tag);
  if (siblings.length <= 1) return null;
  const index = siblings.indexOf(el);
  if (index < 0) return null;
  return `:nth-of-type(${index + 1})`;
};

const buildStableSelector = (raw: HTMLElement) => {
  // Shadow DOM 内的节点，document.querySelector 无法直达，退化为 host。
  const rootNode = raw.getRootNode?.();
  const el = rootNode && (rootNode as any).host instanceof HTMLElement ? ((rootNode as any).host as HTMLElement) : raw;

  const id = el.getAttribute('id') ?? '';
  if (id && isUniqueId(id)) return `#${safeEscape(id)}`;

  const attrKeys = ['data-testid', 'data-test', 'data-qa', 'data-cy'];
  for (const key of attrKeys) {
    const attr = el.getAttribute(key);
    if (attr && attr.trim()) {
      const escaped = attr.replace(/"/g, '\\"');
      const selector = `[${key}="${escaped}"]`;
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {
        // ignore
      }
    }
  }

  const segments: string[] = [];
  let cursor: Element | null = el;
  let depth = 0;
  while (cursor && cursor instanceof Element && depth < SELECTOR_MAX_DEPTH) {
    const tag = cursor.tagName.toLowerCase();
    if (tag === 'html') break;

    const cursorId = (cursor as HTMLElement).getAttribute?.('id') ?? '';
    if (cursorId && isUniqueId(cursorId)) {
      segments.unshift(`#${safeEscape(cursorId)}`);
      break;
    }

    const nth = buildNthOfType(cursor);
    segments.unshift(`${tag}${nth ?? ''}`);

    if (cursor.parentElement?.tagName?.toLowerCase() === 'body') {
      break;
    }

    cursor = cursor.parentElement;
    depth += 1;
  }

  return segments.join(' > ');
};

const clampSelectorLength = (selector: string, fallbackTag: string) => {
  const trimmed = selector.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8000) return trimmed;
  const segments = trimmed.split(' > ').map((s) => s.trim()).filter(Boolean);
  for (let take = Math.min(segments.length, 6); take >= 1; take -= 1) {
    const candidate = segments.slice(-take).join(' > ');
    if (candidate.length <= 8000) return candidate;
  }
  const tag = fallbackTag.trim();
  return tag ? tag : '';
};

const formatTargetLabel = (el: HTMLElement) => {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `${tag}${id}${className}`;
};

const showToast = (message: string, options?: { durationMs?: number }) => {
  const durationMs = Math.max(800, Math.min(options?.durationMs ?? 2200, 8000));
  if (state.toastEl) {
    state.toastEl.remove();
    state.toastEl = null;
  }
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = [
    'position: fixed',
    'right: 16px',
    'bottom: 16px',
    'z-index: 2147483647',
    'max-width: 360px',
    'padding: 10px 12px',
    'border-radius: 10px',
    'font-size: 13px',
    'line-height: 1.25',
    'color: #fff',
    'background: rgba(15, 23, 42, 0.92)',
    'box-shadow: 0 10px 25px rgba(0,0,0,.28)',
    'backdrop-filter: blur(8px)',
  ].join(';');
  document.documentElement.appendChild(el);
  state.toastEl = el;
  window.setTimeout(() => {
    el.remove();
    if (state.toastEl === el) state.toastEl = null;
  }, durationMs);
};

const cleanupPicker = () => {
  debug('cleanupPicker');
  state.active = false;
  state.currentTarget = null;
  state.stickySelection = false;
  state.cleanup?.();
  state.cleanup = null;
  state.highlighterEl?.remove();
  state.highlighterEl = null;
  state.labelEl?.remove();
  state.labelEl = null;
  state.panelEl?.remove();
  state.panelEl = null;
};

const startPicker = () => {
  if (state.active) {
    debug('startPicker ignored (already active)');
    return;
  }
  if (isRestrictedDocument()) {
    showToast('当前页面不支持选取 DOM（受浏览器限制）。');
    return;
  }

  debug('startPicker');

  state.active = true;

  const bodyOverflow = document.body?.style.overflow ?? '';
  const htmlOverflow = document.documentElement?.style.overflow ?? '';
  try {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  } catch {
    // ignore
  }

  const highlighter = document.createElement('div');
  highlighter.style.cssText = [
    'position: fixed',
    'z-index: 2147483647',
    'pointer-events: none',
    'border: 2px solid rgba(59, 130, 246, 0.95)',
    'background: rgba(59, 130, 246, 0.10)',
    'border-radius: 10px',
    'box-shadow: 0 8px 24px rgba(59, 130, 246, 0.25)',
  ].join(';');
  document.documentElement.appendChild(highlighter);
  state.highlighterEl = highlighter;

  const label = document.createElement('div');
  label.style.cssText = [
    'position: fixed',
    'z-index: 2147483647',
    'pointer-events: none',
    'padding: 6px 8px',
    'border-radius: 10px',
    'font-size: 12px',
    'line-height: 1.2',
    'color: #fff',
    'background: rgba(15, 23, 42, 0.92)',
    'backdrop-filter: blur(8px)',
    'box-shadow: 0 10px 25px rgba(0,0,0,.25)',
    'max-width: 360px',
    'white-space: nowrap',
    'overflow: hidden',
    'text-overflow: ellipsis',
  ].join(';');
  document.documentElement.appendChild(label);
  state.labelEl = label;

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position: fixed',
    'left: 50%',
    'top: 14px',
    'transform: translateX(-50%)',
    'z-index: 2147483647',
    'display: flex',
    'gap: 10px',
    'align-items: center',
    'padding: 10px 12px',
    'border-radius: 14px',
    'color: #0f172a',
    'background: rgba(255,255,255,0.96)',
    'box-shadow: 0 12px 30px rgba(0,0,0,.18)',
    'backdrop-filter: blur(10px)',
    'font-size: 13px',
  ].join(';');
  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2px;min-width:240px;">
      <div style="font-weight: 600;">万象标签（OmniTab）- 选取网页内容</div>
      <div style="opacity: .72;">悬停高亮，单击选中；按 <b>Esc</b> 取消；按 <b>Shift</b> 可逐级选父元素（按一次上移一层）</div>
    </div>
    <button data-codex-picker-cancel type="button" style="cursor:pointer;border:0;border-radius:12px;padding:8px 10px;background:#0f172a;color:#fff;">取消</button>
  `;
  document.documentElement.appendChild(panel);
  state.panelEl = panel;

  const cancelBtn = panel.querySelector('[data-codex-picker-cancel]') as HTMLButtonElement | null;
  cancelBtn?.addEventListener('click', () => {
    cleanupPicker();
    showToast('已取消选取。');
  });

  const updateOverlay = (target: HTMLElement | null) => {
    if (!state.highlighterEl || !state.labelEl) return;
    if (!target) {
      state.highlighterEl.style.display = 'none';
      state.labelEl.style.display = 'none';
      return;
    }
    const rect = target.getBoundingClientRect();
    state.highlighterEl.style.display = 'block';
    state.highlighterEl.style.left = `${Math.max(0, rect.left)}px`;
    state.highlighterEl.style.top = `${Math.max(0, rect.top)}px`;
    state.highlighterEl.style.width = `${Math.max(0, rect.width)}px`;
    state.highlighterEl.style.height = `${Math.max(0, rect.height)}px`;

    state.labelEl.style.display = 'block';
    const labelText = formatTargetLabel(target);
    state.labelEl.textContent = labelText;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 8);
    const top = Math.max(8, rect.top - 34);
    state.labelEl.style.left = `${left}px`;
    state.labelEl.style.top = `${top}px`;
  };

  const stepUpSelection = (base: HTMLElement) => {
    const parent = base.parentElement;
    if (!parent) return base;
    const next = parent;
    state.stickySelection = true;
    return next;
  };

  const pickElementFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    if (!(el instanceof HTMLElement)) return null;
    if (state.panelEl && state.panelEl.contains(el)) return null;
    return el;
  };

  const resolveHoverTarget = (el: HTMLElement) => {
    state.stickySelection = false;
    return el;
  };

  const handleMove = (event: MouseEvent) => {
    if (!state.active) return;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    const shiftPressed = Boolean((event as any).shiftKey);
    // 允许“进入选取模式前已按住 Shift”：在鼠标事件里同步 shiftKey 状态。
    if (shiftPressed && !state.shiftKey) {
      state.shiftKey = true;
      const next = pickElementFromPoint(event.clientX, event.clientY);
      if (next) {
        state.currentTarget = stepUpSelection(next);
        updateOverlay(state.currentTarget);
      }
      return;
    }
    if (!shiftPressed && state.shiftKey) {
      state.shiftKey = false;
    }
    const next = pickElementFromPoint(event.clientX, event.clientY);
    if (!next) {
      state.currentTarget = null;
      updateOverlay(null);
      return;
    }
    // 如果用户刚用 Shift 上移选中了父元素，则在鼠标仍位于该父元素内部时保持高亮不变，避免回跳造成歧义。
    if (state.stickySelection && state.currentTarget && state.currentTarget.contains(next)) {
      updateOverlay(state.currentTarget);
      return;
    }
    state.currentTarget = resolveHoverTarget(next);
    updateOverlay(state.currentTarget);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!state.active) return;
    debug('keydown', event.key);
    if (event.key === 'Shift') {
      if (state.shiftKey) return;
      state.shiftKey = true;

      const base = state.currentTarget;
      if (base) {
        state.currentTarget = stepUpSelection(base);
        updateOverlay(state.currentTarget);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cleanupPicker();
      showToast('已取消选取。');
    }
  };

  const handleKeyup = (event: KeyboardEvent) => {
    if (!state.active) return;
    debug('keyup', event.key);
    if (event.key === 'Shift') {
      state.shiftKey = false;
    }
  };

  const handlePointerDown = async (event: PointerEvent) => {
    if (!state.active) return;

    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
    state.shiftKey = Boolean(event.shiftKey);

    debug('pointerdown', {
      button: (event as any).button,
      pointerType: (event as any).pointerType,
      shiftKey: event.shiftKey,
      target: (event.target as any)?.tagName,
    });

    // 只处理主键（左键/触控）。
    if (typeof event.button === 'number' && event.button !== 0) return;

    // 允许点击顶部面板（如取消按钮）正常工作。
    if (state.panelEl && event.target instanceof Node && state.panelEl.contains(event.target)) return;

    const picked = pickElementFromPoint(event.clientX, event.clientY);
    if (!picked) return;

	    debug('picked', formatTargetLabel(picked));

    event.preventDefault();
    event.stopPropagation();
    (event as any).stopImmediatePropagation?.();

    // 点击时永远以“当前高亮目标”为准（所见即所得）；若未初始化则取 picked。
    const target = state.currentTarget ?? picked;

	    debug('resolved target', formatTargetLabel(target));

    // 用户已经完成一次“选中”动作：立即退出选取模式（恢复滚动/移除遮罩），避免观感上还停留在选取态。
    cleanupPicker();

    let selector = '';
    try {
      selector = buildStableSelector(target);
    } catch (error) {
      console.warn('[dom-picker] build selector failed', error);
      selector = '';
    }

    debug('selector', selector);

    selector = clampSelectorLength(selector, target.tagName.toLowerCase());
    if (selector && selector.length > 8000) {
      selector = '';
    }

    const url = String(location.href ?? '');
    const title = String(document.title ?? '');
    if (!url || !selector) {
      showToast('选取失败：元素路径过深或无法生成选择器（可按住 Shift 选择父级容器）。');
      return;
    }

    debug('sendMessage dom-picker:selected', { url, title, selector });

    try {
      const response = (await browser.runtime.sendMessage({
        type: 'dom-picker:selected',
        url,
        title,
        selector,
      } satisfies DomPickerResultMessage)) as DomPickerResponse;

      debug('background response', response);
      if (!response?.ok) {
        showToast(`添加失败：${response?.error || '未知错误'}`);
        return;
      }
      showToast('已打开新标签页：请确认添加网页卡片。', { durationMs: 2600 });
    } catch (error) {
      console.warn('[dom-picker] send result failed', error);
      debug('sendMessage failed', error);
      showToast('添加失败：无法与扩展后台通信。');
    }
  };

  // 使用 window capture：尽量早于页面的 document 监听执行，同时不遮挡页面。
  window.addEventListener('pointermove', handleMove as any, true);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('keydown', handleKeydown as any, true);
  window.addEventListener('keyup', handleKeyup as any, true);

  state.cleanup = () => {
    window.removeEventListener('pointermove', handleMove as any, true);
    window.removeEventListener('pointerdown', handlePointerDown, true);
    window.removeEventListener('keydown', handleKeydown as any, true);
    window.removeEventListener('keyup', handleKeyup as any, true);

    state.shiftKey = false;
    state.stickySelection = false;

    try {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    } catch {
      // ignore
    }
  };

  showToast('开始选取：悬停高亮，单击选中（Esc 取消）。', { durationMs: 1600 });
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    const runtime = (browser as any)?.runtime;
    if (isInstalled()) {
      debug('content script already installed (skip)', { href: String(location.href ?? '') });
      return;
    }
    markInstalled();
    debug('content script installed', { href: String(location.href ?? '') });
    runtime?.onMessage?.addListener((message: DomPickerStartMessage) => {
      if (message?.type === 'dom-picker:start') {
        debug('received dom-picker:start');
        startPicker();
      }
    });
  },
});
