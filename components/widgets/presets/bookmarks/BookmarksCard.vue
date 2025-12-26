<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCcw, Folder, Link2, ChevronLeft, X } from 'lucide-vue-next';
import {
  WIDGET_CARD_CONTROLS_TARGET_KEY,
  type WidgetCardControlsTarget,
} from '@/components/widgets/utils/widgetCardControls';
import {
  buildBookmarkIndex,
  findDefaultFolderId,
  loadBookmarkTree,
  type BookmarkIndex,
  type IndexedBookmarkNode,
} from './bookmarks';
import { useOptionalPermission } from '@/composables/useOptionalPermission';
import LinkListItem from '@/components/widgets/common/LinkListItem.vue';
import LinkIconTile from '@/components/widgets/common/LinkIconTile.vue';

const MAX_ITEMS_DEFAULT = 24;

const props = withDefaults(
  defineProps<{
    widgetId: string;
    editMode?: boolean;
    data?: Record<string, unknown>;
  }>(),
  {
    editMode: false,
    data: () => ({}),
  },
);

const controlsTarget = inject<WidgetCardControlsTarget | null>(WIDGET_CARD_CONTROLS_TARGET_KEY, null);
const controlsTo = computed(() => controlsTarget?.value ?? null);

const configFolderId = computed(() => {
  const raw = (props.data as any)?.folderId;
  return typeof raw === 'string' ? raw.trim() : '';
});

const maxItems = computed(() => {
  const raw = Number((props.data as any)?.maxItems);
  if (!Number.isFinite(raw) || raw <= 0) return MAX_ITEMS_DEFAULT;
  return Math.max(1, Math.min(200, Math.floor(raw)));
});

const showFavicon = computed(() => ((props.data as any)?.showFavicon ?? true) !== false);
const iconOnly = computed(() => ((props.data as any)?.displayMode ?? 'default') === 'icon-only');

const loading = ref(false);
const errorText = ref<string | null>(null);
const permissionRequired = ref(false);
const index = ref<BookmarkIndex | null>(null);
const defaultFolderId = ref<string | null>(null);

const perm = useOptionalPermission();

const query = ref('');
const currentFolderId = ref<string>('');
const folderHistory = ref<string[]>([]);

const isFolderNode = (node: IndexedBookmarkNode | undefined) => !!node?.isFolder;
const isLinkNode = (node: IndexedBookmarkNode | undefined) => !!node && !node.isFolder && !!node.url;

const resolveConfiguredFolderId = () => {
  const idx = index.value;
  if (!idx) return '';
  const configured = configFolderId.value;
  if (configured && idx.nodes.has(configured)) return configured;
  const fallback = defaultFolderId.value ?? findDefaultFolderId(idx);
  return fallback ?? '';
};

const syncFolderFromConfig = () => {
  const next = resolveConfiguredFolderId();
  if (!next) return;
  currentFolderId.value = next;
  folderHistory.value = [];
};

const checkBookmarkPermission = async () => {
  if (!perm.isSupported) {
    permissionRequired.value = false;
    return true;
  }
  const ok = await perm.contains({ permissions: ['bookmarks'] });
  permissionRequired.value = !ok;
  return ok;
};

const loadData = async () => {
  loading.value = true;
  errorText.value = null;
  permissionRequired.value = false;
  try {
    const hasPerm = await checkBookmarkPermission();
    if (!hasPerm) {
      index.value = null;
      defaultFolderId.value = null;
      return;
    }
    const tree = await loadBookmarkTree();
    if (!tree) {
      index.value = null;
      defaultFolderId.value = null;
      errorText.value = '暂时无法读取书签，请确认已开启“书签”访问授权，并刷新页面后重试。';
      return;
    }
    const built = buildBookmarkIndex(tree);
    index.value = built;
    defaultFolderId.value = findDefaultFolderId(built);
    syncFolderFromConfig();
  } catch (error) {
    index.value = null;
    defaultFolderId.value = null;
    console.warn('[bookmarks] load failed', error);
    errorText.value = '读取失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
};

const currentFolder = computed(() => {
  const idx = index.value;
  if (!idx) return null;
  const id = currentFolderId.value || resolveConfiguredFolderId();
  if (!id) return null;
  return idx.nodes.get(id) ?? null;
});

const parentFolder = computed(() => {
  const idx = index.value;
  const cur = currentFolder.value;
  if (!idx || !cur?.parentId) return null;
  return idx.nodes.get(cur.parentId) ?? null;
});

const currentChildren = computed<IndexedBookmarkNode[]>(() => {
  const idx = index.value;
  const folder = currentFolder.value;
  if (!idx || !folder) return [];
  const children = folder.childrenIds.map((id) => idx.nodes.get(id)).filter(Boolean) as IndexedBookmarkNode[];
  return children;
});

const filteredChildren = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const items = currentChildren.value;
  if (!keyword) return items;
  return items.filter((item) => {
    if (item.isFolder) return item.title.toLowerCase().includes(keyword);
    const titleMatch = item.title.toLowerCase().includes(keyword);
    const urlMatch = (item.url ?? '').toLowerCase().includes(keyword);
    return titleMatch || urlMatch;
  });
});

