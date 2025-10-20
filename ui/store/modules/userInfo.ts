import type {
  ConnectionInfo,
  PermOrgItem,
  RdpGraphics,
  UserData,
} from '~/types/index';

export type SiteUserData = UserData & {
  rdpClientOption?: RdpGraphics;
  connectionInfoMap?: Record<string, ConnectionInfo>;
};

// 其实应该叫做 accountInfoStore 比较好
export const useUserInfoStore = defineStore(
  'userInfo',
  () => {
    const orgId = ref('');
    const currentSite = ref('');
    const loggedIn = ref(false);

    const userMap = ref<Record<string, SiteUserData>>({});

    const currentUser = ref<UserData | null>(null);
    const currentOrganizations = ref<PermOrgItem[]>([]);
    const currentRdpClientOption = ref<RdpGraphics>({});
    const currentConnectionInfoMap = ref<Record<string, ConnectionInfo>>({});

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
      currentUser.value = userData;
      currentSite.value = site;
      userMap.value[site] = userData as SiteUserData;

      // 设置组织 ID
      if (userData.org?.id) {
        orgId.value = userData.org.id;
      }

      // 初始化当前站点连接信息映射以及 RDP 客户端选项
      // prettier-ignore
      currentConnectionInfoMap.value = userMap.value[site].connectionInfoMap || {};
      // prettier-ignore
      currentRdpClientOption.value = (userMap.value[site] as SiteUserData).rdpClientOption || {};
    };

    /**
     * @description 删除用户数据
     * @param site
     */
    const deleteUserData = (site: string) => {
      // 退出当前站点时立即请求清理其 Cookie
      useTauriCoreInvoke('logout', {
        name: 'main',
        origin: site,
      });

      if (!(site in userMap.value)) {
        return;
      }

      delete userMap.value[site];

      // 如果还有用户，则切换到下一个用户
      if (hasUser().value) {
        const nextUser = Object.values(userMap.value)[0] as
          | SiteUserData
          | undefined;

        if (nextUser) {
          currentUser.value = nextUser;
          currentSite.value = nextUser.site;

          // 更新组织 ID
          if (nextUser.org?.id) {
            orgId.value = nextUser.org.id;
          }

          // 同步连接信息映射以及 RDP 客户端选项
          currentConnectionInfoMap.value = nextUser.connectionInfoMap || {};
          currentRdpClientOption.value = nextUser.rdpClientOption || {};
          currentOrganizations.value = nextUser.available_orgs || [];

          nextTick(() => {
            useEventBus().emit('refresh', undefined);
          });
        }
      } else {
        orgId.value = '';
        currentSite.value = '';
        loggedIn.value = false;
        currentUser.value = null;
        currentOrganizations.value = [];
        userMap.value = {};
        currentConnectionInfoMap.value = {};
        currentRdpClientOption.value = {};

        nextTick(() => {
          useEventBus().emit('clearAssets', undefined);
        });
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
        currentOrganizations.value = userData.available_orgs || [];

        if (userData.org?.id) {
          orgId.value = userData.org.id;
        }

        // 同步当前站点的连接信息映射以及 RDP 客户端选项
        const siteConn = (userData as SiteUserData).connectionInfoMap || {};

        currentConnectionInfoMap.value = siteConn;
        currentRdpClientOption.value =
          (userData as SiteUserData).rdpClientOption || {};
      } else {
        currentConnectionInfoMap.value = {};
        currentRdpClientOption.value = {};
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
          available_orgs: orgs,
        };

        userMap.value[currentSite.value] = updatedUserData as SiteUserData;
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
      userMap.value[currentSite.value] = updatedUserData as SiteUserData;
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

      currentUser.value.connection_info = connectionInfo;
    };

    /**
     * @description 获取资产连接信息
     * @param assetId 资产 ID
     * @returns
     */
    const getConnectionInfoForAsset = (assetId: string) => {
      if (!currentSite.value) return null;

      const siteData = userMap.value[currentSite.value];
      return siteData?.connectionInfoMap?.[assetId] || null;
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
      if (!currentSite.value) return;
      const site = currentSite.value;
      const siteData = userMap.value[site];

      if (!siteData) return;

      if (!siteData.connectionInfoMap) {
        siteData.connectionInfoMap = {};
      }

      siteData.connectionInfoMap[assetId] = connectionInfo;
      currentConnectionInfoMap.value = siteData.connectionInfoMap;
    };

    /**
     * @description 设置 RDP 客户端选项
     * @param rdpClientOption
     */
    const setRdpClientOption = (rdpClientOption: RdpGraphics) => {
      currentRdpClientOption.value = rdpClientOption;

      // 同步到当前站点的用户数据中，便于持久化/切换站点后恢复
      if (currentSite.value && userMap.value[currentSite.value]) {
        const site = currentSite.value;
        const siteData = userMap.value[site] as SiteUserData;

        userMap.value[site] = {
          ...siteData,
          rdpClientOption,
        } as SiteUserData;
      }
    };

    return {
      orgId,
      userMap,
      loggedIn,
      currentSite,
      currentUser,
      currentOrganizations,
      currentRdpClientOption,
      currentConnectionInfoMap,

      hasUser,
      setUserData,
      getUserData,
      setCurrentOrg,
      setCurrentSite,
      deleteUserData,
      setUserLoggedIn,
      setOrganizations,
      setRdpClientOption,
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
        'orgId',
        'userMap',
        'loggedIn',
        'currentUser',
        'currentSite',
        'currentOrganizations',
        'currentRdpClientOption',
        'currentConnectionInfoMap',
      ],
    },
  }
);
