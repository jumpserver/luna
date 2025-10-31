<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserSettingStore } from "~/store/modules/userSetting";

const { t } = useI18n();
const userSettingStore = useUserSettingStore();

const { theme } = storeToRefs(userSettingStore);

const items = ref<NavigationMenuItem[][]>([[]]);

const settingMenu = ref<NavigationMenuItem[]>([
  {
    label: "通用",
    icon: "solar:settings-linear",
    to: "/setting/general"
  },
  {
    label: "外观",
    icon: "solar:palette-linear",
    to: "/setting/appearance"
  },
  {
    label: "应用配置",
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
            to: "/setting/ssh"
          },
          {
            label: "Telnet",
            to: "/setting/telnet"
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
            to: "/setting/sftp"
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
            to: "/setting/rdp"
          },
          {
            label: "VNC",
            to: "/setting/vnc"
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
            to: "/setting/mysql"
          },
          {
            label: "MongoDB",
            to: "/setting/mongodb"
          },
          {
            label: "Redis",
            to: "/setting/redis"
          },
          {
            label: "PostgreSQL",
            to: "/setting/pg"
          },
          {
            label: "Oracle",
            to: "/setting/oracle"
          },
          {
            label: "SQL Server",
            to: "/setting/sqlserver"
          }
        ]
      }
    ]
  }
]);
</script>

<template>
  <!-- <UCard
    variant="soft"
    :style="{
      backgroundColor: theme === 'dark' ? '#201F22' : '#F5F5F5'
    }"
    :ui="{
      header: 'p-0',
      body: 'p-0 sm:p-2 '
    }"
  >
    <template #header>
      <div class="flex items-center justify-center h-10" @mousedown="handleWindowDrag">
        <span class="text-sm font-bold">
          {{ t("Common.ConnectionSettings") }}
        </span>
      </div>
    </template>

    <template #default>
      <div class="flex gap-1 w-full">
        <UNavigationMenu
          :items="items"
          :highlight="false"
          color="primary"
          variant="link"
          orientation="vertical"
          class="w-48"
        />

        <UCard class="flex-1" variant="soft">
          <slot />
        </UCard>
      </div>
    </template>
  </UCard> -->

  <UPage
    class="h-screen"
    :style="{
      backgroundColor: theme === 'dark' ? '#201F22' : '#F5F5F5'
    }"
  >
    <UPageHeader
      :ui="{
        root: 'py-2.5'
      }"
    >
      <template #default>
        <div
          data-tauri-drag-region
          class="flex items-center justify-center select-none cursor-default"
        >
          <p class="text-sm font-bold pointer-events-none">
            {{ t("Common.ConnectionSettings") }}
          </p>
        </div>
      </template>
    </UPageHeader>

    <UPageBody class="mt-2 mx-2">
      <div class="flex gap-1 w-full">
        <UNavigationMenu
          :items="settingMenu"
          :highlight="true"
          color="primary"
          variant="link"
          orientation="vertical"
          class="w-48"
        />

        <USeparator orientation="vertical" class="h-48" />

        <UCard class="flex-1" variant="subtle">
          <slot />
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>