const visibleChildren = computed(() => filteredChildren.value.slice(0, maxItems.value));

const folderTitle = (node: IndexedBookmarkNode | null | undefined) =>
  node?.title?.trim() ? node.title.trim() : '未命名文件夹';

const handleEnterFolder = (id: string) => {
  const idx = index.value;
  if (!idx) return;
  const target = idx.nodes.get(id);
  if (!isFolderNode(target)) return;
  if (currentFolderId.value) {
    folderHistory.value = [...folderHistory.value, currentFolderId.value];
  }
  currentFolderId.value = id;
  query.value = '';
};

const handleGoBack = () => {
  const prev = folderHistory.value[folderHistory.value.length - 1];
  if (prev) {
    folderHistory.value = folderHistory.value.slice(0, -1);
    currentFolderId.value = prev;
    query.value = '';
    return;
  }
  if (parentFolder.value?.id) {
    currentFolderId.value = parentFolder.value.id;
    query.value = '';
  }
};

const handleClearQuery = () => {
  query.value = '';
};

const itemLabel = (item: IndexedBookmarkNode) => {
  if (item.isFolder) return folderTitle(item);
  return item.title?.trim() ? item.title : (item.url ?? '未命名书签');
};

const itemHint = (item: IndexedBookmarkNode) => {
  if (item.isFolder) return `${item.childrenIds.length ? `${item.childrenIds.length} 项` : '空文件夹'}`;
  if (!item.url) return '';
  try {
    return new URL(item.url).host;
  } catch {
    return '';
  }
};

const handlePermissionChanged = () => {
  void loadData();
};

onMounted(() => {
  window.addEventListener('codex-bookmarks-permission-changed', handlePermissionChanged as EventListener);
  void loadData();
});

onBeforeUnmount(() => {
  window.removeEventListener('codex-bookmarks-permission-changed', handlePermissionChanged as EventListener);
});

watch(
  () => props.data,
  () => {
    // 配置变更（例如切换文件夹）后重置到配置入口
    syncFolderFromConfig();
  },
  { deep: true },
);
</script>

