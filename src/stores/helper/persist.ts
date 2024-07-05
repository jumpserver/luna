import { PersistedStateOptions } from 'pinia-plugin-persistedstate';

/**
 * @description 持久化配置参数
 * @param {String} key 存储到持久化的 name
 * @param {Array}  paths 需要持久化的 state name
 */
const piniaPersistConfig = (key: string, paths?: string[]) => {
  return {
    key,
    paths,
    storage: localStorage
  } as PersistedStateOptions;
};

export default piniaPersistConfig;
