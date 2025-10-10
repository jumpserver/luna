<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActionItem,
  PermissionOrgs,
  PermOrgItem,
  UserIntiInfo
} from "~/types/index";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { useUserSettingStore } from "~/store/modules/userSetting";

const { t } = useI18n();
const toast = useToast();
const appConfig = useAppConfig();
const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setCollapse } = userSettingStore;
const { theme, collapse, layouts, sort } = storeToRefs(userSettingStore);

const {
  setUserLoggedIn,
  setUserData,
  setOrganizations,
  setCurrentOrg
} = userInfoStore;

const { loggedIn, currentOrganizations, currentUser }
  = storeToRefs(userInfoStore);

const inputSite = ref("");
const currentOrg = ref<string>("");
const subscribeErrorPageEvent = ref<UnlistenFn | null>(null);
const subscribeLoginSuccessEvent = ref<UnlistenFn | null>(null);
const subscribeLoginFailedEvent = ref<UnlistenFn | null>(null);
const subscribeLoginFailedTimeoutEvent = ref<UnlistenFn | null>(null);
const normalizedInputSite = computed(() => normalizeSite(inputSite.value));
const organizationItems = computed(() =>
  currentOrganizations.value.map((org: PermOrgItem) => org.name)
);

// 从 Operation 组件移动过来的按钮操作逻辑
const actionItems = computed<ActionItem[]>(() => [
  {
    key: "refresh",
    type: "action",
    iconName: "i-lucide-refresh-ccw",
    tooltipLabel: t("ToolTips.Refresh"),
    onClick: () => {
      useEventBus().emit("refresh", undefined);
    }
  },
  {
    key: "sort",
    type: "select",
    iconName: "i-lucide-arrow-down-wide-narrow",
    tooltipLabel: t("ToolTips.Sort"),
    selectItems: [
      {
        icon: "i-lucide-arrow-down-a-z",
        label: t("Sort.A-z"),
        value: "name",
        type: "checkbox" as const,
        checked: sort.value === "name",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("name");
          }
        }
      },
      {
        icon: "i-lucide-arrow-up-z-a",
        label: t("Sort.Z-A"),
        value: "-name",
        type: "checkbox" as const,
        checked: sort.value === "-name",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("-name");
          }
        }
      },
      {
        type: "separator" as const
      },
      {
        icon: "i-lucide-calendar-arrow-down",
        label: t("Sort.NewestToOldest"),
        value: "-date_updated",
        type: "checkbox" as const,
        checked: sort.value === "-date_updated",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("-date_updated");
          }
        }
      },
      {
        icon: "i-lucide-calendar-arrow-up",
        label: t("Sort.OldestToNewest"),
        value: "date_updated",
        type: "checkbox" as const,
        checked: sort.value === "date_updated",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("date_updated");
          }
        }
      }
    ] as DropdownMenuItem[]
  },
  {
    key: "layout",
    type: "select",
    iconName: "i-lucide-layout-grid",
    tooltipLabel: t("ToolTips.Layout"),
    selectItems: [
      {
        icon: "i-lucide-grid-2x2",
        label: t("Layout.Grid"),
        value: "grid",
        type: "checkbox" as const,
        checked: layouts.value === "grid",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setLayouts("grid");
          }
        }
      },
      {
        icon: "i-lucide-table-of-contents",
        label: t("Layout.Table"),
        value: "table",
        type: "checkbox" as const,
        checked: layouts.value === "table",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setLayouts("table");
          }
        }
      }
    ] as DropdownMenuItem[]
  },
  {
    key: "settings",
    type: "action",
    iconName: "i-lucide-settings",
    tooltipLabel: t("ToolTips.Settings"),
    onClick: () => {
      // eslint-disable-next-line no-new
      new useTauriWebviewWindowWebviewWindow("secondary", {
        title: t("Common.ConnectionSettings"),
        url: "/setting",
        minWidth: 760,
        minHeight: 520,
        hiddenTitle: true,
        titleBarStyle: "overlay",
        trafficLightPosition: new LogicalPosition(10, 22)
      });
    }
  }
]);

// watch(() => openModal.value, (open) => {
//   // 如果关闭,清空搜索框的内容
//   if (!open) {
//     inputSite.value = '';
//   }
// });

/**
 * @description 标准化站点输入：去除首尾空格 + 去除末尾斜杠
 * @param value
 */