<template>
  <div class="text-foreground flex h-full min-h-0 flex-col gap-3">
    <Teleport v-if="controlsTo" :to="controlsTo">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="gs-no-move gs-no-drag text-muted-foreground hover:text-foreground rounded-xl"
            aria-label="刷新书签"
            @click.stop.prevent="loadData"
          >
            <RefreshCcw class="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">刷新</TooltipContent>
      </Tooltip>
    </Teleport>

    <div class="gs-no-move flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <Tooltip v-if="(folderHistory.length || parentFolder) && !loading">
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-foreground rounded-xl"
              aria-label="返回上级文件夹"
              @click="handleGoBack"
            >
              <ChevronLeft class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">返回</TooltipContent>
        </Tooltip>
        <div class="min-w-0">
          <div class="text-foreground line-clamp-1 text-sm font-medium">
            {{ currentFolder ? folderTitle(currentFolder) : '书签' }}
          </div>
          <div class="text-muted-foreground line-clamp-1 text-xs">
            {{
              loading
                ? '正在加载…'
                : errorText
                  ? '加载失败'
                  : `显示 ${visibleChildren.length} / ${filteredChildren.length}`
            }}
          </div>
        </div>
      </div>

      <div class="relative w-[200px] max-w-[50%] shrink-0">
        <button
          v-if="query.trim()"
          type="button"
          class="text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="清除过滤条件"
          title="清除过滤条件"
          @click="handleClearQuery"
        >
          <X class="h-4 w-4" />
        </button>
        <Input
          v-model="query"
          class="border-border/60 bg-background/25 placeholder:text-muted-foreground/70 h-9 rounded-xl pr-10 text-sm focus-visible:ring-0"
          placeholder="过滤书签"
          name="bookmarkFilter"
          autocomplete="off"
          spellcheck="false"
          aria-label="过滤书签"
        />
      </div>
    </div>

    <div
      v-if="errorText"
      class="border-border/60 bg-muted/30 rounded-xl border px-3 py-2 text-sm text-amber-700 dark:text-amber-500"
    >
      {{ errorText }}
      <div class="text-muted-foreground mt-1 text-xs">
        可到「设置 → 访问授权」里开启书签授权，或在编辑模式中打开卡片设置进行开启。
      </div>
    </div>

    <div
      v-else-if="permissionRequired"
      class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
    >
      <div class="text-foreground text-sm">需要先开启书签访问授权</div>
      <div class="text-muted-foreground mt-1 text-xs">进入编辑模式后，点击卡片右上角「设置」，按提示开启即可。</div>
    </div>

    <div
      v-else-if="!index || !currentFolder"
      class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
    >
      {{ loading ? '正在读取书签…' : '尚未选择书签文件夹。请在卡片设置中选择目录。' }}
    </div>

    <TooltipProvider v-else-if="iconOnly">
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
        <li v-for="item in visibleChildren" :key="item.id">
          <Tooltip v-if="item.isFolder">
            <TooltipTrigger as-child>
              <button
                type="button"
                class="group border-border/40 bg-background/25 text-muted-foreground hover:border-border/65 hover:bg-muted/50 hover:text-foreground focus-visible:ring-ring/40 mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none active:translate-y-0 active:shadow-sm"
                :aria-label="itemLabel(item)"
                @click="handleEnterFolder(item.id)"
              >
                <span
                  class="bg-secondary/55 text-secondary-foreground ring-border/35 grid h-10 w-10 place-items-center rounded-xl ring-1"
                >
                  <Folder class="h-5 w-5" />
                </span>
              </button>
            </TooltipTrigger>

            <TooltipContent
              side="top"
              align="center"
              :side-offset="8"
              class="border-border bg-popover/98 text-popover-foreground max-w-[260px] rounded-xl border px-3 py-2 shadow-xl"
            >
              <div class="grid gap-0.5">
                <div class="line-clamp-2 font-medium">
                  {{ itemLabel(item) }}
                </div>
                <div v-if="itemHint(item)" class="text-muted-foreground line-clamp-1 text-[11px]">
                  {{ itemHint(item) }}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>

          <LinkIconTile
            v-else-if="isLinkNode(item)"
            :title="itemLabel(item)"
            :href="item.url ?? ''"
            :subtitle="itemHint(item)"
            :show-favicon="showFavicon"
          >
            <template #fallback>
              <Link2 class="h-5 w-5" />
            </template>
          </LinkIconTile>
        </li>
      </ul>
    </TooltipProvider>

    <ul v-else class="grid gap-1">
      <li v-for="item in visibleChildren" :key="item.id">
        <button
          v-if="item.isFolder"
          type="button"
          class="group hover:bg-muted/45 focus-visible:ring-ring/40 flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="handleEnterFolder(item.id)"
        >
          <span class="bg-secondary text-secondary-foreground grid h-8 w-8 place-items-center rounded-lg">
            <Folder class="h-4 w-4" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-foreground line-clamp-1 text-sm font-medium">
              {{ folderTitle(item) }}
            </div>
            <div class="text-muted-foreground line-clamp-1 text-xs">
              {{ item.childrenIds.length ? `${item.childrenIds.length} 项` : '空文件夹' }}
            </div>
          </div>
        </button>

        <LinkListItem
          v-else-if="isLinkNode(item)"
          class="hover:bg-muted/45 focus-visible:ring-ring/40"
          :title="item.title?.trim() ? item.title : (item.url ?? '未命名书签')"
          :href="item.url ?? ''"
          :subtitle="item.url ?? ''"
          :show-favicon="showFavicon"
          icon-variant="secondary"
          icon-size="sm"
        >
          <template #fallback>
            <Link2 class="h-4 w-4" />
          </template>
        </LinkListItem>
      </li>

      <li
        v-if="!visibleChildren.length && query.trim()"
        class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
      >
        没有匹配到书签，试试换个关键词或清空过滤条件。
      </li>
      <li
        v-else-if="!visibleChildren.length"
        class="border-border/60 bg-muted/30 text-muted-foreground rounded-xl border px-3 py-2 text-sm"
      >
        当前目录为空。可以在浏览器书签中添加内容，或在卡片设置中切换目录。
      </li>
    </ul>
  </div>
</template>
