<script setup lang="ts">
import { onMounted } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Loader2, ShieldOff } from 'lucide-vue-next';
import { useSettingsPermissions } from '@/composables/useSettingsPermissions';

const {
  loading,
  errorMessage,
  grantedSorted,
  grantedItems,
  toRequest,
  getPermissionReason,
  getOriginReason,
  refresh,
  requestAllOptional,
  requestSingle,
  revokeDialogOpen,
  pendingRevoke,
  openRevoke,
  confirmRevoke,
} = useSettingsPermissions();

onMounted(() => {
  void refresh();
});

defineExpose({
  refresh,
  loading,
});
</script>

<template>
  <ScrollArea class="h-full w-full">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle class="flex items-center justify-between gap-2">
            <span>已开启</span>
            <Badge variant="secondary">{{ grantedSorted.permissions.length + grantedSorted.origins.length }}</Badge>
          </CardTitle>
          <CardDescription>你已经开启的访问授权（功能 + 网站）。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="text-foreground/90 text-sm font-medium">功能</div>
            <div class="flex flex-col gap-2">
              <div
                v-for="item in grantedItems.permissions"
                :key="`gp:${item.value}`"
                class="border-border bg-background flex items-start justify-between gap-3 rounded-2xl border px-3 py-2"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate text-sm font-medium">{{ item.reason.title }}</span>
                    <Badge v-if="item.required" variant="secondary">必需</Badge>
                    <Badge v-else-if="item.optional" variant="secondary">可选</Badge>
                  </div>
                  <div class="text-muted-foreground text-xs">
                    <span class="text-foreground/80 font-medium">用途：</span>{{ item.reason.description }}
                  </div>
                  <div class="text-muted-foreground/70 text-[11px]">标记：{{ item.value }}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="loading || item.required"
                  @click="openRevoke({ kind: 'permission', value: item.value, required: item.required })"
                >
                  <ShieldOff class="mr-2 h-4 w-4" />
                  关闭
                </Button>
              </div>
              <div v-if="!grantedItems.permissions.length" class="text-muted-foreground text-xs">暂无</div>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-foreground/90 text-sm font-medium">网站</div>
            <div class="flex flex-col gap-2">
              <div
                v-for="item in grantedItems.origins"
                :key="`go:${item.value}`"
                class="border-border bg-background flex items-start justify-between gap-3 rounded-2xl border px-3 py-2"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate text-sm font-medium">{{ item.value }}</span>
                    <Badge v-if="item.required" variant="secondary">必需</Badge>
                    <Badge v-else-if="item.optional" variant="secondary">可选</Badge>
                  </div>
                  <div class="text-muted-foreground text-xs">
                    <span class="text-foreground/80 font-medium">用途：</span>{{ item.reason.description }}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="loading || item.required"
                  @click="openRevoke({ kind: 'origin', value: item.value, required: item.required })"
                >
                  <ShieldOff class="mr-2 h-4 w-4" />
                  关闭
                </Button>
              </div>
              <div v-if="!grantedItems.origins.length" class="text-muted-foreground text-xs">暂无</div>
            </div>
          </div>

          <div class="border-border/60 bg-muted/20 text-muted-foreground rounded-2xl border px-3 py-2 text-xs">
            提示：关闭后可能会影响相关功能；必需项无法关闭。
          </div>
        </CardContent>
      </Card>

      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle class="flex items-center justify-between gap-2">
            <span>可开启</span>
            <Badge variant="secondary">{{ toRequest.permissions.length + toRequest.origins.length }}</Badge>
          </CardTitle>
          <CardDescription>可按需开启的授权，点击后会弹出确认提示。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div class="text-muted-foreground text-sm">一键开启全部可选项</div>
            <Button
              size="sm"
              :disabled="loading || (!toRequest.permissions.length && !toRequest.origins.length)"
              @click="requestAllOptional"
            >
              <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
              开启
            </Button>
          </div>

          <div class="space-y-2">
            <div class="text-foreground/90 text-sm font-medium">功能</div>
            <div class="flex flex-col gap-2">
              <div
                v-for="item in toRequest.permissions"
                :key="`rp:${item}`"
                class="border-border bg-background flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium">{{ getPermissionReason(item).title }}</div>
                  <div class="text-muted-foreground truncate text-xs">
                    <span class="text-foreground/80 font-medium">用途：</span
                    >{{ getPermissionReason(item).description }}
                  </div>
                  <div class="text-muted-foreground/70 truncate text-[11px]">标记：{{ item }}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="loading"
                  @click="requestSingle({ kind: 'permission', value: item })"
                >
                  <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
                  开启
                </Button>
              </div>
              <div v-if="!toRequest.permissions.length" class="text-muted-foreground text-xs">暂无</div>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-foreground/90 text-sm font-medium">网站</div>
            <div class="flex flex-col gap-2">
              <div
                v-for="item in toRequest.origins"
                :key="`ro:${item}`"
                class="border-border bg-background flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium">{{ item }}</div>
                  <div class="text-muted-foreground truncate text-xs">
                    <span class="text-foreground/80 font-medium">{{ getOriginReason(item).title }}：</span
                    >{{ getOriginReason(item).description }}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="loading"
                  @click="requestSingle({ kind: 'origin', value: item })"
                >
                  <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
                  开启
                </Button>
              </div>
              <div v-if="!toRequest.origins.length" class="text-muted-foreground text-xs">暂无</div>
            </div>
          </div>

          <div
            v-if="errorMessage"
            class="border-destructive/30 bg-destructive/10 text-destructive rounded-2xl border px-3 py-2 text-xs"
          >
            {{ errorMessage }}
          </div>
        </CardContent>
      </Card>
    </div>
  </ScrollArea>

  <AlertDialog v-model:open="revokeDialogOpen">
    <AlertDialogContent class="border-border bg-popover text-popover-foreground shadow-2xl sm:max-w-[480px]">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-base font-semibold">确认关闭访问授权</AlertDialogTitle>
        <AlertDialogDescription>
          确定要关闭「{{ pendingRevoke?.value ?? '' }}」吗？关闭后部分功能可能无法使用。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter class="pt-2">
        <AlertDialogCancel :disabled="loading">取消</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive hover:bg-destructive/90 text-white"
          :disabled="loading"
          @click="confirmRevoke"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          关闭
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
