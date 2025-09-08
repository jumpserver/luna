import type { PermOrgItem, UserData } from '~/types/index';

export const useUserInfoStore = defineStore(
  'userInfo',
  () => {
    const currentSite = ref('');
    const loggedIn = ref(false);
    const currentUser = ref<UserData | null>(null);
    const userMap = ref<Record<string, UserData>>({});
    const currentOrganizations = ref<PermOrgItem[]>([]);

    const hasUser = () => computed(() => Object.keys(userMap.value).length > 0);

    const setUserLoggedIn = (l: boolean) => {
      loggedIn.value = l;
    };

    const getUserData = (site: string) => {
      if (!(site in userMap.value)) {
        return null;
      }

      return userMap.value[site];
    };

    const setUserData = (site: string, userData: UserData) => {
      if (site in userMap.value) {
        return;
      }

      currentUser.value = userData;
      currentSite.value = site;
      userMap.value[site] = userData;
    };

    const deleteUserData = (site: string) => {
      if (!(site in userMap.value)) {
        return;
      }

      delete userMap.value[site];

      // 如果还有用户，则切换到下一个用户
      if (hasUser().value) {
        const nextUser: UserData | undefined = Object.values(userMap.value)[0];

        if (nextUser) {
          currentUser.value = nextUser;
          currentSite.value = nextUser.site;
        }
      } else {
        currentUser.value = null;
        currentSite.value = '';
        currentOrganizations.value = [];
        loggedIn.value = false;
        userMap.value = {};
      }
    };

    const setCurrentSite = (site: string) => {
      currentSite.value = site;

      // 当切换站点时，同时更新当前组织列表
      const userData = getUserData(site);
      if (userData) {
        currentUser.value = userData;
        currentOrganizations.value = userData.availableOrgs || [];
      }
    };

    const setOrganizations = (orgs: PermOrgItem[]) => {
      currentOrganizations.value = orgs;

      // 同时更新当前用户数据中的组织信息
      if (currentUser.value && currentSite.value) {
        const updatedUserData = {
          ...currentUser.value,
          availableOrgs: orgs,
        };
        userMap.value[currentSite.value] = updatedUserData;
        currentUser.value = updatedUserData;
      }
    };

    return {
      userMap,
      loggedIn,
      currentSite,
      currentUser,
      currentOrganizations,

      hasUser,
      setUserData,
      setCurrentSite,
      deleteUserData,
      setUserLoggedIn,
      getUserData,
      setOrganizations,
    };
  },
  {
    persist: {
      key: 'userInfo',
      storage: localStorage,
      pick: [
        'userMap',
        'loggedIn',
        'currentSite',
        'currentUser',
        'currentOrganizations',
      ],
    },
  }
);
