import type { UserData } from '~/types/index';

export const useUserInfoStore = defineStore(
  'userInfo',
  () => {
    const currentSite = ref('');
    const loggedIn = ref(false);
    const userMap = ref<Map<string, UserData>>(new Map());

    const setUserLoggedIn = (l: boolean) => {
      loggedIn.value = l;
    };

    const getUserData = (site: string) => {
      if (!userMap.value.has(site)) {
        return null;
      }

      return userMap.value.get(site);
    };

    const setUserData = (site: string, userData: UserData) => {
      userMap.value.set(site, userData);
    };

    const setCurrentSite = (site: string) => {
      currentSite.value = site;
    };

    return {
      loggedIn,
      currentSite,

      setUserData,
      setCurrentSite,
      setUserLoggedIn,

      getUserData,
    };
  },
  {
    persist: {
      storage: localStorage,
    },
  }
);
