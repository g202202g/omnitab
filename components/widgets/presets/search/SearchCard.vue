<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStoredValue } from '@/composables/useStoredValue';
import { useLog } from '@/composables/useLog';
import { Search, X } from 'lucide-vue-next';

type EngineKey = 'bing' | 'google' | 'duckduckgo' | 'baidu';

interface EngineOption {
  key: EngineKey;
  label: string;
  hint: string;
  placeholder: string;
  home: string;
  buildUrl: (keyword: string) => string;
}

const ENGINE_FALLBACK: EngineKey = 'bing';
const engineOptions: EngineOption[] = [
  {
    key: 'bing',
    label: '必应',
    hint: '综合表现均衡，国内可用',
    placeholder: '搜索网页、图片或答案',
    home: 'https://www.bing.com/',
    buildUrl: (keyword) => `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`,
  },
  {
    key: 'google',
    label: 'Google',
    hint: '英文结果与开发者资料较优',
    placeholder: 'Google 搜索 / StackOverflow / 文档',
    home: 'https://www.google.com/',
    buildUrl: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
  },
  {
    key: 'duckduckgo',
    label: 'DuckDuckGo',
    hint: '隐私优先，不跟踪你的搜索',
    placeholder: 'DuckDuckGo 搜索',
    home: 'https://duckduckgo.com/',
    buildUrl: (keyword) => `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`,
  },
  {
    key: 'baidu',
    label: '百度',
    hint: '本地信息覆盖面广',
    placeholder: '百度一下',
    home: 'https://www.baidu.com/',
    buildUrl: (keyword) => `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`,
  },
];

const engineMap = engineOptions.reduce<Record<EngineKey, EngineOption>>(
  (acc, cur) => {
    acc[cur.key] = cur;
    return acc;
  },
  {} as Record<EngineKey, EngineOption>,
);

const storage = useStoredValue<{ engine: EngineKey; newTab?: boolean }>('local:search-widget', {
  engine: ENGINE_FALLBACK,
});
const query = ref('');
type InputHandle = { focus: () => void; blur: () => void; select: () => void; el?: { value: HTMLInputElement | null } };
const inputRef = ref<InputHandle | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const logger = useLog('widget-search');
const focusTimers: number[] = [];
let stopFocusListeners: (() => void) | null = null;
let hintTimer: number | undefined;
const showClickHint = ref(false);

const waitForGuideEnd = async () => {
  try {
    if (!document.body.classList.contains('driver-active')) return;
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body.classList.contains('driver-active')) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
  } catch {
    // ignore
  }
};

const selectedEngine = computed<EngineKey>({
  get: () =>
    engineMap[storage.state.value.engine as EngineKey] ? (storage.state.value.engine as EngineKey) : ENGINE_FALLBACK,
  set: (value) => {
    storage.state.value = {
      ...storage.state.value,
      engine: engineMap[value] ? value : ENGINE_FALLBACK,
    };
  },
});

const currentEngine = computed<EngineOption>(() => engineMap[selectedEngine.value] ?? engineMap[ENGINE_FALLBACK]);

const focusInput = async () => {
  await nextTick();
  await waitForGuideEnd();
  try {
    window.focus();
  } catch {
    // ignore
  }
  inputRef.value?.focus?.();
  inputRef.value?.select?.();
  const el = inputRef.value?.el?.value ?? null;
  if (el && document.activeElement === el) {
    showClickHint.value = false;
  }
};

const focusSoon = () => {
  void focusInput();
  focusTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
  const delays = [120, 360, 900, 1500, 2400, 3600, 5200];
  delays.forEach((delay) => {
    focusTimers.push(
      window.setTimeout(() => {
        void focusInput();
      }, delay),
    );
  });
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('[contenteditable="true"]'));
};

const setupFocusListeners = () => {
  const handleWindowFocus = () => {
    focusSoon();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    focusSoon();
  };

  const handlePointerDown = (event: PointerEvent) => {
    const root = rootRef.value;
    if (!root) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!root.contains(target)) return;
    if (isEditableTarget(event.target)) return;
    void focusInput();
  };

  const handleInputFocusIn = (event: FocusEvent) => {
    const el = inputRef.value?.el?.value ?? null;
    if (!el) return;
    if (event.target !== el) return;
    showClickHint.value = false;
  };

  window.addEventListener('focus', handleWindowFocus, true);
  document.addEventListener('visibilitychange', handleVisibilityChange, true);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('focusin', handleInputFocusIn, true);

  return () => {
    window.removeEventListener('focus', handleWindowFocus, true);
    document.removeEventListener('visibilitychange', handleVisibilityChange, true);
    window.removeEventListener('pointerdown', handlePointerDown, true);
    window.removeEventListener('focusin', handleInputFocusIn, true);
  };
};

