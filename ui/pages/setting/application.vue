<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { getConfiguredAppName, isDefaultAppName } from "~/composables/useAppName";

const props = defineProps<{
  embedded?: boolean;
}>();

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const localePath = useLocalePath();
const { activeApplicationProtocol } = useSettingsWindow();
const HIDDEN_DATABASE_PROTOCOLS = new Set(["mongodb", "oracle"]);
const appName = getConfiguredAppName();

const protocolComponents = {
  ssh: defineAsyncComponent(() => import("~/pages/setting/application/ssh.vue")),
  telnet: defineAsyncComponent(() => import("~/pages/setting/application/telnet.vue")),
  sftp: defineAsyncComponent(() => import("~/pages/setting/application/sftp.vue")),
  rdp: defineAsyncComponent(() => import("~/pages/setting/application/rdp.vue")),
  vnc: defineAsyncComponent(() => import("~/pages/setting/application/vnc.vue")),
  mysql: defineAsyncComponent(() => import("~/pages/setting/application/mysql.vue")),
  mariadb: defineAsyncComponent(() => import("~/pages/setting/application/mariadb.vue")),
  mongodb: defineAsyncComponent(() => import("~/pages/setting/application/mongodb.vue")),
  redis: defineAsyncComponent(() => import("~/pages/setting/application/redis.vue")),
  pg: defineAsyncComponent(() => import("~/pages/setting/application/pg.vue")),
  oracle: defineAsyncComponent(() => import("~/pages/setting/application/oracle.vue")),
  sqlserver: defineAsyncComponent(() => import("~/pages/setting/application/sqlserver.vue"))
} as const;

type ApplicationProtocol = keyof typeof protocolComponents;

const protocolItem = (label: string, protocol: ApplicationProtocol, routeName: string): NavigationMenuItem => {
  if (!props.embedded) {
    return {
      label,
      to: localePath({ name: routeName })
    };
  }

  return {
    label,
    active: activeApplicationProtocol.value === protocol,
    onSelect: () => {
      activeApplicationProtocol.value = protocol;
    }
  };
};

const appMenu = computed<NavigationMenuItem[]>(() => {
  const databaseChildren = [
    { label: "MySQL", protocol: "mysql" as const, routeName: "setting-application-mysql" },
    { label: "MariaDB", protocol: "mariadb" as const, routeName: "setting-application-mariadb" },
    { label: "MongoDB", protocol: "mongodb" as const, routeName: "setting-application-mongodb" },
    { label: "Redis", protocol: "redis" as const, routeName: "setting-application-redis" },
    { label: "PostgreSQL", protocol: "pg" as const, routeName: "setting-application-pg" },
    { label: "Oracle", protocol: "oracle" as const, routeName: "setting-application-oracle" },
    { label: "SQL Server", protocol: "sqlserver" as const, routeName: "setting-application-sqlserver" }
  ]
    .filter((item) => isDefaultAppName(appName) || !HIDDEN_DATABASE_PROTOCOLS.has(item.protocol))
    .map((item) => protocolItem(item.label, item.protocol, item.routeName));

  return [
    {
      label: t("Setting.CommandTerminal"),
      defaultOpen: true,
      icon: "proicons:terminal",
      children: [
        protocolItem("SSH", "ssh", "setting-application-ssh"),
        protocolItem("Telnet", "telnet", "setting-application-telnet")
      ]
    },
    {
      label: t("Setting.FileTransfer"),
      defaultOpen: true,
      icon: "proicons:document",
      children: [protocolItem("SFTP", "sftp", "setting-application-sftp")]
    },
    {
      label: t("Setting.RemoteDesktop"),
      defaultOpen: true,
      icon: "proicons:laptop",
      children: [
        protocolItem("RDP", "rdp", "setting-application-rdp"),
        protocolItem("VNC", "vnc", "setting-application-vnc")
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

const activeProtocolComponent = computed(() => {
  const protocol = activeApplicationProtocol.value as ApplicationProtocol;
  return protocolComponents[protocol] || protocolComponents.ssh;
});
</script>

<template>
  <div class="flex min-h-[480px]">
    <div class="menu setting-menu w-52 shrink-0">
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

    <div class="min-w-0 flex-1 border-l border-[var(--app-border)] p-3">
      <KeepAlive v-if="embedded">
        <component :is="activeProtocolComponent" />
      </KeepAlive>
      <NuxtPage v-else />
    </div>
  </div>
</template>
