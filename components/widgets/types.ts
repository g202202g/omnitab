export type WidgetType =
  | 'clock'
  | 'calendar'
  | 'search'
  | 'iframe'
  | 'bookmarks'
  | 'history'
  | 'historyinsights'
  | 'system'
  | 'topsites'
  | 'downloads'
  | 'sessions';

export const WIDGET_TYPE_LIST = [
  'clock',
  'calendar',
  'search',
  'iframe',
  'bookmarks',
  'history',
  'historyinsights',
  'system',
  'topsites',
  'downloads',
  'sessions',
] as const satisfies readonly WidgetType[];

export interface WidgetOptions {
  name?: string;
  showBorder?: boolean;
  showTitle?: boolean;
  showBackground?: boolean;
}