const openUrl = (url: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const submitSearch = () => {
  const keyword = query.value.trim();
  const engine = currentEngine.value;
  const url = keyword ? engine.buildUrl(keyword) : engine.home;
  logger.info('submit search', {
    engine: engine.key,
    keyword,
  });
  openUrl(url);
};

const clearQuery = async () => {
  query.value = '';
  await focusInput();
};

const handleEnter = (event: KeyboardEvent) => {
  if ((event as KeyboardEvent).isComposing) return;
  event.preventDefault();
  submitSearch();
};

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    void focusInput();
  }
};

onMounted(() => {
  focusSoon();
  stopFocusListeners = setupFocusListeners();
  window.addEventListener('keydown', handleKeydown);
  hintTimer = window.setTimeout(() => {
    const el = inputRef.value?.el?.value ?? null;
    if (!el) return;
    if (document.activeElement === el) return;
    showClickHint.value = true;
  }, 1800);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  stopFocusListeners?.();
  stopFocusListeners = null;
  if (hintTimer) {
    window.clearTimeout(hintTimer);
    hintTimer = undefined;
  }
  focusTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
});

watch(
  () => selectedEngine.value,
  () => {
    focusSoon();
  },
);
</script>

<template>
  <div ref="rootRef" class="gs-no-move text-foreground flex h-full flex-col justify-center">
    <div class="mx-auto w-full max-w-[720px] px-1 sm:px-2">
      <div
        class="group border-border/60 bg-background/35 supports-backdrop-filter:bg-background/25 flex h-10 w-full min-w-0 items-stretch overflow-hidden rounded-2xl border shadow-xs transition-[border-color,box-shadow,background-color] supports-backdrop-filter:backdrop-blur-md"
      >
        <Select v-model="selectedEngine">
          <SelectTrigger
            size="sm"
            class="border-border/60 hover:bg-muted/60 data-[state=open]:bg-muted/60 h-10 w-24 shrink-0 rounded-r-none border-0 border-r bg-transparent px-3 py-0 text-left shadow-none focus-visible:ring-0 data-[size=default]:h-10 data-[size=sm]:h-10"
          >
            <SelectValue :placeholder="currentEngine.label" />
          </SelectTrigger>
          <SelectContent
            class="border-border/60 bg-background/70 supports-backdrop-filter:bg-background/55 rounded-xl shadow-xs supports-backdrop-filter:backdrop-blur-md"
          >
            <SelectItem
              v-for="engine in engineOptions"
              :key="engine.key"
              :value="engine.key"
              class="focus:bg-muted/60 focus:text-foreground cursor-pointer rounded-lg text-sm"
            >
              <span class="font-medium">{{ engine.label }}</span>
            </SelectItem>
          </SelectContent>
        </Select>

        <div class="relative flex-1">
          <button
            v-if="query.trim()"
            type="button"
            class="text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="清除搜索关键词"
            title="清除搜索关键词"
            @click="clearQuery"
          >
            <X class="h-4 w-4" />
          </button>
          <Search
            v-else
            class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
          />
          <Input
            ref="inputRef"
            v-model="query"
            class="search-card__input placeholder:text-muted-foreground/70 h-10 min-h-0 border-0 bg-transparent pr-10 pl-4 focus-visible:ring-0"
            :placeholder="currentEngine.placeholder"
            name="searchKeyword"
            autocomplete="on"
            type="search"
            inputmode="search"
            enterkeyhint="search"
            autocapitalize="off"
            spellcheck="false"
            aria-label="搜索关键词"
            @keydown.enter="handleEnter"
            @keydown.esc.prevent="query.trim() ? clearQuery() : undefined"
          />
          <div
            v-if="showClickHint && !query.trim()"
            class="text-muted-foreground/70 pointer-events-none absolute inset-y-0 right-10 left-4 flex items-center text-xs"
          >
            点一下就可以开始输入
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-card__input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
</style>
