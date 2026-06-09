<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { getConfiguredAppName, isDefaultAppName } from "~/composables/useAppName";

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const localePath = useLocalePath();
const HIDDEN_DATABASE_PROTOCOLS = new Set(["mongodb", "oracle"]);
const appName = getConfiguredAppName();

const appMenu = computed<NavigationMenuItem[]>(() => {
  const databaseChildren = [
    {
      label: "MySQL",
      to: localePath({ name: "setting-application-mysql" }),
      protocol: "mysql"
    },
    {
      label: "MariaDB",
      to: localePath({ name: "setting-application-mariadb" }),
      protocol: "mariadb"
    },
    {
      label: "MongoDB",
      to: localePath({ name: "setting-application-mongodb" }),
      protocol: "mongodb"
    },
    {
      label: "Redis",
      to: localePath({ name: "setting-application-redis" }),
      protocol: "redis"
    },
    {
      label: "PostgreSQL",
      to: localePath({ name: "setting-application-pg" }),
      protocol: "postgresql"
    },
    {
      label: "Oracle",
      to: localePath({ name: "setting-application-oracle" }),
      protocol: "oracle"
    },
    {
      label: "SQL Server",
      to: localePath({ name: "setting-application-sqlserver" }),
      protocol: "sqlserver"
    }
  ].filter((item) => isDefaultAppName(appName) || !HIDDEN_DATABASE_PROTOCOLS.has(item.protocol));

  return [
    {
      label: t("Setting.CommandTerminal"),
      defaultOpen: true,
      icon: "proicons:terminal",
      children: [
        {
          label: "SSH",
          to: localePath({ name: "setting-application-ssh" })
        },
        {
          label: "Telnet",
          to: localePath({ name: "setting-application-telnet" })
        }
      ]
    },
    {
      label: t("Setting.FileTransfer"),
      defaultOpen: true,
      icon: "proicons:document",
      children: [
        {
          label: "SFTP",
          to: localePath({ name: "setting-application-sftp" })
        }
      ]
    },
    {
      label: t("Setting.RemoteDesktop"),
      defaultOpen: true,
      icon: "proicons:laptop",
      children: [
        {
          label: "RDP",
          to: localePath({ name: "setting-application-rdp" })
        },
        {
          label: "VNC",
          to: localePath({ name: "setting-application-vnc" })
        }
      ]
    },
    {
      label: t("Setting.Database"),
      defaultOpen: true,
      icon: "proicons:database",
      children: databaseChildren
    }
  ];
});
</script>

<template>
  <div class="flex h-full">
    <div class="menu setting-menu shrink-0">
      <UNavigationMenu
        :items="appMenu"
        :highlight="false"
        :ui="{
          list: 'p-2',
          link: 'px-2 my-1 rounded-sm menu-item flex items-center light:text-gray-800 dark:text-gray-200',
          linkLeadingIcon: 'light:text-gray-800 dark:text-gray-200',
          linkTrailing: 'hidden',
          linkTrailingIcon: 'hidden'
        }"
        orientation="vertical"
        color="neutral"
        class="w-52"
      />
    </div>

    <UCard class="flex-1 min-w-0 h-full rounded-none overflow-y-auto" variant="subtle" :ui="{ body: 'sm:p-3 h-full' }">
      <NuxtPage />
    </UCard>
  </div>
</template>
