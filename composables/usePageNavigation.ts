/**
 * 页面级路由与 store 同步：
 * - 初始化时加载 store 并用路由参数对齐 activePage
 * - 页面切换/新增/删除时同步 router 与 store
 */
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePageStore, type PageInfo } from './usePageStore';

export function usePageNavigation() {
  const route = useRoute();
  const router = useRouter();
  const store = usePageStore();

  const isPageRoute = () => route.name === 'page';

  const syncRouteFromState = () => {
    if (!isPageRoute()) return;
    const targetId = store.activePageId.value || store.pages.value[0]?.id;
    if (!targetId) return;

    const currentParam = typeof route.params.pageId === 'string' ? route.params.pageId : null;
    if (currentParam !== targetId) {
      router.replace({ name: 'page', params: { pageId: targetId } });
    }
  };

  const syncStateFromRoute = () => {
    if (!isPageRoute()) return;
    const routeId = typeof route.params.pageId === 'string' ? route.params.pageId : null;
    if (!routeId && store.pages.value[0]) {
      router.replace({ name: 'page', params: { pageId: store.pages.value[0].id } });
      return;
    }
    if (routeId) {
      store.setActivePage(routeId);
    }
  };

  const init = async () => {
    await store.init();
    syncStateFromRoute();
  };

  onMounted(() => {
    watch(
      () => route.fullPath,
      () => {
        if (!store.ready.value) return;
        if (!isPageRoute()) return;
        syncStateFromRoute();
      },
      { immediate: false },
    );

    watch(
      () => store.activePageId.value,
      () => {
        if (!store.ready.value) return;
        if (!isPageRoute()) return;
        syncRouteFromState();
      },
      { immediate: false },
    );
  });

  const handleAdd = (payload?: { name?: string; icon?: string; bgValue?: string; bgMask?: number }) => {
    const page = store.addPage(payload);
    if (page) {
      router.push({ name: 'page', params: { pageId: page.id } });
    }
  };

  const handleSelect = (id: string) => {
    store.setActivePage(id);
    router.push({ name: 'page', params: { pageId: id } });
  };

  const handleRemove = (id: string) => {
    const removingCurrent = id === store.activePageId.value;
    store.removePage(id);

    if (removingCurrent) {
      syncRouteFromState();
    }
  };

  const handleRename = (payload: { id: string; name: string; icon?: string; bgValue?: string; bgMask?: number }) => {
    store.renamePage(payload);
  };

  return {
    store,
    init,
    handleAdd,
    handleSelect,
    handleRemove,
    handleRename,
  };
}
