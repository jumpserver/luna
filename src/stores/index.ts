import { createPinia } from 'pinia';

// 将 Pinia 状态持久化存储到浏览器的插件
import PiniaPluginPersistedState from 'pinia-plugin-persistedstate';

const pinia = createPinia();

pinia.use(PiniaPluginPersistedState);

export default pinia;
