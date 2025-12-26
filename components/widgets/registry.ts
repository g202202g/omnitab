import type { Component } from 'vue';
import CurrentTimeCard from './presets/clock/CurrentTimeCard.vue';
import CurrentCalendarCard from './presets/calendar/CurrentCalendarCard.vue';
import SearchCard from './presets/search/SearchCard.vue';
import IframeCard from './presets/iframe/IframeCard.vue';
import IframeWidgetForm from './presets/iframe/IframeWidgetForm.vue';
import BookmarksCard from './presets/bookmarks/BookmarksCard.vue';
import BookmarksWidgetForm from './presets/bookmarks/BookmarksWidgetForm.vue';
import HistoryCard from './presets/history/HistoryCard.vue';
import HistoryWidgetForm from './presets/history/HistoryWidgetForm.vue';
import HistoryInsightsCard from './presets/historyinsights/HistoryInsightsCard.vue';
import HistoryInsightsWidgetForm from './presets/historyinsights/HistoryInsightsWidgetForm.vue';
import SystemInfoCard from './presets/system/SystemInfoCard.vue';
import SystemInfoWidgetForm from './presets/system/SystemInfoWidgetForm.vue';
import TopSitesCard from './presets/topsites/TopSitesCard.vue';
import TopSitesWidgetForm from './presets/topsites/TopSitesWidgetForm.vue';
import DownloadsCard from './presets/downloads/DownloadsCard.vue';
import DownloadsWidgetForm from './presets/downloads/DownloadsWidgetForm.vue';
import SessionsCard from './presets/sessions/SessionsCard.vue';
import SessionsWidgetForm from './presets/sessions/SessionsWidgetForm.vue';
import { buildIframeCustomSchema } from './presets/iframe/schema';
import { buildBookmarksCustomSchema } from './presets/bookmarks/schema';
import { buildHistoryCustomSchema } from './presets/history/schema';
import { buildHistoryInsightsCustomSchema } from './presets/historyinsights/schema';
import { buildSystemCustomSchema } from './presets/system/schema';
import { buildTopSitesCustomSchema } from './presets/topsites/schema';
import { buildDownloadsCustomSchema } from './presets/downloads/schema';
import { buildSessionsCustomSchema } from './presets/sessions/schema';
import type { WidgetType } from './types';
import type { ZodTypeAny } from 'zod';

export interface WidgetDefinition {
  type: WidgetType;
  title: string;
  description: string;
  component: Component;
  formComponent?: Component;
  buildInitialData?: () => Record<string, unknown>;
  buildCustomSchema?: () => ZodTypeAny;
  defaults: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    name?: string;
    showBorder?: boolean;
    showTitle?: boolean;
    showBackground?: boolean;
  };
}

export const DEFAULT_WIDGET_TYPE: WidgetType = 'clock';

