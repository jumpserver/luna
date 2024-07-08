import { defineStore } from 'pinia';
import type { UseLoading } from '@/stores/interface';

export const useLoadingStore = defineStore('loading', {
  state: (): UseLoading => ({
    isLoading: false
  }),
  actions: {
    startLoading() {
      this.isLoading = true;
    },
    stopLoading() {
      this.isLoading = false;
    }
  }
});
