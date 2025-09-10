import type { PermOrgItem, UserData } from '~/types/index';

export const useUserInfoStore = defineStore(
  'userInfo',
  () => {
    const orgId = ref('');
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

      // 设置组织 ID
      if (userData.org?.id) {
        orgId.value = userData.org.id;
      }
    };

    const deleteUserData = (site: string) => {
      if (!(site in userMap.value)) {
        return;
      }

      delete userMap.value[site];

      // 如果还有用户，则切换到下一个用户
      if (hasUser().value) {
        const nextUser = Object.values(userMap.value)[0] as
          | UserData
          | undefined;

        if (nextUser) {
          currentUser.value = nextUser;
          currentSite.value = nextUser.site;
          // 更新组织 ID
          if (nextUser.org?.id) {
            orgId.value = nextUser.org.id;
          }
        }
      } else {
        currentUser.value = null;
        currentSite.value = '';
        orgId.value = '';
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

        if (userData.org?.id) {
          orgId.value = userData.org.id;
        }
      }
    };

    const setOrganizations = (orgs: PermOrgItem[]) => {
      currentOrganizations.value = orgs;

      if (currentUser.value && currentSite.value) {
        const updatedUserData = {
          ...currentUser.value,
          availableOrgs: orgs,
        };
        userMap.value[currentSite.value] = updatedUserData;
        currentUser.value = updatedUserData;
      }
    };

    const setCurrentOrg = (org: PermOrgItem) => {
      if (!currentUser.value || !currentSite.value) {
        console.error('No current user or site when setting organization');
        return;
      }

      const updatedUserData = {
        ...currentUser.value,
        org,
      };

      currentUser.value = updatedUserData;
      orgId.value = org.id;
      userMap.value[currentSite.value] = updatedUserData;
    };

    return {
      orgId,
      userMap,
      loggedIn,
      currentSite,
      currentUser,
      currentOrganizations,

      hasUser,
      setUserData,
      getUserData,
      setCurrentOrg,
      setCurrentSite,
      deleteUserData,
      setUserLoggedIn,
      setOrganizations,
    };
  },
  {
    // @ts-ignore
    persist: {
      key: 'userInfo',
      storage: localStorage,
      pick: [
        'userMap',
        'loggedIn',
        'currentSite',
        'orgId',
        'currentUser',
        'currentOrganizations',
      ],
    },
  }
);