function normalizeSite(value: string): string {
  const s = (value || "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

/**
 * @description 切换折叠状态
 */
const handleCollapse = () => {
  setCollapse(!collapse.value);
};

/**
 * @description 窗口拖拽
 * @param event 鼠标事件
 */
const handleWindowDrag = async (event: MouseEvent) => {
  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();
    windows.forEach((window) => {
      window.startDragging();
    });
  } catch (error) {
    console.error(error);
  }
};

/**
 * @description 初始化可选组织
 * @param permissionOrgData
 * @returns 返回去重后的组织列表
 */
const initSelectOrganization = (permissionOrgData: PermissionOrgs) => {
  // permissionOrgData 中 pam_orgs, audit_orgs, console_orgs, workbench_orgs 都有可能存在,所以只需要获取他们的并集即可
  const orgs = [
    ...(permissionOrgData.pam_orgs || []),
    ...(permissionOrgData.audit_orgs || []),
    ...(permissionOrgData.console_orgs || []),
    ...(permissionOrgData.workbench_orgs || [])
  ];

  // 去除重复项
  const uniqueOrgs = orgs.filter(
    (org, index, self) => index === self.findIndex((t) => t.id === org.id)
  );

  return uniqueOrgs;
};

/**
 * @description 切换组织
 * @param org
 */
const handleOrgChange = (org: string) => {
  const orgData = currentOrganizations.value.find(
    (o: PermOrgItem) => o.name === org
  );

  if (orgData) {
    setCurrentOrg(orgData);

    nextTick(() => {
      useEventBus().emit("refresh", undefined);
    });
  }
};

/**
 * @description 监听登录成功事件
 */
const listenTauriEvent = async () => {
  // TODO 放到一个 composable 中
  subscribeLoginSuccessEvent.value = await useTauriEventListen(
    "login-success-detected",
    (event) => {
      const { status, profile, permission_orgs, current_org, cookies }
        = event.payload as UserIntiInfo;

      const profileData = JSON.parse(profile.data);
      const permissionOrgData = JSON.parse(permission_orgs.data);
      const currentOrgData = JSON.parse(current_org.data);
      const normalizedSite = normalizedInputSite.value;

      if (status === "success" && profileData) {
        toast.add({
          title: t("Login.LoginSuccess"),
          description: t("Login.LoginSuccessDescription"),
          color: "success",
          icon: "line-md:check-all"
        });

        const availableOrgs = initSelectOrganization(permissionOrgData);

        setUserData(normalizedSite, {
          name: profileData.name,
          headerJson: cookies,
          site: normalizedSite,
          org: currentOrgData,
          system_roles: profileData.system_roles,
          availableOrgs,
          connectionInfo: {
            protocol: "",
            username: ""
          }
        });

        currentOrg.value = currentOrgData.name;
        setOrganizations(availableOrgs);
        setUserLoggedIn(true);

        nextTick(() => {
          useEventBus().emit("refresh", undefined);
        });
      }
    }
  );

  subscribeLoginFailedEvent.value = await useTauriEventListen(
    "login-failed-detected",
    () => {
      toast.add({
        title: t("Login.LoginFailed"),
        description: t("Login.LoginFailedDescription"),
        color: "error",
        icon: "line-md:close-circle"
      });

      setUserLoggedIn(false);
    }
  );

  subscribeErrorPageEvent.value = await useTauriEventListen(
    "error-page",
    (event) => {
      const { status, reason } = event.payload as {
        status: string
        reason: string
      };

      if (status === "failure" && reason === "cookies-not-found") {
        toast.add({
          title: t("Login.LoginFailed"),
          description: t("Login.LoginFailedErrorPage"),
          color: "error",
          icon: "line-md:close-circle"
        });

        nextTick(() => {
          setUserLoggedIn(false);
        });
      }
    }
  );

  subscribeLoginFailedTimeoutEvent.value = await useTauriEventListen(
    "login-failed-timeout",
    (_event) => {
      toast.add({
        title: t("Login.LoginFailed"),
        description: t("Login.LoginFailedTimeout"),
        color: "error",
        icon: "line-md:close-circle"
      });

      nextTick(() => {
        setUserLoggedIn(false);
      });
    }
  );
};

const unListenTauriEvent = () => {
  if (subscribeLoginSuccessEvent.value) {
    subscribeLoginSuccessEvent.value();
  }

  if (subscribeLoginFailedEvent.value) {
    subscribeLoginFailedEvent.value();
  }

  if (subscribeErrorPageEvent.value) {
    subscribeErrorPageEvent.value();
  }

  if (subscribeLoginFailedTimeoutEvent.value) {
    subscribeLoginFailedTimeoutEvent.value();
  }
};

onMounted(async () => {
  if (loggedIn.value && userInfoStore.currentUser) {
    currentOrg.value = userInfoStore.currentUser.org.name;
    // 确保 orgId 也被正确设置
    if (userInfoStore.currentUser.org?.id) {
      userInfoStore.orgId = userInfoStore.currentUser.org.id;
    }
  }

  await listenTauriEvent();
});

watch(
  () => currentUser.value?.org?.name,
  (name: string | undefined) => {
    if (name) currentOrg.value = name;
  }
);

onBeforeUnmount(() => {
  unListenTauriEvent();
});
</script>

<template>
	<div
		:style="{
			backgroundColor: theme === 'dark' ? darkColor : lightColor
		}"
		class="flex items-center justify-between px-4 h-14"
		@mousedown="handleWindowDrag"
	>
		<section class="flex items-center h-full">
			<UIcon
				v-show="collapse"
				name="i-lucide-panel-left-open"
				class="size-5 cursor-pointer hover:text-[#55B787]"
				@click="handleCollapse"
			/>

			<div v-show="loggedIn">
				<USelect
					v-model="currentOrg"
					:items="organizationItems"
					:style="{
						marginLeft: collapse ? '0.625rem' : ''
					}"
					:ui="{
						trailingIcon:
							'group-data-[state=open]:rotate-180 transition-transform duration-200'
					}"
					variant="subtle"
					size="md"
					class="w-56"
					icon="fluent:organization-16-regular"
					@update:model-value="handleOrgChange"
				/>
			</div>
		</section>

		<section class="flex items-center h-full gap-3 mr-2">
			<template v-for="action of actionItems" :key="action.iconName">
				<template v-if="action.type === 'action'">
					<UButton
						:icon="action.iconName"
						size="sm"
						variant="ghost"
						class="rounded-lg light:hover:bg-[var(--bg-hover-light)] dark:hover:bg-[var(--bg-hover-dark)] transition-colors duration-200"
						@click="action.onClick"
					/>
				</template>

				<template v-else>
					<UDropdownMenu arrow :items="action.selectItems" size="sm">
						<UButton
							:icon="action.iconName"
							size="sm"
							variant="ghost"
							class="rounded-lg light:hover:bg-[var(--bg-hover-light)] dark:hover:bg-[var(--bg-hover-dark)] transition-colors duration-200"
						/>
					</UDropdownMenu>
				</template>
			</template>
		</section>
	</div>
</template>
