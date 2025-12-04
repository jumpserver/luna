<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

definePageMeta({
  layout: "setting"
});

const { t, locale } = useI18n();
const localePath = useLocalePath();

const appMenu = computed<NavigationMenuItem[]>(() => {
  void locale.value;

  return [
    {
      label: t("Setting.CommandTerminal"),
      defaultOpen: true,
      icon: "proicons:terminal",
      children: [
        {
          label: "SSH",
          to: localePath({ path: "/setting/application/ssh" })
        },
        {
          label: "Telnet",
          to: localePath({ path: "/setting/application/telnet" })
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
          to: localePath({ path: "/setting/application/sftp" })
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
          to: localePath({ path: "/setting/application/rdp" })
        },
        {
          label: "VNC",
          to: localePath({ path: "/setting/application/vnc" })
        }
      ]
    },
    {
      label: t("Setting.Database"),
      defaultOpen: true,
      icon: "proicons:database",
      children: [
        {
          label: "MySQL",
          to: localePath({ path: "/setting/application/mysql" })
        },
        {
          label: "MariaDB",
          to: localePath({ path: "/setting/application/mariadb" })
        },
        {
          label: "MongoDB",
          to: localePath({ path: "/setting/application/mongodb" })
        },
        {
          label: "Redis",
          to: localePath({ path: "/setting/application/redis" })
        },
        {
          label: "PostgreSQL",
          to: localePath({ path: "/setting/application/pg" })
        },
        {
          label: "Oracle",
          to: localePath({ path: "/setting/application/oracle" })
        },
        {
          label: "SQL Server",
          to: localePath({ path: "/setting/application/sqlserver" })
        }
      ]
    }
  ];
});
</script>

<template>
  <div class="flex h-full">
    <UNavigationMenu
      :items="appMenu"
      :highlight="false"
      :ui="{ list: 'p-2', link: 'px-1', linkTrailing: 'hidden', linkTrailingIcon: 'hidden' }"
      orientation="vertical"
      variant="pill"
      color="primary"
      class="w-52"
    />

    <UCard class="flex-1 min-w-0 h-full rounded-none overflow-y-auto" variant="subtle" :ui="{ body: 'sm:p-3 h-full' }">
      <NuxtPage />
    </UCard>
  </div>
</template>
