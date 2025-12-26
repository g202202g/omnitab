<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import DynamicIcon from './DynamicIcon.vue';
import { ChevronDown, X } from 'lucide-vue-next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  DEFAULT_ICON_NAME,
  DEFAULT_ICON_PREFIX,
  buildIconEntries,
  getIconCollectionMeta,
  normalizeIconName,
  splitIconName,
  searchIcons,
} from '@/lib/iconify';

type IconEntry = {
  prefix: string;
  name: string;
  fullName: string;
  keywords: string[];
};

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    prefixes?: string[];
    favorites?: string[];
    limit?: number;
    searchAllPrefixes?: boolean;
    allowEmpty?: boolean;
  }>(),
  {
    prefixes: () => [DEFAULT_ICON_PREFIX],
    favorites: () => ['lucide:layout-grid', 'lucide:home', 'lucide:briefcase', 'lucide:sparkles'],
    limit: 120,
    searchAllPrefixes: true,
    allowEmpty: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'select', value: string): void;
}>();

const keyword = ref('');
const collectionLoading = ref(false);
const collectionError = ref('');
const searchLoading = ref(false);
const searchError = ref('');
const iconEntries = ref<IconEntry[]>([]);
const searchGroups = ref<Array<{ prefix: string; items: IconEntry[] }>>([]);
let loadToken = 0;
let searchToken = 0;
const MIN_REMOTE_SEARCH_LENGTH = 2;
const dropdownOpen = ref(false);
type InputHandle = { focus: () => void; blur: () => void; select: () => void };
const searchInputRef = ref<InputHandle | null>(null);
const baseLimit = computed(() => Math.max(24, props.limit || 120));
const visibleLimit = ref(baseLimit.value);

const preventAutoFocus = (event: Event) => {
  event.preventDefault();
};

const normalizedPrefixes = computed(() => {
  const values = props.prefixes?.length ? props.prefixes : [DEFAULT_ICON_PREFIX];
  return Array.from(new Set(values.filter(Boolean)));
});

const normalizedValue = computed(() =>
  props.allowEmpty
    ? normalizeIconName(props.modelValue, '', DEFAULT_ICON_PREFIX)
    : normalizeIconName(props.modelValue, DEFAULT_ICON_NAME),
);
const trimmedKeyword = computed(() => keyword.value.trim());
const normalizedFavorites = computed(() => {
  const seen = new Set<string>();
  const defaults = props.favorites?.length ? props.favorites : [];
  return defaults
    .map((item) => normalizeIconName(item, DEFAULT_ICON_NAME))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
});

const useRemoteSearch = computed(() => trimmedKeyword.value.length >= MIN_REMOTE_SEARCH_LENGTH);
const localFilteredEntries = computed(() => {
  const q = trimmedKeyword.value.toLowerCase();
  if (!q) return iconEntries.value;
  return iconEntries.value.filter((entry) => entry.keywords.some((word) => word.includes(q)));
});

const groupEntries = (entries: IconEntry[]) => {
  const map = new Map<string, IconEntry[]>();
  entries.forEach((entry) => {
    if (!map.has(entry.prefix)) {
      map.set(entry.prefix, []);
    }
    map.get(entry.prefix)!.push(entry);
  });
  return Array.from(map.entries()).map(([prefix, items]) => ({ prefix, items }));
};

const localGroups = computed(() => groupEntries(localFilteredEntries.value));

const limitGroups = (groups: Array<{ prefix: string; items: IconEntry[] }>, cap = baseLimit.value) => {
  if (cap <= 0) return groups;
  let remaining = cap;
  const result: Array<{ prefix: string; items: IconEntry[] }> = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const slice = group.items.slice(0, remaining);
    if (slice.length) {
      result.push({ prefix: group.prefix, items: slice });
      remaining -= slice.length;
    }
  }
  return result;
};

