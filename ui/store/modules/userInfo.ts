import type {
  ConnectionInfo,
  ConnectionPreferenceInfo,
  PermOrgItem,
  ProtocolConnectionPreferenceInfo,
  RdpGraphics,
  UserData
} from "~/types/index";
import { useConnectMethods } from "~/composables/useConnectMethods";

export type SiteUserData = UserData & {
  language?: string;
  rdpClientOption?: RdpGraphics;
  connectionInfoMap?: Record<string, ConnectionInfo>;
  connectionPreferenceMap?: Record<string, ConnectionPreferenceInfo>;
  protocolConnectionPreferenceMap?: Record<string, ProtocolConnectionPreferenceInfo>;
};

// 其实应该叫做 accountInfoStore 比较好
export const useUserInfoStore = defineStore(
  "userInfo",
  () => {
    const currentAccountId = ref("");
    const currentSite = ref("");
    const loggedIn = ref(false);

    const currentUser = ref<UserData | null>(null);
    const currentOrganizations = ref<PermOrgItem[]>([]);
    const userMap = ref<Record<string, SiteUserData>>({});
    const currentRdpClientOption = ref<RdpGraphics>({});
    const currentConnectionInfoMap = ref<Record<string, ConnectionInfo>>({});
    const currentConnectionPreferenceMap = ref<Record<string, ConnectionPreferenceInfo>>({});

    const hasUser = computed(() => Object.keys(userMap.value).length > 0);
    const orgId = computed(() => currentUser.value?.org?.id || "");

    /**
     * @description 将当前前端会话同步给 Rust 请求层
     * @param accountId
     * @param userData
     */
    const syncApiSession = (accountId: string, userData: UserData) => {
      if (!isTauriRuntime()) return;
      if (!accountId || !userData.bearerToken || !userData.org?.id) return;

      void useTauriCoreInvoke("set_api_session", {
        sessionKey: accountId,
        origin: userData.site,
        bearerToken: userData.bearerToken,
        orgId: userData.org.id
      }).catch((error) => {
        console.error("sync api session failed", error);
      });
    };

    watch(
      [currentAccountId, currentUser],
      ([accountId, userData]) => {
        if (accountId && userData) syncApiSession(accountId, userData);
      },
      { immediate: true }
    );

    /**
     * @description 设置用户登录状态
     * @param l
     */
    const setUserLoggedIn = (l: boolean) => {
      loggedIn.value = l;
    };

    /**
     * @description 获取用户数据
     * @param accountId
     */
    const getUserData = (accountId: string) => {
      if (!(accountId in userMap.value)) {
        return null;
      }

      return userMap.value[accountId];
    };

    /**
     * @description 设置用户数据
     * @param accountId
     * @param userData
     */
    const setUserData = (accountId: string, userData: UserData) => {
      const previous = userMap.value[accountId];
      const next: SiteUserData = {
        ...previous,
        ...userData,
        accountId,
        connectionInfoMap: previous?.connectionInfoMap || {},
        connectionPreferenceMap: previous?.connectionPreferenceMap || {},
        protocolConnectionPreferenceMap: previous?.protocolConnectionPreferenceMap || {},
        rdpClientOption: previous?.rdpClientOption || {}
      };

      userMap.value[accountId] = next;
      currentUser.value = next;
      currentAccountId.value = accountId;
      currentSite.value = next.site;
      loggedIn.value = true;
      syncApiSession(accountId, next);

      // 初始化当前站点连接信息映射、偏好映射以及 RDP 客户端选项
      currentConnectionInfoMap.value = next.connectionInfoMap || {};
      currentConnectionPreferenceMap.value = next.connectionPreferenceMap || {};
      currentRdpClientOption.value = next.rdpClientOption || {};

      // 登录后获取连接方法
      const { fetchConnectMethods } = useConnectMethods();
      nextTick(async () => {
        try {
          await fetchConnectMethods();
        } catch (error) {
          console.debug("Failed to fetch connect methods on login:", error);
        }
      });
    };

    /**
     * @description 删除用户数据
     * @param accountId
     */
    const deleteUserData = (accountId: string) => {
      const userData = userMap.value[accountId];

      // 退出当前站点时立即请求清理其 Cookie
      if (isTauriRuntime() && userData) {
        useTauriCoreInvoke("logout", {
          name: "main",
          site: userData.site,
          sessionId: accountId
        });
      }

      if (!userData) {
        return;
      }

      delete userMap.value[accountId];

      // 如果还有用户，则切换到下一个用户
      if (hasUser.value) {
        const nextEntry = Object.entries(userMap.value)[0] as [string, SiteUserData] | undefined;

        if (nextEntry) {
          const [nextAccountId, nextUser] = nextEntry;
          currentUser.value = nextUser;
          currentAccountId.value = nextAccountId;
          currentSite.value = nextUser.site;
          syncApiSession(nextAccountId, nextUser);

          // 同步连接信息映射、偏好映射以及 RDP 客户端选项
          currentConnectionInfoMap.value = nextUser.connectionInfoMap || {};
          currentConnectionPreferenceMap.value = nextUser.connectionPreferenceMap || {};
          currentRdpClientOption.value = nextUser.rdpClientOption || {};
          currentOrganizations.value = nextUser.availableOrgs || [];

          loggedIn.value = true;

          nextTick(() => {
            useEventBus().emit("refresh", undefined);
          });
        }
      } else {
        currentAccountId.value = "";
        currentSite.value = "";
        loggedIn.value = false;
        currentUser.value = null;

        userMap.value = {};
        currentRdpClientOption.value = {};
        currentConnectionInfoMap.value = {};
        currentConnectionPreferenceMap.value = {};
        currentOrganizations.value = [];

        nextTick(() => {
          useEventBus().emit("clearAssets", undefined);
        });
      }
    };

    /**
     * @description 设置当前账号
     * @param accountId
     */
    const setCurrentAccount = (accountId: string) => {
      const userData = getUserData(accountId);

      if (userData) {
        currentAccountId.value = accountId;
        currentSite.value = userData.site;
        currentUser.value = userData as SiteUserData;
        currentOrganizations.value = (userData as SiteUserData).availableOrgs || [];
        syncApiSession(accountId, userData);

        // 同步当前站点的连接信息映射、偏好映射以及 RDP 客户端选项
        currentConnectionInfoMap.value = (userData as SiteUserData).connectionInfoMap || {};
        currentConnectionPreferenceMap.value = (userData as SiteUserData).connectionPreferenceMap || {};
        currentRdpClientOption.value = (userData as SiteUserData).rdpClientOption || {};
      } else {
        currentConnectionInfoMap.value = {};
        currentConnectionPreferenceMap.value = {};
        currentRdpClientOption.value = {};
      }
    };

    /**
     * @description 设置当前组织列表
     * @param orgs
     */
    const setOrganizations = (orgs: PermOrgItem[]) => {
      currentOrganizations.value = orgs;

      if (currentUser.value && currentAccountId.value) {
        const updatedUserData = {
          ...currentUser.value,
          availableOrgs: orgs
        };

        userMap.value[currentAccountId.value] = updatedUserData as SiteUserData;
        currentUser.value = updatedUserData;
      }
    };

    /**
     * @description 设置当前组织
     * @param org
     */
    const setCurrentOrg = (org: PermOrgItem) => {
      if (!currentUser.value || !currentAccountId.value) {
        console.error("No current user or site when setting organization");
        return;
      }

      const updatedUserData = {
        ...currentUser.value,
        org
      };

      currentUser.value = updatedUserData as UserData;
      userMap.value[currentAccountId.value] = updatedUserData as SiteUserData;

      if (isTauriRuntime()) {
        void useTauriCoreInvoke("set_api_org", {
          orgId: org.id
        }).catch((error) => {
          console.error("sync api org failed", error);
        });
      } else {
        setWebOrgId(org.id);
      }
    };

    /**
     * @description 设置用户连接信息
     * @param connectionInfo
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
     */
    const getConnectionInfoForAsset = (assetId: string) => {
      if (!currentAccountId.value) return null;

      const siteData = userMap.value[currentAccountId.value];
      return siteData?.connectionInfoMap?.[assetId] || null;
    };

    /**
     * @description 获取资产连接偏好
     * @param assetId 资产 ID
     */
    const getConnectionPreferenceForAsset = (assetId: string) => {
      if (!currentAccountId.value) return null;

      const siteData = userMap.value[currentAccountId.value];
      return siteData?.connectionPreferenceMap?.[assetId] || null;
    };

    /**
     * @description 获取协议连接偏好
     * @param protocol 协议名称
     */
    const getConnectionPreferenceForProtocol = (protocol: string) => {
      if (!currentAccountId.value || !protocol) return null;

      const siteData = userMap.value[currentAccountId.value];
      return siteData?.protocolConnectionPreferenceMap?.[protocol.toLowerCase()] || null;
    };

    /**
     * @description 设置资产连接信息
     * @param assetId
     * @param connectionInfo
     */
    const setConnectionInfoForAsset = (assetId: string, connectionInfo: ConnectionInfo) => {
      if (!currentAccountId.value) return;
      const accountId = currentAccountId.value;
      const siteData = userMap.value[accountId];

      if (!siteData) return;

      if (!siteData.connectionInfoMap) {
        siteData.connectionInfoMap = {};
      }

      const existing = siteData.connectionInfoMap[assetId];
      const incomingProtocols = (connectionInfo.availableProtocols || [])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0);

      const mergedProtocols =
        incomingProtocols.length > 0 ? Array.from(new Set(incomingProtocols)) : existing?.availableProtocols;

      siteData.connectionInfoMap[assetId] = {
        ...(existing || {}),
        ...connectionInfo,
        ...(mergedProtocols && mergedProtocols.length > 0 ? { availableProtocols: mergedProtocols } : {})
      };

      currentConnectionInfoMap.value = { ...siteData.connectionInfoMap };
    };

    /**
     * @description 删除资产连接信息
     * @param assetId
     */
    const deleteConnectionInfoForAsset = (assetId: string) => {
      if (!currentAccountId.value) return;
      const siteData = userMap.value[currentAccountId.value];

      if (!siteData?.connectionInfoMap?.[assetId]) return;

      delete siteData.connectionInfoMap[assetId];
      currentConnectionInfoMap.value = { ...siteData.connectionInfoMap };
    };

    /**
     * @description 设置资产连接偏好
     * @param assetId
     * @param preference
     */
    const setConnectionPreferenceForAsset = (assetId: string, preference: ConnectionPreferenceInfo) => {
      if (!currentAccountId.value) return;
      const accountId = currentAccountId.value;
      const siteData = userMap.value[accountId];

      if (!siteData) return;

      if (!siteData.connectionPreferenceMap) {
        siteData.connectionPreferenceMap = {};
      }

      const existing = siteData.connectionPreferenceMap[assetId];
      const incomingProtocols = (preference.availableProtocols || [])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0);

      const mergedProtocols =
        incomingProtocols.length > 0 ? Array.from(new Set(incomingProtocols)) : existing?.availableProtocols;

      siteData.connectionPreferenceMap[assetId] = {
        ...(existing || {}),
        ...preference,
        ...(mergedProtocols && mergedProtocols.length > 0 ? { availableProtocols: mergedProtocols } : {})
      };

      currentConnectionPreferenceMap.value = { ...siteData.connectionPreferenceMap };
    };

    /**
     * @description 设置协议连接偏好
     * @param protocol 协议名称
     * @param preference 连接偏好
     */
    const setConnectionPreferenceForProtocol = (protocol: string, preference: ProtocolConnectionPreferenceInfo) => {
      if (!currentAccountId.value || !protocol || !preference.connectMethod) return;
      const siteData = userMap.value[currentAccountId.value];

      if (!siteData) return;

      if (!siteData.protocolConnectionPreferenceMap) {
        siteData.protocolConnectionPreferenceMap = {};
      }

      siteData.protocolConnectionPreferenceMap[protocol.toLowerCase()] = preference;
    };

    /**
     * @description 设置 RDP 客户端选项
     * @param rdpClientOption
     */
    const setRdpClientOption = (rdpClientOption: RdpGraphics) => {
      currentRdpClientOption.value = rdpClientOption;

      // 同步到当前站点的用户数据中，便于持久化/切换站点后恢复
      if (currentAccountId.value && userMap.value[currentAccountId.value]) {
        const accountId = currentAccountId.value;
        const siteData = userMap.value[accountId] as SiteUserData;

        userMap.value[accountId] = {
          ...siteData,
          rdpClientOption
        } as SiteUserData;
      }
    };

    return {
      orgId,
      userMap,
      loggedIn,
      currentAccountId,
      currentSite,
      currentUser,
      currentOrganizations,
      currentRdpClientOption,
      currentConnectionInfoMap,
      currentConnectionPreferenceMap,

      setUserData,
      getUserData,
      setCurrentOrg,
      setCurrentAccount,
      deleteUserData,
      setUserLoggedIn,
      setOrganizations,
      setRdpClientOption,
      setConnectionInfoToUser,
      getConnectionInfoForAsset,
      setConnectionInfoForAsset,
      deleteConnectionInfoForAsset,
      getConnectionPreferenceForAsset,
      setConnectionPreferenceForAsset,
      getConnectionPreferenceForProtocol,
      setConnectionPreferenceForProtocol
    };
  },
  {
    persist: {
      key: "userInfoV2",
      storage: localStorage,
      pick: [
        "userMap",
        "loggedIn",
        "currentUser",
        "currentAccountId",
        "currentSite",
        "currentOrganizations",
        "currentRdpClientOption",
        "currentConnectionInfoMap",
        "currentConnectionPreferenceMap"
      ]
    }
  }
);
