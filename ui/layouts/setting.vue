<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/store/modules/userInfo";

definePageMeta({
  layout: "setting",
  redirect: "/setting/general"
});

const localePath = useLocalePath();
const { theme } = useSettingManager();
const { t, locale, setLocale } = useI18n();

const userInfoStore = useUserInfoStore();
const { currentLanguage } = storeToRefs(userInfoStore);

const { initialTheme, listenOSThemeChange } = useThemeAdapter();

const settingMenu = computed<NavigationMenuItem[]>(() => {
  void locale.value;
  return [
    {
      label: t("Common.General"),
      icon: "solar:settings-linear",
      to: localePath({ path: "/setting/general" })
    },
    {
      label: t("Common.Appearance"),
      icon: "solar:palette-linear",
      to: localePath({ path: "/setting/appearance" })
    },
    {
      label: t("Common.ApplicationConfig"),
      defaultOpen: true,
      icon: "tabler:toggle-right",
      children: [
        {
          label: t("Setting.CommandTerminal"),
          active: false,
          defaultOpen: false,
          icon: "proicons:terminal",
          children: [
            {
              label: "SSH",
              to: localePath({ path: "/setting/ssh" })
            },
            {
              label: "Telnet",
              to: localePath({ path: "/setting/telnet" })
            }
          ]
        },
        {
          label: t("Setting.FileTransfer"),
          defaultOpen: false,
          icon: "proicons:document",
          children: [
            {
              label: "SFTP",
              to: localePath({ path: "/setting/sftp" })
            }
          ]
        },
        {
          label: t("Setting.RemoteDesktop"),
          defaultOpen: false,
          icon: "proicons:laptop",
          children: [
            {
              label: "RDP",
              to: localePath({ path: "/setting/rdp" })
            },
            {
              label: "VNC",
              to: localePath({ path: "/setting/vnc" })
            }
          ]
        },
        {
          label: t("Setting.Database"),
          defaultOpen: false,
          icon: "proicons:database",
          children: [
            {
              label: "MySQL",
              to: localePath({ path: "/setting/mysql" })
            },
            {
              label: "MariaDB",
              to: localePath({ path: "/setting/mariadb" })
            },
            {
              label: "MongoDB",
              to: localePath({ path: "/setting/mongodb" })
            },
            {
              label: "Redis",
              to: localePath({ path: "/setting/redis" })
            },
            {
              label: "PostgreSQL",
              to: localePath({ path: "/setting/pg" })
            },
            {
              label: "Oracle",
              to: localePath({ path: "/setting/oracle" })
            },
            {
              label: "SQL Server",
              to: localePath({ path: "/setting/sqlserver" })
            }
          ]
        }
      ]
    }
  ];
});

onMounted(() => {
  initialTheme();
  listenOSThemeChange();
});

watch(
  () => currentLanguage.value,
  (lang) => {
    const code = lang === "zh" ? "zh" : "en";
    setLocale(code as any);
  },
  { immediate: true }
);
</script>

<template>
  <UPage
    class="h-screen flex flex-col"
    :ui="{
      center: 'flex flex-col h-full min-h-0'
    }"
    :style="{
      backgroundColor: theme === 'dark' ? '#2C2C2C' : '#F5F5F5'
    }"
  >
    <UPageHeader
      :ui="{
        root: 'py-2.5'
      }"
    >
      <template #default>
        <div data-tauri-drag-region class="flex items-center justify-center select-none cursor-default">
          <p class="text-sm font-bold pointer-events-none">
            {{ t("Common.ConnectionSettings") }}
          </p>
        </div>
      </template>
    </UPageHeader>

    <UPageBody class="mt-2 mx-2 flex-1 min-h-0 h-full overflow-y-auto">
      <div class="flex gap-1 w-full min-h-0">
        <UNavigationMenu
          :items="settingMenu"
          :highlight="true"
          color="primary"
          variant="link"
          orientation="vertical"
          :class="locale === 'en' ? 'w-64' : 'w-48'"
        />

        <UCard class="flex-1 min-w-0 h-full overflow-y-auto" variant="subtle">
          <slot />
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>
