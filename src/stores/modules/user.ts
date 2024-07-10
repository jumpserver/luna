import { defineStore } from 'pinia';
import { UserState } from '@/stores/interface';

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    avatar_url: '',
    name: ''
  }),
  getters: {},
  actions: {}
});
