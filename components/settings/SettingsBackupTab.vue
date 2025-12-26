<script setup lang="ts">
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
import { Download, Loader2, Upload } from 'lucide-vue-next';
import { useSettingsBackup } from '@/composables/useSettingsBackup';

const {
  backupWorking,
  backupExportMessage,
  backupImportMessage,
  backupDialogOpen,
  backupFileInputRef,
  exportBackup,
  chooseBackupFile,
  handleBackupFileChange,
  confirmImportBackup,
} = useSettingsBackup();
</script>

<template>
  <ScrollArea class="h-full w-full">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle>备份</CardTitle>
          <CardDescription>把当前设置保存成一个文件，方便以后恢复或带到其他设备。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" :disabled="backupWorking" @click="exportBackup">
              <Loader2 v-if="backupWorking" class="mr-2 h-4 w-4 animate-spin" />
              <Download v-else class="mr-2 h-4 w-4" />
              导出备份
            </Button>
            <div class="text-muted-foreground text-xs">提示：访问授权不会包含在备份里，导入后需要你重新开启。</div>
          </div>
          <div
            v-if="backupExportMessage"
            class="border-border/60 bg-muted/30 text-muted-foreground rounded-2xl border px-3 py-2 text-xs"
          >
            {{ backupExportMessage }}
          </div>
        </CardContent>
      </Card>

      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle>恢复</CardTitle>
          <CardDescription>从备份文件恢复设置。导入后会覆盖你现在的设置。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <input ref="backupFileInputRef" type="file" class="hidden" @change="handleBackupFileChange" />
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" :disabled="backupWorking" @click="chooseBackupFile">
              <Loader2 v-if="backupWorking" class="mr-2 h-4 w-4 animate-spin" />
              <Upload v-else class="mr-2 h-4 w-4" />
              导入备份
            </Button>
            <div class="text-muted-foreground text-xs">导入后会自动刷新页面。</div>
          </div>
          <div
            v-if="backupImportMessage"
            class="border-border/60 bg-muted/30 text-muted-foreground rounded-2xl border px-3 py-2 text-xs"
          >
            {{ backupImportMessage }}
          </div>
        </CardContent>
      </Card>
    </div>
  </ScrollArea>

  <AlertDialog v-model:open="backupDialogOpen">
    <AlertDialogContent class="border-border bg-popover text-popover-foreground shadow-2xl sm:max-w-[480px]">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-base font-semibold">确认导入备份</AlertDialogTitle>
        <AlertDialogDescription>导入后会覆盖你现在的设置。确定要继续吗？</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter class="pt-2">
        <AlertDialogCancel :disabled="backupWorking">取消</AlertDialogCancel>
        <AlertDialogAction :disabled="backupWorking" @click="confirmImportBackup">
          <Loader2 v-if="backupWorking" class="mr-2 h-4 w-4 animate-spin" />
          确认导入
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