const activeGroups = computed(() => (useRemoteSearch.value ? searchGroups.value : localGroups.value));
const limitedActiveGroups = computed(() => limitGroups(activeGroups.value, visibleLimit.value));
const quickLimitedGroups = computed(() => limitGroups(quickGroups.value, baseLimit.value));
const displayGroupsRaw = computed(() =>
  showQuickList.value && quickLimitedGroups.value.length ? quickLimitedGroups.value : limitedActiveGroups.value,
);
const flatVisibleCount = computed(() => displayGroupsRaw.value.reduce((acc, group) => acc + group.items.length, 0));
const totalCount = computed(() => {
  if (showQuickList.value && quickGroups.value.length) {
    return quickGroups.value.reduce((acc, group) => acc + group.items.length, 0);
  }
  return activeGroups.value.reduce((acc, group) => acc + group.items.length, 0);
});
const isEmpty = computed(() => !collectionLoading.value && !searchLoading.value && flatVisibleCount.value === 0);
const summaryLabel = computed(() => {
  if (showQuickList.value && quickGroups.value.length) return '常用图标';
  if (useRemoteSearch.value) return '搜索结果';
  return '全部图标';
});
const summaryCount = computed(() => {
  if (showQuickList.value && quickGroups.value.length) return `${flatVisibleCount.value}`;
  return `${flatVisibleCount.value}/${totalCount.value}`;
});
const canLoadMore = computed(() => !showQuickList.value && !isEmpty.value && flatVisibleCount.value < totalCount.value);
const showEndSpacer = computed(() => canLoadMore.value);
const remoteSearchHint = computed(() => {
  if (!trimmedKeyword.value) return '';
  if (!useRemoteSearch.value) {
    return `输入至少 ${MIN_REMOTE_SEARCH_LENGTH} 个字符以触发远程搜索`;
  }
  return '';
});

const quickEntries = computed<IconEntry[]>(() =>
  normalizedFavorites.value.map((item) => {
    const { prefix, name } = splitIconName(item);
    return { prefix, name, fullName: item, keywords: [name, item] };
  }),
);
const quickGroups = computed(() => (quickEntries.value.length ? [{ prefix: '常用', items: quickEntries.value }] : []));
const displayGroupMeta = computed(() =>
  (displayGroupsRaw.value || []).map((group) => ({
    prefix: group.prefix,
    label: group.prefix === '常用' ? '常用' : group.prefix.toUpperCase(),
    hasBadge: !showQuickList.value && group.prefix !== '常用',
    items: group.items,
  })),
);
const showQuickList = computed(() => !trimmedKeyword.value);
const loadMore = () => {
  visibleLimit.value = Math.min(visibleLimit.value + baseLimit.value, totalCount.value);
};

const selectIcon = (value: string) => {
  const normalized = props.allowEmpty
    ? normalizeIconName(value, '', DEFAULT_ICON_PREFIX)
    : normalizeIconName(value, DEFAULT_ICON_NAME);
  emit('update:modelValue', normalized);
  emit('select', normalized);
  keyword.value = '';
  searchGroups.value = [];
  searchError.value = '';
  searchLoading.value = false;
  dropdownOpen.value = false;
  searchInputRef.value?.blur();
};

const openDropdown = () => {
  if (dropdownOpen.value) return;
  dropdownOpen.value = true;
  void nextTick(() => {
    searchInputRef.value?.focus();
  });
};

const toggleDropdown = () => {
  if (dropdownOpen.value) {
    dropdownOpen.value = false;
    return;
  }
  openDropdown();
};

watch(
  () => [trimmedKeyword.value, baseLimit.value, showQuickList.value],
  () => {
    visibleLimit.value = baseLimit.value;
  },
);

