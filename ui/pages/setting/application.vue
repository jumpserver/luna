<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type { PluginListItem } from "~/types";
import { getConfiguredAppName, isDefaultAppName } from "~/composables/useAppName";
import { desktopConvertFileSrc, desktopDialog } from "~/shared/desktop/bridge";

const props = defineProps<{
  embedded?: boolean;
}>();

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const localePath = useLocalePath();
const { activeApplicationProtocol } = useSettingsWindow();
const { pluginList, installPlugin, uninstallPlugin } = useApplicationConfig();
const { language } = useSettingManager();
const HIDDEN_DATABASE_PROTOCOLS = new Set(["mongodb", "oracle"]);
const appName = getConfiguredAppName();
const pluginModalOpen = ref(false);
const installingPlugin = ref(false);
const uninstallingPluginId = ref("");

const protocolComponents = {
  terminal: defineAsyncComponent(() => import("~/pages/setting/application/terminal.vue")),
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
      label: t("Setting.TerminalSettings"),
      defaultOpen: true,
      icon: "proicons:terminal",
      children: [protocolItem(t("Setting.TerminalSettings"), "terminal", "setting-application-terminal")]
    },
    {
      label: t("Setting.CharacterProtocols"),
      defaultOpen: true,
      icon: "i-lucide-waypoints",
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

const pluginSummary = computed(() => {
  const total = pluginList.value.length;
  const installed = pluginList.value.filter((item) => !item.builtin).length;
  return { total, installed };
});

const pluginComment = (plugin: PluginListItem) => {
  const lang = (language.value || "en") as "zh" | "en";
  return plugin.comment?.[lang] || plugin.comment?.en || "";
};

const pluginIconSrc = (plugin: PluginListItem) => {
  if (!plugin.icon_path || !isDesktopRuntime()) return "";
  return desktopConvertFileSrc(plugin.icon_path);
};

const handlePluginUpload = async () => {
  const selected = (await desktopDialog.open({
    multiple: false,
    filters: [
      { name: "JumpServer Plugin", extensions: ["jscplugin"] },
      { name: "Zip Archive", extensions: ["zip"] }
    ]
  })) as string | null;

  if (!selected) return;

  installingPlugin.value = true;
  try {
    await installPlugin(selected);
    pluginModalOpen.value = true;
  } finally {
    installingPlugin.value = false;
  }
};

const handlePluginUninstall = async (pluginId: string) => {
  uninstallingPluginId.value = pluginId;
  try {
    await uninstallPlugin(pluginId);
  } finally {
    uninstallingPluginId.value = "";
  }
};
</script>

<template>
  <div>
    <UCard
      v-if="isDesktopRuntime()"
      variant="outline"
      class="mb-4"
      :ui="{
        root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]',
        body: 'flex flex-wrap items-center justify-between gap-3'
      }"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">{{ t("Setting.PluginManager") }}</p>
        <p class="mt-1 text-xs text-muted">
          {{ t("Setting.PluginSummary", pluginSummary) }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="primary"
          icon="i-lucide-upload"
          :loading="installingPlugin"
          :label="t('Setting.UploadPlugin')"
          @click="handlePluginUpload"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-package"
          :label="t('Setting.ManagePlugins')"
          @click="pluginModalOpen = true"
        />
      </div>
    </UCard>

    <UCard
      variant="outline"
      :ui="{
        root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]',
        body: 'flex min-h-[480px] p-0 sm:p-0'
      }"
    >
      <div class="flex w-52 shrink-0 flex-col bg-[var(--app-sidebar-bg)]">
        <UNavigationMenu
          :items="appMenu"
          :highlight="false"
          :ui="{
            list: 'p-2',
            link: 'px-2.5 my-0.5 before:rounded-lg hover:before:bg-[var(--app-hover-soft)] data-active:before:bg-[var(--app-selected-soft)]',
            linkLeadingIcon: 'text-current',
            linkTrailing: 'hidden',
            linkTrailingIcon: 'hidden'
          }"
          orientation="vertical"
          color="neutral"
          class="w-full"
        />
      </div>

      <div class="min-w-0 flex-1 border-l border-[var(--app-border)] p-4">
        <KeepAlive v-if="embedded">
          <component :is="activeProtocolComponent" />
        </KeepAlive>
        <NuxtPage v-else />
      </div>
    </UCard>

    <UModal v-model:open="pluginModalOpen" :title="t('Setting.PluginManager')" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ t("Setting.PluginUploadHint") }}
            </p>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-upload"
              :loading="installingPlugin"
              :label="t('Setting.UploadPlugin')"
              @click="handlePluginUpload"
            />
          </div>

          <div v-if="pluginList.length" class="grid gap-3 md:grid-cols-2">
            <UCard
              v-for="plugin in pluginList"
              :key="plugin.id"
              variant="outline"
              :ui="{ root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]' }"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex size-10 items-center justify-center overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-surface-panel)] p-1"
                >
                  <img
                    v-if="pluginIconSrc(plugin)"
                    :src="pluginIconSrc(plugin)"
                    :alt="plugin.display_name"
                    class="size-full object-contain"
                  />
                  <UIcon v-else name="i-lucide-package" class="text-lg text-muted" />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-sm font-medium text-highlighted">{{ plugin.display_name }}</p>
                    <UBadge size="xs" color="neutral" variant="soft">
                      {{ plugin.builtin ? t("ConnectMethodType.BuiltIn") : t("Setting.UserPlugin") }}
                    </UBadge>
                  </div>
                  <p class="mt-1 text-xs text-muted">{{ plugin.id }}</p>
                  <p v-if="plugin.version" class="text-xs text-muted">
                    {{ t("Setting.PluginVersion", { version: plugin.version }) }}
                  </p>
                  <p v-if="pluginComment(plugin)" class="mt-2 text-pretty text-xs text-muted">
                    {{ pluginComment(plugin) }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <UBadge v-for="protocol in plugin.protocols" :key="protocol" size="xs" color="info" variant="soft">
                      {{ protocol.toUpperCase() }}
                    </UBadge>
                  </div>
                </div>
              </div>

              <template #footer>
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-xs text-muted">{{ plugin.path || plugin.plugin_dir || "-" }}</span>
                  <UButton
                    v-if="!plugin.builtin"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :loading="uninstallingPluginId === plugin.id"
                    :label="t('Setting.UninstallPlugin')"
                    @click="handlePluginUninstall(plugin.id)"
                  />
                </div>
              </template>
            </UCard>
          </div>

          <UEmpty v-else icon="i-lucide-package" size="sm" variant="naked" :title="t('Common.NoData')" />
        </div>
      </template>
    </UModal>
  </div>
</template>
