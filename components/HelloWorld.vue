<script lang="ts" setup>
import { ref } from 'vue';
import { Button } from '@/components/ui/button';

defineProps({
  msg: String,
});

const count = ref(0);
</script>

<template>
  <div class="border-border bg-card/80 space-y-4 rounded-xl border p-4 shadow-sm">
    <h1 class="text-foreground text-xl font-semibold">{{ msg }}</h1>
    <div class="text-muted-foreground space-y-2 text-sm">
      <p>简单示例：点击下方按钮可累加计数，用来确认页面是否正常。</p>
      <Button type="button" @click="count++">当前计数 {{ count }}</Button>
    </div>
  </div>
</template>