const loadIcons = async () => {
  const prefixes = normalizedPrefixes.value;
  if (!prefixes.length) return;
  const token = ++loadToken;
  collectionLoading.value = true;
  collectionError.value = '';
  try {
    const allEntries: IconEntry[] = [];
    for (const prefix of prefixes) {
      const meta = await getIconCollectionMeta(prefix);
      if (token !== loadToken) return;
      if (meta) {
        allEntries.push(...buildIconEntries(meta.prefix, meta.icons));
      }
    }
    if (token !== loadToken) return;
    iconEntries.value = allEntries;
  } catch (error) {
    if (token !== loadToken) return;
    console.error('[IconPicker] load error', error);
    collectionError.value = error instanceof Error ? error.message : '加载图标失败';
  } finally {
    if (token === loadToken) {
      collectionLoading.value = false;
    }
  }
};

const runRemoteSearch = async () => {
  const query = trimmedKeyword.value;
  if (query.length < MIN_REMOTE_SEARCH_LENGTH) {
    searchGroups.value = [];
    searchError.value = '';
    searchLoading.value = false;
    return;
  }
  const token = ++searchToken;
  searchLoading.value = true;
  searchError.value = '';
  try {
    const prefixes = props.searchAllPrefixes ? [] : normalizedPrefixes.value;
    const results = await searchIcons(query, prefixes, props.limit * 2);
    if (token !== searchToken) return;
    const grouped = new Map<string, IconEntry[]>();
    results.forEach((fullName) => {
      const { prefix, name } = splitIconName(fullName);
      const entry = {
        prefix,
        name,
        fullName: `${prefix}:${name}`,
        keywords: [name, `${prefix}:${name}`],
      };
      if (!grouped.has(prefix)) {
        grouped.set(prefix, []);
      }
      grouped.get(prefix)!.push(entry);
    });
    searchGroups.value = Array.from(grouped.entries()).map(([prefix, items]) => ({ prefix, items }));
    visibleLimit.value = baseLimit.value;
  } catch (error) {
    if (token !== searchToken) return;
    console.error('[IconPicker] remote search error', error);
    searchError.value = error instanceof Error ? error.message : '搜索失败';
    searchGroups.value = [];
  } finally {
    if (token === searchToken) {
      searchLoading.value = false;
    }
  }
};

watch(
  () => normalizedPrefixes.value.join(','),
  () => {
    iconEntries.value = [];
    void loadIcons();
    if (useRemoteSearch.value) {
      void runRemoteSearch();
    }
  },
  { immediate: true },
);

watch(
  () => trimmedKeyword.value,
  () => {
    if (useRemoteSearch.value) {
      void runRemoteSearch();
    } else {
      searchToken += 1;
      searchGroups.value = [];
      searchError.value = '';
      searchLoading.value = false;
    }
  },
);

onBeforeUnmount(() => {
  loadToken += 1;
  searchToken += 1;
});
</script>

