import './styles/main.css';
import 'virtual:svg-icons-register';
import '@renderer/styles/reset.scss';
import { createApp } from 'vue';
import { i18n } from '@renderer/lang';
import { pinia } from '@renderer/store';
import { router } from '@renderer/router';

import App from './App.vue';

const app = createApp(App);

app.use(i18n);
app.use(pinia);
app.use(router);

app.mount('#app');
