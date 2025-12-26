type Level = 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

/**
 * 开发环境轻量日志，生产静默。
 * 用法：const logger = useLog('scope'); logger.info('message', payload)
 */
export function useLog(scope: string) {
  const log = (level: Level, ...args: unknown[]) => {
    if (!isDev) return;
    const prefix = `[${scope}]`;
    // eslint-disable-next-line no-console
    console[level](prefix, ...args);
  };

  return {
    info: (...args: unknown[]) => log('info', ...args),
    warn: (...args: unknown[]) => log('warn', ...args),
    error: (...args: unknown[]) => log('error', ...args),
  };
}
