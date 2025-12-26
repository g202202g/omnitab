import { nextTick } from 'vue';
import { driver, type Driver, type DriverHook } from 'driver.js';
import { useStoredValue } from '@/composables/useStoredValue';
import { useLog } from '@/composables/useLog';

type GuideStartOptions = {
  force?: boolean;
  from?: 'auto' | 'settings';
};

const GUIDE_SEEN_KEY = 'local:onboarding:seen' as const;

export function useOnboardingGuide() {
  const seen = useStoredValue<boolean>(GUIDE_SEEN_KEY, false);
  const logger = useLog('onboarding-guide');

  let instance: Driver | null = null;
  let unlockPageDialog = () => {};
  let unlockAddCardDialog = () => {};
  let unlockWidgetSettingsDialog = () => {};

  // 不要回退到 body：否则可能导致整页变成可点击区域，弹窗交互也会被“点穿透”影响。
  // driver.js 内部在找不到元素时会自动回退到 dummy element。
  const resolveElement = (selector: string) => () => document.querySelector(selector) as unknown as Element;

  const lockActions = (rootSelector: string, selectors: string[]) => {
    const root = document.querySelector(rootSelector);
    if (!root) return () => {};

    const locked: Array<{ el: HTMLElement; pointerEvents: string; tabIndexAttr: string | null }> = [];

    selectors.forEach((selector) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (locked.some((item) => item.el === el)) return;
        const next: { el: HTMLElement; pointerEvents: string; tabIndexAttr: string | null } = {
          el,
          pointerEvents: '',
          tabIndexAttr: null,
        };

        next.pointerEvents = el.style.pointerEvents;
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-disabled', 'true');

        next.tabIndexAttr = el.getAttribute('tabindex');
        el.setAttribute('tabindex', '-1');

        locked.push(next);
      });
    });

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      instance?.destroy();
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleKeydown, true);

    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
      locked.forEach((item) => {
        item.el.style.pointerEvents = item.pointerEvents;
        if (item.tabIndexAttr === null) item.el.removeAttribute('tabindex');
        else item.el.setAttribute('tabindex', item.tabIndexAttr);
        item.el.removeAttribute('aria-disabled');
      });
    };
  };

  const lockOutsideInteractions = (rootSelector: string) => {
    const root = document.querySelector(rootSelector);
    if (!root) return () => {};

    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.contains(target)) return;
      const popover = document.querySelector('.driver-popover');
      if (popover && popover.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('mousedown', handler, true);
    window.addEventListener('touchstart', handler, true);
    window.addEventListener('click', handler, true);

    return () => {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('mousedown', handler, true);
      window.removeEventListener('touchstart', handler, true);
      window.removeEventListener('click', handler, true);
    };
  };

  const clickIfFound = (selector: string, root: ParentNode = document) => {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.click();
    return true;
  };

  const waitForElement = async (selector: string, timeoutMs = 1400) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return true;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return false;
  };

  const ensureExitEditMode = () => {
    const toggle = document.querySelector<HTMLElement>('[data-tour="edit-toggle"]');
    if (!toggle) return false;
    if (toggle.getAttribute('aria-pressed') !== 'true') return false;
    toggle.click();
    return true;
  };

  const closeGuide: DriverHook = (_el, _step, opts) => {
    opts.driver.destroy();
  };

  const bindGuideCloseToDialogClose = (rootSelector: string, guide: Driver) => {
    const root = document.querySelector(rootSelector);
    if (!root) return () => {};
    const closeButton = root.querySelector<HTMLElement>('[data-slot="dialog-close"]');
    if (!closeButton) return () => {};

    const handler = () => {
      guide.destroy();
    };

    closeButton.addEventListener('click', handler, true);

    return () => {
      closeButton.removeEventListener('click', handler, true);
    };
  };

  const buildSteps = () => {
    const hasAnyCards = Boolean(document.querySelector('.grid-stack-item'));

    unlockPageDialog = () => {};
    unlockAddCardDialog = () => {};
    unlockWidgetSettingsDialog = () => {};

    const handlePageDialogHighlighted: DriverHook = (_el, _step, opts) => {
      unlockPageDialog();
      const unlockOverlay = lockActions('body', ['[data-slot="dialog-overlay"]']);
      const unlockOutside = lockOutsideInteractions('[data-tour="page-dialog"]');
      const unlockContent = lockActions('[data-tour="page-dialog"]', [
        '[data-tour="page-dialog-cancel"]',
        '[data-tour="page-dialog-submit"]',
      ]);
      const unbindClose = bindGuideCloseToDialogClose('[data-tour="page-dialog"]', opts.driver);
      unlockPageDialog = () => {
        unlockOverlay();
        unlockOutside();
        unlockContent();
        unbindClose();
      };
    };

    const handleAddCardDialogHighlighted: DriverHook = (_el, _step, opts) => {
      unlockAddCardDialog();
      const unlockOverlay = lockActions('body', ['[data-slot="dialog-overlay"]']);
      const unlockOutside = lockOutsideInteractions('[data-tour="add-card-dialog"]');
      const unlockContent = lockActions('[data-tour="add-card-dialog"]', [
        '[data-tour="widget-editor-cancel"]',
        '[data-tour="widget-editor-primary"]',
      ]);
      const unbindClose = bindGuideCloseToDialogClose('[data-tour="add-card-dialog"]', opts.driver);
      unlockAddCardDialog = () => {
        unlockOverlay();
        unlockOutside();
        unlockContent();
        unbindClose();
      };
    };

    const handleWidgetSettingsDialogHighlighted: DriverHook = (_el, _step, opts) => {
      unlockWidgetSettingsDialog();
      const unlockOverlay = lockActions('body', ['[data-slot="dialog-overlay"]']);
      const unlockOutside = lockOutsideInteractions('[data-tour="widget-settings-dialog"]');
      const unlockContent = lockActions('[data-tour="widget-settings-dialog"]', [
        '[data-tour="widget-editor-cancel"]',
        '[data-tour="widget-editor-primary"]',
      ]);
      const unbindClose = bindGuideCloseToDialogClose('[data-tour="widget-settings-dialog"]', opts.driver);
      unlockWidgetSettingsDialog = () => {
        unlockOverlay();
        unlockOutside();
        unlockContent();
        unbindClose();
      };
    };

    const openPageDialogAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        clickIfFound('.omnitab-tour-add-page');
        await waitForElement('[data-tour="page-dialog"]');
        opts.driver.moveNext();
      })();
    };

    const closePageDialogAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        const dialog = document.querySelector('[data-tour="page-dialog"]');
        if (dialog) {
          clickIfFound('[data-tour="page-dialog-cancel"]', dialog);
        }
        opts.driver.moveNext();
      })();
    };

    const openAddCardDialogAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        clickIfFound('[data-tour="add-card"]');
        await waitForElement('[data-tour="add-card-dialog"]');
        opts.driver.moveNext();
      })();
    };

    const closeAddCardDialogAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        const dialog = document.querySelector('[data-tour="add-card-dialog"]');
        if (dialog) {
          clickIfFound('[data-tour="widget-editor-cancel"]', dialog);
        }
        opts.driver.moveNext();
      })();
    };

    const enableEditModeAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        clickIfFound('[data-tour="edit-toggle"]');
        await waitForElement('[data-tour="reflow"]', 600);
        opts.driver.moveNext();
      })();
    };

    const openWidgetSettingsAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        clickIfFound('[data-tour="widget-settings-btn"]');
        await waitForElement('[data-tour="widget-settings-dialog"]');
        opts.driver.moveNext();
      })();
    };

    const closeWidgetSettingsAndNext: DriverHook = (_el, _step, opts) => {
      void (async () => {
        const dialog = document.querySelector('[data-tour="widget-settings-dialog"]');
        if (dialog) {
          clickIfFound('[data-tour="widget-editor-cancel"]', dialog);
        }
        opts.driver.moveNext();
      })();
    };

    const finishGuide: DriverHook = (_el, _step, opts) => {
      ensureExitEditMode();
      opts.driver.destroy();
    };

    const steps = [
      {
        element: resolveElement('.omnitab-tour-settings-entry'),
        popover: {
          title: '设置入口',
          description: '点这里可以打开设置，管理访问授权、备份等内容。',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
        },
      },
      {
        element: resolveElement('.omnitab-tour-sidebar'),
        popover: {
          title: '页面切换',
          description: '这里放着不同页面。点一下就能切换；也可以按住 Alt 再按数字键（1-9）。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
        },
      },
      {
        element: resolveElement('.omnitab-tour-add-page'),
        popover: {
          title: '新建页面',
          description: '点这里创建一个新页面，把不同用途的内容分开放更清爽。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
          onNextClick: openPageDialogAndNext,
        },
      },
      {
        element: resolveElement('[data-tour="page-dialog"]'),
        onHighlighted: handlePageDialogHighlighted,
        onDeselected: () => {
          unlockPageDialog();
          unlockPageDialog = () => {};
        },
        popover: {
          title: '页面弹窗',
          description: '你可以给页面起个名字，选个图标；需要的时候再调整背景。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
          onNextClick: closePageDialogAndNext,
        },
      },
      {
        element: resolveElement('[data-tour="add-card"]'),
        popover: {
          title: '添加卡片',
          description: '点“+”把新卡片放到当前页面。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
          onNextClick: openAddCardDialogAndNext,
        },
      },
      {
        element: resolveElement('[data-tour="add-card-dialog"]'),
        onHighlighted: handleAddCardDialogHighlighted,
        onDeselected: () => {
          unlockAddCardDialog();
          unlockAddCardDialog = () => {};
        },
        popover: {
          title: '添加卡片弹窗',
          description: '这里可以挑选卡片内容；也可以从配置文件导入，省去重复设置。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
          onNextClick: closeAddCardDialogAndNext,
        },
      },
      {
        element: resolveElement('[data-tour="edit-toggle"]'),
        popover: {
          title: '编辑模式',
          description: '打开编辑后，可以拖动卡片、调整大小；再点一次就退出编辑。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
          onNextClick: enableEditModeAndNext,
        },
      },
      {
        element: resolveElement('[data-tour="reflow"]'),
        popover: {
          title: '整理卡片',
          description: '点这里可以把卡片重新排整齐（页面有卡片时可用）。',
          prevBtnText: '上一步',
          nextBtnText: '下一步',
          closeBtnText: '关闭',
        },
      },
      ...(hasAnyCards
        ? [
            {
              element: resolveElement('[data-tour="widget-settings-btn"]'),
              popover: {
                title: '编辑卡片内容',
                description: '进入编辑模式后，卡片右上角会出现“设置”。点它可以修改内容或显示方式。',
                prevBtnText: '上一步',
                nextBtnText: '下一步',
                closeBtnText: '关闭',
                onNextClick: openWidgetSettingsAndNext,
              },
            },
            {
              element: resolveElement('[data-tour="widget-settings-dialog"]'),
              onHighlighted: handleWidgetSettingsDialogHighlighted,
              onDeselected: () => {
                unlockWidgetSettingsDialog();
                unlockWidgetSettingsDialog = () => {};
              },
              popover: {
                title: '卡片设置弹窗',
                description: '在这里改卡片内容，最后点“保存设置”。不想改了就点“取消”。',
                prevBtnText: '上一步',
                nextBtnText: '下一步',
                closeBtnText: '关闭',
                onNextClick: closeWidgetSettingsAndNext,
              },
            },
          ]
        : []),
      {
        element: resolveElement('[data-tour="grid"]'),
        popover: {
          title: '你的页面',
          description: hasAnyCards
            ? '卡片会摆在这里。按你的习惯组合，就能变成属于你的新标签页。'
            : '这里是放卡片的地方。先点右上角“添加卡片”，以后进入编辑模式就能在卡片右上角找到“设置”。',
          prevBtnText: '上一步',
          doneBtnText: '完成',
          closeBtnText: '关闭',
          onNextClick: finishGuide,
        },
      },
    ];

    return steps;
  };

  const destroy = () => {
    try {
      instance?.destroy();
    } catch {
      // ignore
    } finally {
      instance = null;
    }
  };

  const start = async (options: GuideStartOptions = {}) => {
    await seen.reload();
    if (!options.force && seen.state.value) return false;

    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const steps = buildSteps();
    if (!steps.length) {
      logger.warn('start skipped: no anchors');
      return false;
    }

    destroy();
    seen.set(true);

    instance = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      showButtons: ['previous', 'next', 'close'],
      overlayClickBehavior: 'close',
      steps,
      onCloseClick: closeGuide,
      onPopoverRender: (popover: { closeButton?: HTMLElement }, opts: { driver: Driver }) => {
        popover.closeButton?.addEventListener(
          'click',
          () => {
            opts.driver.destroy();
          },
          { once: true },
        );
      },
      onDestroyStarted: () => {
        unlockPageDialog();
        unlockAddCardDialog();
        unlockWidgetSettingsDialog();
        ensureExitEditMode();
      },
      onDestroyed: () => {
        instance = null;
        seen.set(true);
      },
    } as unknown as Parameters<typeof driver>[0]);

    logger.info('start', { from: options.from ?? 'settings', steps: steps.length });
    instance.drive();
    return true;
  };

  const startIfNeeded = async () => start({ from: 'auto' });

  const reset = async () => {
    await seen.reload();
    destroy();
    seen.set(false);
    logger.info('reset');
  };

  return {
    seen,
    start,
    startIfNeeded,
    reset,
    destroy,
  };
}
