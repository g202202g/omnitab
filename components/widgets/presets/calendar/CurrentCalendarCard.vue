<script setup lang="ts">
import { computed, ref } from 'vue';
import { Calendar } from '@/components/ui/calendar';
import { getLocalTimeZone, today, type CalendarDate } from '@internationalized/date';
import type { DateValue } from 'reka-ui/date';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const timezone = getLocalTimeZone();
const selected = ref<CalendarDate | undefined>(today(timezone));
const calendarValue = computed<DateValue | DateValue[] | undefined>({
  get: () => selected.value as unknown as DateValue | undefined,
  set: (value) => {
    if (Array.isArray(value)) {
      selected.value = (value[0] as CalendarDate | undefined) ?? undefined;
      return;
    }
    selected.value = value as CalendarDate | undefined;
  },
});
</script>

<template>
  <div class="text-foreground flex flex-col gap-2">
    <Calendar
      v-model="calendarValue"
      locale="zh-CN"
      :week-starts-on="1"
      class="border-border/60 bg-background/35 supports-backdrop-filter:bg-background/25 w-full rounded-2xl border p-2 shadow-xs supports-backdrop-filter:backdrop-blur-md"
    >
      <template #calendar-prev-icon>
        <ChevronLeft class="h-4 w-4" />
      </template>
      <template #calendar-next-icon>
        <ChevronRight class="h-4 w-4" />
      </template>
    </Calendar>
  </div>
</template>
