/**
 * Node 侧的轻量日志：开发环境打印，生产环境静默。
 * 用法：const logger = useLog('scope'); logger.info('message', payload)
 */
export function useLog(scope) {
  const isDev = process.env.NODE_ENV !== 'production';
  const prefix = `[${scope}]`;
  const log = (level, ...args) => {
    if (!isDev) return;
    // eslint-disable-next-line no-console
    console[level](prefix, ...args);
  };
  return {
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
  };
}