<template>
  <DropdownMenu v-model:open="dropdownOpen" :modal="false">
    <DropdownMenuTrigger as-child :disabled="true">
      <div class="space-y-1">
        <div class="relative">
          <Input
            ref="searchInputRef"
            v-model="keyword"
            class="pr-20 pl-12"
            placeholder="输入关键字搜索图标"
            name="iconKeyword"
            type="search"
            @focus="openDropdown"
            @input="openDropdown"
            @keydown.esc.stop.prevent="dropdownOpen = false"
          />
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <DynamicIcon
              v-if="normalizedValue"
              :name="normalizedValue"
              class="border-border/60 bg-muted/30 text-foreground h-6 w-6 rounded-md border p-1"
            />
            <span
              v-else
              class="border-border/70 bg-muted/20 text-muted-foreground/70 inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed text-[10px] font-semibold uppercase"
              aria-hidden="true"
            >
              无
            </span>
          </div>
          <div class="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
            <Button
              v-if="props.allowEmpty && normalizedValue"
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-foreground rounded-full"
              title="清除"
              aria-label="清除图标"
              @mousedown.stop
              @click.stop.prevent="selectIcon('')"
            >
              <X class="h-4 w-4" />
            </Button>
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground flex items-center transition"
              aria-label="展开图标选择"
              title="展开图标选择"
              @click.stop.prevent="toggleDropdown"
            >
              <ChevronDown class="h-4 w-4" :class="dropdownOpen ? 'text-primary rotate-180' : ''" />
            </button>
          </div>
        </div>
      </div>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="start"
      side="bottom"
      :side-offset="8"
      class="border-border/80 bg-popover/95 text-popover-foreground shadow-[0_15px_{45}px_rgba(0,0,0,0.35)] w-[min(var(--reka-dropdown-menu-trigger-width),var(--reka-dropdown-menu-content-available-width))] overflow-hidden rounded-2xl border p-3 backdrop-blur-xl"
      @open-auto-focus="preventAutoFocus"
      @close-auto-focus="preventAutoFocus"
    >
      <div class="space-y-3">
        <div
          class="bg-muted/20 text-muted-foreground/70 flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-medium tracking-wide uppercase"
        >
          <span class="flex items-center gap-2">
            <span
              class="block h-2 w-2 rounded-full"
              :class="collectionLoading || searchLoading ? 'bg-primary' : 'bg-muted-foreground/50'"
            />
            {{ summaryLabel }}
          </span>
          <span class="flex items-center gap-2">
            <Button
              v-if="props.allowEmpty && normalizedValue"
              type="button"
              variant="ghost"
              size="sm"
              class="text-muted-foreground hover:text-foreground h-7 rounded-full px-3 text-[11px]"
              @mousedown.stop
              @click.stop.prevent="selectIcon('')"
            >
              清除
            </Button>
            <span>{{ summaryCount }}</span>
          </span>
        </div>
        <p v-if="remoteSearchHint && !showQuickList" class="text-muted-foreground/70 px-1 text-[10px]">
          {{ remoteSearchHint }}
        </p>

        <div class="border-border/50 bg-background/90 rounded-xl border shadow-inner">
          <ScrollArea class="grid h-[260px] overscroll-contain">
            <div class="space-y-3 p-2 pr-1 pb-4">
              <div v-for="group in displayGroupMeta" :key="group.prefix" class="last:mb-0">
                <div
                  class="text-muted-foreground/60 flex items-center justify-between px-1 pb-0.5 text-[9px] tracking-wide uppercase"
                >
                  <span>{{ group.label }}</span>
                  <span
                    v-if="group.hasBadge"
                    class="bg-muted/30 text-muted-foreground/60 rounded-full px-1.5 py-0.5 text-[8px]"
                  >
                    {{ group.items.length }}
                  </span>
                </div>
                <div class="grid grid-cols-6 gap-2 p-1">
                  <button
                    v-for="entry in group.items"
                    :key="entry.fullName"
                    type="button"
                    class="bg-muted/5 text-muted-foreground hover:border-border hover:bg-card hover:text-foreground relative flex h-12 w-full items-center justify-center rounded-xl border border-transparent transition duration-150 hover:-translate-y-0.5"
                    :class="
                      entry.fullName === normalizedValue ? 'border-primary/70 bg-primary/15 text-primary shadow-sm' : ''
                    "
                    :title="entry.fullName"
                    @click="selectIcon(entry.fullName)"
                  >
                    <DynamicIcon :name="entry.fullName" class="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div v-if="canLoadMore && !showQuickList" class="mt-2 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="border-border/60 text-muted-foreground hover:border-primary/60 hover:text-primary mx-auto block rounded-full border px-4 text-xs"
                  @mousedown.stop
                  @click.stop.prevent="loadMore"
                >
                  加载更多
                </Button>
              </div>
              <p v-if="isEmpty" class="text-muted-foreground py-8 text-center text-xs">
                {{ showQuickList ? '暂无常用图标' : '暂无匹配结果' }}
              </p>
            </div>
          </ScrollArea>
        </div>

        <div class="space-y-1 text-xs">
          <p v-if="collectionError" class="text-rose-400">图标加载失败：{{ collectionError }}</p>
          <p v-if="searchError" class="text-rose-400">搜索失败：{{ searchError }}</p>
        </div>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
