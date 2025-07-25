import type { DropdownOption } from 'naive-ui';

import { defineStore } from 'pinia';
import { piniaPersistConfig } from '@renderer/store/helper';

interface IAssetMap {
  account: DropdownOption;
  protocol: DropdownOption;
}

export const useAssetStore = defineStore('asset', {
  state: () => ({
    // 不能用 map 原因是 当 store 被持久化时，Map 对象会被转换为普通对象，导致失去 Map 的方法
    assetMap: {} as Record<string, IAssetMap>,
  }),
  actions: {
    setAssetMap(token: string, payload: any) {
      this.assetMap[token] = payload;
    },
    getAssetMap(token: string) {
      const result = this.assetMap[token];
      return result;
    },
    removeAssetMap(token: string) {
      delete this.assetMap[token];
    },
    clearAssetMap() {
      this.assetMap = {};
    },
  },
  persist: piniaPersistConfig('asset'),
});
