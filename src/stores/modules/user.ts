import { defineStore } from 'pinia';
import { UserState } from '@/stores/interface';
import piniaPersistConfig from '@/stores/helper/persist';

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    id: '',
    name: '',
    email: '',
    source: '',
    username: '',
    avatar_url: ''
  }),
  actions: {
    setName(name: string) {
      this.name = name;
    },
    setAvatar(avatar: string) {
      this.avatar_url = avatar;
    },
    setEmail(email: string) {
      this.email = email;
    },
    setSource(source: string) {
      this.source = source;
    },
    setUserName(username: string) {
      this.username = username;
    },
    setUserId(id: string) {
      this.id = id;
    }
  },
  persist: piniaPersistConfig('user')
});
