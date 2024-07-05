import { createApp } from 'vue';

import App from './App.vue';
import naive from 'naive-ui';
import pinia from '@/stores';
import i18n from '@/languages';
import router from '@/routers';

// 初始化浏览器样式
import 'normalize.css';
// 全局字体
import 'vfonts/OpenSans.css';
// 引入自定义初始化样式
import '@/styles/reset.scss';

const app = createApp(App);

app.use(i18n);
app.use(naive);
app.use(pinia);
app.use(router);

app.mount('#app');
