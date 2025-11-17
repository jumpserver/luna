import type { ConnectionInfo, PermOrgItem, RdpGraphics, UserData, LangType } from "~/types/index";

export type SiteUserData = UserData & {
  language?: string;
  rdpClientOption?: RdpGraphics;
  connectionInfoMap?: Record<string, ConnectionInfo>;
};

// 其实应该叫做 accountInfoStore 比较好
export const useUserInfoStore = defineStore(
  "userInfo",
  () => {
    const { setLocale } = useI18n();
    const settingManager = useSettingManager();
    const {
      setLang,
      setLangGlobal,
      setSiteLanguage,
      removeSiteLanguage,
      getSiteLanguage,
      getDefaultLanguage,
      hasSiteLanguage
    } = settingManager;

    const orgId = ref("");
    const currentSite = ref("");
    const loggedIn = ref(false);

    const currentLanguage = ref<LangType>("zh");
    const currentUser = ref<UserData | null>(null);
    const currentOrganizations = ref<PermOrgItem[]>([]);
    const userMap = ref<Record<string, SiteUserData>>({});
    const currentRdpClientOption = ref<RdpGraphics>({});
    const currentConnectionInfoMap = ref<Record<string, ConnectionInfo>>({});

    const hasUser = computed(() => Object.keys(userMap.value).length > 0);

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
    const setUserData = (site: string, userData: UserData & { language?: LangType }) => {
      const baseLang = userData.language;

      setSiteLanguage(site, baseLang);

      const withLanguage = {
        ...(userData as SiteUserData),
        language: baseLang
      } as SiteUserData;

      userMap.value[site] = withLanguage;
      currentUser.value = withLanguage;
      currentSite.value = site;
      currentLanguage.value = baseLang;

      setLocale(baseLang);

      // 设置组织 ID
      if (userData.org?.id) {
        orgId.value = userData.org.id;
      }

      // 初始化当前站点连接信息映射以及 RDP 客户端选项
      currentConnectionInfoMap.value = withLanguage.connectionInfoMap || {};
      currentRdpClientOption.value = withLanguage.rdpClientOption || {};
    };

    /**
     * @description 删除用户数据
     * @param site
     */
    const deleteUserData = (site: string) => {
      // 退出当前站点时立即请求清理其 Cookie
      useTauriCoreInvoke("logout", {
        name: "main",
        origin: site
      });

      if (!(site in userMap.value)) {
        return;
      }

      const removedLang = userMap.value[site]?.language as LangType;

      delete userMap.value[site];

      removeSiteLanguage(site);

      // 如果还有用户，则切换到下一个用户
      if (hasUser.value) {
        const nextUser = Object.values(userMap.value)[0] as SiteUserData | undefined;

        if (nextUser) {
          const siteLang = getSiteLanguage(nextUser.site);

          const nextWithLang = {
            ...nextUser,
            language: siteLang
          } as SiteUserData;

          userMap.value[nextUser.site] = nextWithLang;
          currentUser.value = nextWithLang;
          currentSite.value = nextUser.site;
          currentLanguage.value = siteLang;

          setLocale(siteLang as any);

          // 更新组织 ID
          if (nextWithLang.org?.id) {
            orgId.value = nextWithLang.org.id;
          }

          // 同步连接信息映射以及 RDP 客户端选项
          currentConnectionInfoMap.value = nextWithLang.connectionInfoMap || {};
          currentRdpClientOption.value = nextWithLang.rdpClientOption || {};
          currentOrganizations.value = nextWithLang.availableOrgs || [];

          loggedIn.value = true;

          nextTick(() => {
            useEventBus().emit("refresh", undefined);
          });
        }
      } else {
        orgId.value = "";
        currentSite.value = "";
        loggedIn.value = false;
        currentUser.value = null;

        // 将最后一个登出用户的语言持久化为默认语言
        setLang(removedLang);
        setLocale(removedLang);
        currentLanguage.value = removedLang;

        userMap.value = {};
        currentRdpClientOption.value = {};
        currentConnectionInfoMap.value = {};
        currentOrganizations.value = [];

        nextTick(() => {
          useEventBus().emit("clearAssets", undefined);
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
        const siteLang = getSiteLanguage(site);

        const withLang = {
          ...(userData as SiteUserData),
          language: siteLang
        } as SiteUserData;

        userMap.value[site] = withLang;
        currentUser.value = withLang;
        currentOrganizations.value = withLang.availableOrgs || [];
        currentLanguage.value = siteLang;

        setLocale(siteLang as any);

        if (userData.org?.id) {
          orgId.value = userData.org.id;
        }

        // 同步当前站点的连接信息映射以及 RDP 客户端选项
        currentConnectionInfoMap.value = withLang.connectionInfoMap || {};
        currentRdpClientOption.value = withLang.rdpClientOption || {};
      } else {
        const fallbackLang = currentLanguage.value;

        currentConnectionInfoMap.value = {};
        currentRdpClientOption.value = {};
        currentLanguage.value = fallbackLang;

        setLocale(fallbackLang as any);
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
          availableOrgs: orgs
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
        console.error("No current user or site when setting organization");
        return;
      }

      const updatedUserData = {
        ...currentUser.value,
        org
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

      currentUser.value.connectionInfo = connectionInfo;
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
    const setConnectionInfoForAsset = (assetId: string, connectionInfo: ConnectionInfo) => {
      if (!currentSite.value) return;
      const site = currentSite.value;
      const siteData = userMap.value[site];

      if (!siteData) return;

      if (!siteData.connectionInfoMap) {
        siteData.connectionInfoMap = {};
      }

      const existing = siteData.connectionInfoMap[assetId];
      const incomingProtocols = (connectionInfo.availableProtocols || [])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0);
        
      const mergedProtocols =
        incomingProtocols.length > 0
          ? Array.from(new Set(incomingProtocols))
          : existing?.availableProtocols;

      siteData.connectionInfoMap[assetId] = {
        ...(existing || {}),
        ...connectionInfo,
        ...(mergedProtocols && mergedProtocols.length > 0 ? { availableProtocols: mergedProtocols } : {})
      };

      currentConnectionInfoMap.value = { ...siteData.connectionInfoMap };
    };

    const applyLanguageToAll = (lang: LangType) => {
      const target = lang;

      // 判断是否真的需要变更
      const sites = Object.keys(userMap.value);
      const hasDiffInUsers = sites.some((site) => (userMap.value[site]?.language as LangType) !== target);
      const hasDiffInManager =
        getDefaultLanguage() !== target || sites.some((site) => getSiteLanguage(site) !== target);

      if (!hasDiffInUsers && !hasDiffInManager && currentLanguage.value === target) {
        return;
      }

      // 更新 Setting Manager
      setLangGlobal(target);

      // 仅对有差异的站点进行修改
      const sitesToUpdate = sites.filter((site) => (hasSiteLanguage(site) ? getSiteLanguage(site) !== target : true));
      sitesToUpdate.forEach((site) => setSiteLanguage(site, target));

      // 4) 同步当前内存中的每个用户对象
      sites.forEach((site) => {
        const user = userMap.value[site];
        if (!user) return;
        if ((user.language as LangType) === target) return;
        userMap.value[site] = {
          ...(user as SiteUserData),
          language: target
        } as SiteUserData;
      });

      if (currentSite.value && userMap.value[currentSite.value]) {
        currentUser.value = userMap.value[currentSite.value] as SiteUserData;
      }

      currentLanguage.value = target;
      setLocale(target);
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
          rdpClientOption
        } as SiteUserData;
      }
    };

    return {
      orgId,
      userMap,
      loggedIn,
      currentSite,
      currentUser,
      currentLanguage,
      currentOrganizations,
      currentRdpClientOption,
      currentConnectionInfoMap,

      setUserData,
      getUserData,
      setCurrentOrg,
      setCurrentSite,
      deleteUserData,
      setUserLoggedIn,
      setOrganizations,
      setRdpClientOption,
      applyLanguageToAll,
      setConnectionInfoToUser,
      getConnectionInfoForAsset,
      setConnectionInfoForAsset
    };
  },
  {
    persist: {
      key: "userInfo",
      storage: localStorage,
      pick: [
        "orgId",
        "userMap",
        "loggedIn",
        "currentUser",
        "currentSite",
        "currentLanguage",
        "currentOrganizations",
        "currentRdpClientOption",
        "currentConnectionInfoMap"
      ]
    }
  }
);
