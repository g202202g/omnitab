<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Loader2, ShieldCheck, Sparkles } from 'lucide-vue-next';
import SettingsBackupTab from '@/components/settings/SettingsBackupTab.vue';
import SettingsGuideTab from '@/components/settings/SettingsGuideTab.vue';
import SettingsPermissionsTab from '@/components/settings/SettingsPermissionsTab.vue';

const activeTab = ref<'permissions' | 'backup' | 'guide'>('permissions');

type PermissionsTabExpose = {
  refresh: () => Promise<void>;
  loading: { value: boolean };
};

const permissionsRef = ref<PermissionsTabExpose | null>(null);

const permissionsLoading = computed(() => permissionsRef.value?.loading?.value ?? false);

const handleRefresh = () => {
  void permissionsRef.value?.refresh?.();
};
</script>

<template>
  <section class="h-screen w-full overflow-hidden">
    <div class="h-full w-full p-6 md:p-10">
      <div class="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-6">
        <header class="flex shrink-0 items-start justify-between gap-4">
          <div class="space-y-1">
            <h1 class="text-2xl font-semibold tracking-tight">设置</h1>
            <p class="text-muted-foreground text-sm">管理访问授权、备份迁移等内容。</p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              :disabled="activeTab !== 'permissions' || permissionsLoading"
              @click="handleRefresh"
            >
              <Loader2 v-if="permissionsLoading" class="mr-2 h-4 w-4 animate-spin" />
              刷新
            </Button>
          </div>
        </header>

        <Tabs v-model="activeTab" class="flex min-h-0 w-full flex-1 flex-col">
          <TabsList
            class="border-border bg-background/60 h-auto w-full shrink-0 justify-start rounded-2xl border p-1 shadow-sm"
          >
            <TabsTrigger value="permissions" class="h-9 flex-none! rounded-xl px-4">
              <ShieldCheck class="h-4 w-4" />
              访问授权
            </TabsTrigger>
            <TabsTrigger value="backup" class="h-9 flex-none! rounded-xl px-4">
              <Download class="h-4 w-4" />
              备份与迁移
            </TabsTrigger>
            <TabsTrigger value="guide" class="h-9 flex-none! rounded-xl px-4">
              <Sparkles class="h-4 w-4" />
              新手指引
            </TabsTrigger>
          </TabsList>

          <TabsContent value="permissions" class="min-h-0 flex-1 pt-2">
            <SettingsPermissionsTab ref="permissionsRef" />
          </TabsContent>

          <TabsContent value="backup" class="min-h-0 flex-1 pt-2">
            <SettingsBackupTab />
          </TabsContent>

          <TabsContent value="guide" class="min-h-0 flex-1 pt-2">
            <SettingsGuideTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  </section>
</template>
