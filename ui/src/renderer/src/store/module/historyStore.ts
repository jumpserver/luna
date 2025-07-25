import type { ISession } from '@renderer/store/interface';

import { defineStore } from 'pinia';
import { piniaPersistConfig } from '@renderer/store/helper';

export const useHistoryStore = defineStore('history', {
  state: () => ({
    history_session: [],
  }),
  actions: {
    setHistorySession(s: Partial<ISession>) {
      if (this.history_session!.some((item: ISession) => item.id === s.id))
        return;

      this.history_session!.unshift(s);
      this.history_session!.slice(0, 50);
    },
    getHistorySession(keyWord: string) {
      if (!keyWord)
        return this.history_session;

      return this.history_session.filter((item) => {
        return Object.values(item).some(
          value => typeof value === 'string' && value.includes(keyWord),
        );
      });
    },
  },
  persist: piniaPersistConfig('history'),
});
