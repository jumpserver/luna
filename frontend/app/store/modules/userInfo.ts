import type { ConnectionInfo, PermOrgItem, UserData } from '~/types/index';

export const useUserInfoStore = defineStore(
  'userInfo',
  () => {
    const orgId = ref('');
    const currentSite = ref('');
    const loggedIn = ref(false);
    const currentUser = ref<UserData | null>(null);
    const userMap = ref<Record<string, UserData>>({});
    const currentOrganizations = ref<PermOrgItem[]>([]);
    // 保存每个资产的连接信息 { [assetId]: { protocol, username } }
    const connectionInfoMap = ref<Record<string, ConnectionInfo>>({});

    const hasUser = () => computed(() => Object.keys(userMap.value).length > 0);

    /**
     * @description 设置用户登录状态
     * @param l
     */
    const setUserLoggedIn = (l: boolean) => {
      loggedIn.value = l;
    };

    /**
     * @description 获取用户数据
     * @param site
     * @returns
     */
    const getUserData = (site: string) => {
      if (!(site in userMap.value)) {
        return null;
      }

      return userMap.value[site];
    };

    /**
     * @description 设置用户数据
     * @param site
     * @param userData
     */
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

    /**
     * @description 删除用户数据
     * @param site
     */
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

    /**
     * @description 设置当前站点
     * @param site
     */
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

    /**
     * @description 设置当前组织列表
     * @param orgs
     */
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

    /**
     * @description 设置当前组织
     * @param org
     */
    const setCurrentOrg = (org: PermOrgItem) => {
      if (!currentUser.value || !currentSite.value) {
        console.error('No current user or site when setting organization');
        return;
      }

      const updatedUserData = {
        ...currentUser.value,
        org,
      };

      currentUser.value = updatedUserData as UserData;
      orgId.value = org.id;
      userMap.value[currentSite.value] = updatedUserData as UserData;
    };

    /**
     * @description 设置用户连接信息
     * @param connectionInfo
     * @returns
     */
    const setConnectionInfoToUser = (connectionInfo: ConnectionInfo) => {
      if (!currentUser.value) {
        return;
      }

      currentUser.value.connectionInfo = connectionInfo;
    };

    /**
     * @description 获取资产连接信息
     * @param assetId 资产 ID
     * @returns
     */
    const getConnectionInfoForAsset = (assetId: string) => {
      return connectionInfoMap.value[assetId] || null;
    };

    /**
     * @description 设置资产连接信息
     * @param assetId 
     * @param connectionInfo 
     */
    const setConnectionInfoForAsset = (
      assetId: string,
      connectionInfo: ConnectionInfo
    ) => {
      connectionInfoMap.value[assetId] = connectionInfo;
    };

    return {
      orgId,
      userMap,
      loggedIn,
      currentSite,
      currentUser,
      connectionInfoMap,
      currentOrganizations,

      hasUser,
      setUserData,
      getUserData,
      setCurrentOrg,
      setCurrentSite,
      deleteUserData,
      setUserLoggedIn,
      setOrganizations,
      setConnectionInfoToUser,
      getConnectionInfoForAsset,
      setConnectionInfoForAsset,
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
        'orgId',
        'currentUser',
        'currentOrganizations',
        'connectionInfoMap',
      ],
    },
  }
);
