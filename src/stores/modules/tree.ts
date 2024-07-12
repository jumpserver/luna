import { defineStore } from 'pinia';
import { TreeState } from '../interface/index';

export const useTreeStore = defineStore('tree', {
  state: (): TreeState => ({
    // 默认异步加载资产树
    isAsync: true
  }),
  actions: {
    changeState(newValue: Boolean) {
      newValue && (this.isAsync = newValue);
    }
  }
});