export const widgetDefinitions: Record<WidgetType, WidgetDefinition> = {
  clock: {
    type: 'clock',
    title: '当前时间',
    description: '实时同步，自动更新',
    component: CurrentTimeCard,
    defaults: { w: 8, h: 10, name: '当前时间', showBorder: true, showTitle: true, showBackground: true },
  },
  calendar: {
    type: 'calendar',
    title: '日历',
    description: '月历视图，标记今日',
    component: CurrentCalendarCard,
    defaults: { w: 3, h: 17, name: '日历', showBorder: true, showTitle: true, showBackground: true },
  },
  search: {
    type: 'search',
    title: '搜索',
    description: '快速输入并切换常用搜索引擎',
    component: SearchCard,
    defaults: { w: 24, h: 10, name: '搜索', showBorder: false, showTitle: false, showBackground: false },
  },
  iframe: {
    type: 'iframe',
    title: '网页卡片',
    description: '在卡片里打开任意网页，可随时修改链接',
    component: IframeCard,
    formComponent: IframeWidgetForm,
    buildInitialData: () => ({ url: '', selector: '', customStyle: '', uaMode: 'desktop', autoRefreshSeconds: 0 }),
    buildCustomSchema: buildIframeCustomSchema,
    defaults: { w: 5, h: 16, name: '网页卡片', showBorder: true, showTitle: true, showBackground: true },
  },
  bookmarks: {
    type: 'bookmarks',
    title: '书签列表',
    description: '展示浏览器书签，可选择文件夹并支持快速筛选',
    component: BookmarksCard,
    formComponent: BookmarksWidgetForm,
    buildInitialData: () => ({ folderId: '', maxItems: 24, showFavicon: true }),
    buildCustomSchema: buildBookmarksCustomSchema,
    defaults: { w: 8, h: 16, name: '书签', showBorder: true, showTitle: true, showBackground: true },
  },
  history: {
    type: 'history',
    title: '浏览历史',
    description: '展示最近访问过的网页，支持按关键词过滤（首次使用需要先开启访问授权）',
    component: HistoryCard,
    formComponent: HistoryWidgetForm,
    buildInitialData: () => ({ daysRange: 7, maxItems: 24, displayMode: 'default', showFavicon: true, showTime: true }),
    buildCustomSchema: buildHistoryCustomSchema,
    defaults: { w: 4, h: 16, name: '浏览历史', showBorder: true, showTitle: true, showBackground: true },
  },
  historyinsights: {
    type: 'historyinsights',
    title: '历史洞察',
    description: '聚合统计最近访问记录（趋势 + 常访问网站），适合搭配“浏览历史”一起使用',
    component: HistoryInsightsCard,
    formComponent: HistoryInsightsWidgetForm,
    buildInitialData: () => ({ daysRange: 7, topDomains: 10, showFavicon: true }),
    buildCustomSchema: buildHistoryInsightsCustomSchema,
    defaults: { w: 8, h: 16, name: '历史洞察', showBorder: true, showTitle: true, showBackground: true },
  },
  system: {
    type: 'system',
    title: '系统信息',
    description: '展示电池、CPU、系统内存等信息；支持设置定时刷新与趋势图',
    component: SystemInfoCard,
    formComponent: SystemInfoWidgetForm,
    buildInitialData: () => ({ refreshIntervalSeconds: 30, showBattery: true, showCpu: true, showMemory: true }),
    buildCustomSchema: buildSystemCustomSchema,
    defaults: { w: 8, h: 16, name: '系统信息', showBorder: true, showTitle: true, showBackground: true },
  },
  topsites: {
    type: 'topsites',
    title: '常访问站点',
    description: '展示常访问/热门站点列表（首次使用需要先开启访问授权）',
    component: TopSitesCard,
    formComponent: TopSitesWidgetForm,
    buildInitialData: () => ({ maxItems: 12, displayMode: 'default', showFavicon: true }),
    buildCustomSchema: buildTopSitesCustomSchema,
    defaults: { w: 6, h: 16, name: '常访问站点', showBorder: true, showTitle: true, showBackground: true },
  },
  downloads: {
    type: 'downloads',
    title: '下载任务',
    description: '展示下载列表，支持查看进度与快速操作（首次使用需要先开启访问授权）',
    component: DownloadsCard,
    formComponent: DownloadsWidgetForm,
    buildInitialData: () => ({ maxItems: 20, state: 'in_progress', autoRefreshSeconds: 5, showUrl: true }),
    buildCustomSchema: buildDownloadsCustomSchema,
    defaults: { w: 8, h: 16, name: '下载任务', showBorder: true, showTitle: true, showBackground: true },
  },
  sessions: {
    type: 'sessions',
    title: '最近关闭',
    description: '展示最近关闭的标签页列表（首次使用需要先开启访问授权）',
    component: SessionsCard,
    formComponent: SessionsWidgetForm,
    buildInitialData: () => ({ maxItems: 20, displayMode: 'default', showFavicon: true }),
    buildCustomSchema: buildSessionsCustomSchema,
    defaults: { w: 8, h: 16, name: '最近关闭', showBorder: true, showTitle: true, showBackground: true },
  },
};

export const resolveWidgetDefinition = (type?: WidgetType): WidgetDefinition =>
  widgetDefinitions[type ?? DEFAULT_WIDGET_TYPE] ?? widgetDefinitions[DEFAULT_WIDGET_TYPE];

export const buildWidgetDefaults = (type: WidgetType) => {
  const def = resolveWidgetDefinition(type);
  return { ...def.defaults, type: def.type };
};
