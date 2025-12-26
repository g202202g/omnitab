<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FloatingDock, FloatingDockIcon, FloatingDockSeparator } from '@/components/ui/floating-dock';
import type { PageInfo } from '@/composables/usePageStore';
import { useLog } from '@/composables/useLog';
import { Plus, Ellipsis, Trash2, Pencil } from 'lucide-vue-next';
import DynamicIcon from '@/components/ui/icon/DynamicIcon.vue';
import PageFormDialog from '@/components/layout/PageFormDialog.vue';

const props = defineProps<{
  pages: PageInfo[];
  activePageId: string | null;
}>();

const emit = defineEmits<{
  add: [payload?: { name?: string; icon?: string; bgValue?: string; bgMask?: number }];
  select: [id: string];
  remove: [id: string];
  rename: [
    {
      id: string;
      name: string;
      icon?: string;
      bgValue?: string;
      bgMask?: number;
    },
  ];
}>();

const formDialogOpen = ref(false);
const editingPage = ref<PageInfo | null>(null);
const confirmDialogOpen = ref(false);
const pendingDelete = ref<PageInfo | null>(null);
const logger = useLog('page-sidebar');
const projectMeta = {
  name: '万象标签',
};

const router = useRouter();
const route = useRoute();
const isSettingsPage = computed(() => route.name === 'settings');

watch(
  () => ({
    route: String(route.name ?? ''),
    activePageId: props.activePageId ?? '',
    pageIds: props.pages.map((p) => p.id),
    pageNames: props.pages.map((p) => p.name),
  }),
  (value) => {
    logger.info('sidebar state', value);
  },
  { deep: true, immediate: true },
);

const openSettings = () => {
  if (isSettingsPage.value) return;
  router.push({ name: 'settings' });
};

const openDeleteConfirm = (page: PageInfo) => {
  if (props.pages.length <= 1) return;
  pendingDelete.value = page;
  confirmDialogOpen.value = true;
};

const startEdit = (page: PageInfo) => {
  editingPage.value = page;
  formDialogOpen.value = true;
};

const confirmRemove = () => {
  if (!pendingDelete.value || props.pages.length <= 1) return;
  emit('remove', pendingDelete.value.id);
  pendingDelete.value = null;
  confirmDialogOpen.value = false;
};

const openCreateForm = () => {
  editingPage.value = null;
  formDialogOpen.value = true;
};

const handleCreate = (payload?: { name?: string; icon?: string; bgValue?: string; bgMask?: number }) => {
  emit('add', payload);
};

const handleSave = (payload: { id: string; name: string; icon?: string; bgValue?: string; bgMask?: number }) => {
  emit('rename', payload);
};
</script>

<template>
  <div>
    <FloatingDock
      orientation="vertical"
      direction="middle"
      indicatorPosition="left"
      desktop-class-name="omnitab-tour-sidebar fixed left-4 top-1/2 z-50 -translate-y-1/2 text-foreground shadow-lg"
      mobile-class-name="omnitab-tour-sidebar fixed inset-x-0 bottom-6 z-50 flex justify-center md:hidden"
    >
      <FloatingDockIcon
        :title="`${projectMeta.name}设置`"
        aria-label="打开设置"
        :active="isSettingsPage"
        class="cursor-pointer"
        @click="openSettings"
      >
        <img
          src="/icon/32.png"
          :alt="projectMeta.name"
          class="omnitab-tour-settings-entry select-none"
          draggable="false"
        />
        <span class="sr-only">{{ projectMeta.name }}</span>
      </FloatingDockIcon>
      <FloatingDockSeparator class="opacity-60" />
      <FloatingDockIcon
        v-for="page in pages"
        :key="page.id"
        :title="page.name"
        :aria-label="`切换到${page.name}`"
        :active="page.id === activePageId"
        @click="emit('select', page.id)"
        class="group"
      >
        <div class="relative flex w-full justify-center">
          <DynamicIcon :name="page.icon" class="h-5 w-5 shrink-0 text-current" />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="border-border/50 bg-background/90 text-muted-foreground hover:text-foreground pointer-events-none absolute -top-3 -right-3 flex h-6 w-6 items-center justify-center rounded-full border opacity-0 shadow-sm transition-all duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                aria-label="页面操作"
                title="页面操作"
                @click.stop
              >
                <Ellipsis class="h-3.5 w-3.5" />
                <span class="sr-only">页面操作</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="start"
              class="border-border bg-popover/98 text-popover-foreground rounded-2xl border shadow-2xl"
            >
              <DropdownMenuItem class="gap-2 text-sm" @click="startEdit(page)">
                <Pencil class="h-4 w-4" /> 编辑
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                class="gap-2"
                :disabled="pages.length <= 1"
                @click="openDeleteConfirm(page)"
              >
                <Trash2 class="h-4 w-4" /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </FloatingDockIcon>
      <FloatingDockSeparator class="opacity-60" />
      <FloatingDockIcon title="新建页面" aria-label="新建页面" @click="openCreateForm">
        <div class="omnitab-tour-add-page flex h-full w-full items-center justify-center">
          <Plus class="h-full" />
        </div>
      </FloatingDockIcon>
    </FloatingDock>

    <PageFormDialog v-model:open="formDialogOpen" :page="editingPage" @create="handleCreate" @save="handleSave" />

    <AlertDialog v-model:open="confirmDialogOpen">
      <AlertDialogContent class="border-border bg-popover text-popover-foreground shadow-2xl sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle class="text-base font-semibold">确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除页面「{{ pendingDelete?.name ?? '' }}」吗？删除后当前布局将不可恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter class="pt-2">
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive hover:bg-destructive/90 text-white" @click="confirmRemove">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
