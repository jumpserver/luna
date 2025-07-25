import type { PersistedStateOptions } from 'pinia-plugin-persistedstate';

/**
 * @description pinia 持久化参数配置
 * @param {string} key 存储到持久化的 name
 * @param {Array} paths 需要持久化的 state name
 * @return persist
 */
export const piniaPersistConfig = (key: string, paths?: string[]) => {
  const persist: PersistedStateOptions = {
    key,
    storage: localStorage,
    paths,
  };
  return persist;
};
