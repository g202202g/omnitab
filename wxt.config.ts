import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '万象标签（OmniTab）',
    description: '可自定义的新标签页：背景可切换、组件可增删拖拽、配置可持久化。',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        96: 'icon/96.png',
        128: 'icon/128.png',
      },
      default_title: '万象标签（OmniTab）',
    },
    permissions: ['storage', 'declarativeNetRequestWithHostAccess', 'favicon'],
    optional_permissions: ['history', 'bookmarks', 'system.cpu', 'system.memory', 'topSites', 'downloads', 'sessions'],
    host_permissions: [],
    // optional_host_permissions: ['http://*/*', 'https://*/*'],
  },
  vite: () => ({
    plugins: [
      tailwindcss(),
      Icons({
        compiler: 'vue3',
        defaultClass: 'w-4 h-4',
        scale: 1,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'), // or "./src" if using src directory
      },
    },
  }),
});
