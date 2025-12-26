<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, RotateCcw } from 'lucide-vue-next';
import { useOnboardingGuide } from '@/composables/useOnboardingGuide';

const router = useRouter();
const route = useRoute();
const guide = useOnboardingGuide();
const hasSeen = computed(() => guide.seen.state.value);

const startGuide = async () => {
  if (route.name === 'settings') {
    await router.push({ name: 'page' });
    await nextTick();
  }
  void guide.start({ force: true, from: 'settings' });
};

const resetGuide = () => {
  void guide.reset();
};
</script>

<template>
  <ScrollArea class="h-full w-full">
    <div class="grid gap-6">
      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle>新手指引</CardTitle>
          <CardDescription>用几步带你熟悉页面怎么用。你也可以随时重新打开。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" @click="startGuide">
              <BookOpen class="mr-2 h-4 w-4" />
              开始指引
            </Button>
            <Button size="sm" variant="secondary" @click="resetGuide">
              <RotateCcw class="mr-2 h-4 w-4" />
              下次打开再提示
            </Button>
          </div>
          <div class="text-muted-foreground text-xs">当前：{{ hasSeen ? '已看过指引' : '下次打开会自动提示' }}</div>
        </CardContent>
      </Card>

      <Card class="rounded-3xl">
        <CardHeader>
          <CardTitle>小技巧</CardTitle>
          <CardDescription>一些常用操作，记住了会更顺手。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2 text-sm">
          <div class="flex items-start gap-2">
            <span class="bg-muted mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
              1
            </span>
            <div>按住 Alt 再按数字键（1-9）可以快速切换页面。</div>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-muted mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
              2
            </span>
            <div>右上角的“+”可以添加卡片。</div>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-muted mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
              3
            </span>
            <div>打开编辑后，可以拖动卡片位置，也可以调整大小。</div>
          </div>
        </CardContent>
      </Card>
    </div>
  </ScrollArea>
</template>
