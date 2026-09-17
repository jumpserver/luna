<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { AssetDetail, TokenResponse } from "~/types";

import { writeText } from "clipboard-polyfill";
import {
  getAssetDetailRequest,
  getPublicSettings,
  getUserProfile,
  setConnectionTokenReusable
} from "~/composables/useApiRequest";
import { getDirectGuideCommand } from "./directGuide";
import { getGuideClientProtocol, getGuideConnectCommand } from "./guideCommand";
import {
  applyConnectionTokenReuse,
  DATABASE_GUIDE_PROTOCOLS,
  isDatabaseGuideProtocol,
  resolveConnectionTokenReuseError,
  shouldShowConnectionTokenReuse
} from "./tokenReuse";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const defaultPorts: Record<string, number> = {
  ssh: 22,
  vnc: 5900,
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  redis: 6379,
  oracle: 1521,
  sqlserver: 1433,
  mongodb: 27017
};
const databaseProtocols = DATABASE_GUIDE_PROTOCOLS;

const { t } = useI18n();
const toast = useToast();
const token = computed(() => (props.tab.payload?.token || props.tab.payload) as TokenResponse);
const endpoint = ref<Record<string, any>>({});
const assetDetail = ref<AssetDetail>();
const loading = ref(true);
const passwordVisible = ref(false);
const loginUsername = ref("");
const connectionTokenReusable = ref(false);
const reusable = ref(false);
const reusableUpdating = ref(false);

const protocol = computed(() => (token.value?.protocol || props.tab.protocol || "").toLowerCase());
const clientProtocol = computed(() => getGuideClientProtocol(protocol.value));
const showDirectCommand = computed(() => {
  const method = props.tab.payload?.connectMethod;
  return (
    protocol.value === "ssh" ||
    (protocol.value === "vnc" && method?.component !== "panda" && method?.type !== "virtual_app")
  );
});
const showReusable = computed(() => shouldShowConnectionTokenReuse(connectionTokenReusable.value, token.value?.id));
const showDatabaseHelp = computed(() => isDatabaseGuideProtocol(protocol.value));
const host = computed(() => String(endpoint.value.host || ""));
const port = computed(() =>
  String(
    endpoint.value[databaseProtocols.has(protocol.value) ? "magnus_port" : `${protocol.value}_port`] ||
      endpoint.value.port ||
      defaultPorts[protocol.value] ||
      ""
  )
);
const asset = computed(() => token.value?.asset as any);
const assetName = computed(() => {
  const name = asset.value?.name || props.tab.assetName;
  const address = asset.value?.address || props.tab.address;
  return address ? `${name}(${address})` : name;
});
const database = computed(() => {
  if (protocol.value === "oracle") return token.value.id;
  return (
    assetDetail.value?.spec_info?.db_name ?? (asset.value?.spec_info?.db_name || asset.value?.specInfo?.dbName || "")
  );
});
const username = computed(() => {
  if (protocol.value === "ssh") return `JMS-${token.value.id}`;
  if (protocol.value === "redis") return "";
  return token.value.id;
});
const password = computed(() =>
  protocol.value === "redis" ? `${token.value.id}@${token.value.value}` : token.value.value
);

const rows = computed(() => {
  const values = [
    { name: "name", label: t("ConnectionGuide.Name"), value: assetName.value },
    { name: "host", label: t("ConnectionGuide.Host"), value: host.value },
    { name: "port", label: t("ConnectionGuide.Port"), value: port.value },
    { name: "username", label: t("ConnectionGuide.Username"), value: username.value },
    { name: "password", label: t("ConnectionGuide.Password"), value: password.value },
    ...(databaseProtocols.has(protocol.value)
      ? [{ name: "database", label: t("ConnectionGuide.Database"), value: database.value }]
      : []),
    { name: "protocol", label: t("ConnectionGuide.Protocol"), value: clientProtocol.value },
    { name: "date_expired", label: t("ConnectionGuide.ExpireTime"), value: token.value.date_expired }
  ];

  return values.filter((item) => item.value !== undefined && item.value !== null);
});

const commands = computed(() => {
  const value = getGuideConnectCommand({
    protocol: protocol.value,
    id: token.value.id,
    secret: token.value.value,
    host: host.value,
    port: port.value,
    database: database.value,
    redisAuth: password.value
  });
  const tokenPassword = protocol.value === "ssh" || protocol.value === "vnc";
  const items = [];
  if (value) {
    items.push({
      value,
      title: t(tokenPassword ? "ConnectionGuide.TokenCommand" : "ConnectionGuide.ConnectCommand"),
      help: tokenPassword ? t("ConnectionGuide.TokenPasswordHelp") : ""
    });
  }
  if (showDirectCommand.value) {
    const value = getDirectGuideCommand({
      protocol: protocol.value,
      username: loginUsername.value,
      account: token.value.account,
      inputUsername: token.value.input_username,
      accounts: props.tab.permedAccounts || [],
      assetId: props.tab.assetId,
      host: host.value,
      port: port.value
    });
    items.push({
      value,
      title: t("ConnectionGuide.DirectCommand"),
      help: t(value ? "ConnectionGuide.DirectPasswordHelp" : "ConnectionGuide.DirectUnavailable")
    });
  }
  return items;
});

async function copy(value: unknown) {
  await writeText(String(value ?? ""));
  toast.add({ title: t("Common.CopySuccess"), color: "success", duration: 1200 });
}

watch(
  () => token.value?.is_reusable,
  (value) => {
    if (!reusableUpdating.value && value !== undefined) reusable.value = Boolean(value);
  },
  { immediate: true }
);

async function setReusable(nextValue: boolean) {
  const current = token.value;
  if (reusableUpdating.value || !current?.id || nextValue === reusable.value) return;

  reusable.value = nextValue;
  reusableUpdating.value = true;
  try {
    const result = await setConnectionTokenReusable(current.id, nextValue);
    applyConnectionTokenReuse(current, result);
    reusable.value = Boolean(current.is_reusable);
  } catch (error) {
    reusable.value = !nextValue;
    current.is_reusable = !nextValue;
    toast.add({
      title: resolveConnectionTokenReuseError(error, (key) => t(key)),
      color: "error",
      duration: 2000
    });
  } finally {
    reusableUpdating.value = false;
  }
}

onMounted(async () => {
  const assetId = token.value?.asset?.id || props.tab.assetId;
  try {
    await Promise.all([
      getSmartEndpoint({
        protocol: protocol.value,
        assetId: props.tab.assetId,
        token: token.value.id
      }).then((value) => {
        endpoint.value = value;
      }),
      // Connection tokens normally include only asset id/name, not the default database.
      showDatabaseHelp.value && protocol.value !== "oracle" && !database.value && assetId
        ? getAssetDetailRequest(assetId, token.value.org_id || props.tab.orgId)
            .then((value) => {
              assetDetail.value = value;
            })
            .catch(() => {
              toast.add({ title: t("Asset.GetAssetFailed"), color: "error", duration: 4000 });
            })
        : Promise.resolve(),
      getPublicSettings()
        .then((settings) => {
          connectionTokenReusable.value = settings.CONNECTION_TOKEN_REUSABLE === true;
        })
        .catch(() => {
          connectionTokenReusable.value = false;
        }),
      showDirectCommand.value
        ? getUserProfile()
            .then((profile) => {
              loginUsername.value = profile.username;
            })
            .catch(() => {
              loginUsername.value = "";
            })
        : Promise.resolve()
    ]);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="h-full min-h-0 overflow-auto bg-[var(--workspace-surface-background)] px-4 py-4 sm:px-6 sm:py-6">
    <div class="mx-auto w-full max-w-4xl">
      <div v-if="loading" class="grid min-h-64 place-items-center text-[var(--app-muted)]">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>

      <template v-else>
        <section
          class="overflow-hidden rounded-lg bg-[var(--workspace-surface-panel)] border border-[var(--workspace-surface-border)]"
        >
          <header
            class="flex items-center gap-3 border-b border-[var(--workspace-surface-border)] bg-[var(--workspace-surface-header)] px-5 py-4 sm:px-6"
          >
            <div class="grid size-8 shrink-0 place-items-center text-[var(--app-muted)]">
              <UIcon name="i-lucide-key-round" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="truncate text-base font-semibold text-[var(--app-fg)]">
                  {{ t("ConnectionGuide.Title") }}
                </h2>
                <UBadge :label="clientProtocol.toUpperCase()" color="neutral" variant="outline" size="sm" />
              </div>
              <p class="mt-0.5 truncate text-xs text-[var(--app-muted)]">
                {{ assetName }}
              </p>
            </div>
          </header>

          <div class="bg-[var(--workspace-surface-panel)] px-3 py-3 sm:px-5 sm:py-5">
            <div class="overflow-hidden rounded-lg border border-[var(--workspace-surface-border)]">
              <table class="w-full border-collapse text-sm">
                <tbody>
                  <tr
                    v-for="row in rows"
                    :key="row.name"
                    class="group border-b border-[var(--workspace-surface-border)] transition-colors hover:bg-[var(--app-hover-soft)] focus-within:bg-[var(--app-hover-soft)]"
                  >
                    <th
                      class="w-28 bg-[var(--workspace-surface-sub-header)] px-4 py-2.5 text-left text-xs font-medium tracking-wide text-[var(--app-muted)] sm:w-40 sm:px-5"
                    >
                      {{ row.label }}
                    </th>
                    <td class="min-w-0 bg-[var(--app-surface-panel-strong)] px-3 py-2 text-[var(--app-fg)] sm:px-5">
                      <div class="flex min-h-7 items-center gap-1">
                        <span class="min-w-0 flex-1 break-all font-ui-mono text-[13px] leading-5">
                          {{ row.name === "password" && !passwordVisible ? "••••••••" : row.value }}
                        </span>
                        <UButton
                          v-if="row.name === 'password'"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                          :aria-label="t('ConnectionGuide.ShowPassword')"
                          class="shrink-0 text-[var(--app-muted)]"
                          @click="passwordVisible = !passwordVisible"
                        />
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-copy"
                          :aria-label="t('Common.Copy')"
                          class="guide-copy-button shrink-0 text-[var(--app-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          @click="copy(row.value)"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr
                    v-if="showReusable"
                    class="border-[var(--workspace-surface-border)] transition-colors hover:bg-[var(--app-hover-soft)] focus-within:bg-[var(--app-hover-soft)]"
                    :class="showDatabaseHelp ? 'border-b' : ''"
                  >
                    <th
                      class="w-28 bg-[var(--workspace-surface-sub-header)] px-4 py-2.5 text-left text-xs font-medium tracking-wide text-[var(--app-muted)] sm:w-40 sm:px-5"
                    >
                      {{ t("ConnectionGuide.SetReusable") }}
                    </th>
                    <td class="min-w-0 bg-[var(--app-surface-panel-strong)] px-3 py-2 text-[var(--app-fg)] sm:px-5">
                      <div class="flex min-h-7 items-center gap-3">
                        <USwitch
                          :model-value="reusable"
                          :disabled="reusableUpdating"
                          :aria-label="t('ConnectionGuide.SetReusable')"
                          @update:model-value="setReusable"
                        />
                        <span class="text-xs leading-5 text-[var(--app-muted)]">
                          {{ t("ConnectionGuide.ReusableHint") }}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="showDatabaseHelp">
                    <th
                      class="w-28 bg-[var(--workspace-surface-sub-header)] px-4 py-2.5 text-left text-xs font-medium tracking-wide text-[var(--app-muted)] sm:w-40 sm:px-5"
                    >
                      {{ t("ConnectionGuide.HelpText") }}
                    </th>
                    <td class="min-w-0 bg-[var(--app-surface-panel-strong)] px-3 py-2 text-[var(--app-fg)] sm:px-5">
                      <p class="text-xs leading-5 text-[var(--app-muted)]">
                        {{ t("ConnectionGuide.DatabaseTokenHelp") }}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-for="(command, index) in commands" :key="index" class="mt-4">
              <div class="mb-2 flex items-center gap-2 px-1">
                <UIcon name="i-lucide-terminal" class="size-4 text-[var(--app-muted)]" />
                <h3 class="text-xs font-medium tracking-wide text-[var(--app-muted)]">
                  {{ command.title }}
                </h3>
              </div>

              <div
                v-if="command.value"
                class="group flex items-center gap-3 rounded-lg border border-[var(--workspace-surface-border)] bg-[var(--app-surface-input)] px-4 py-3 transition-colors hover:bg-[var(--app-hover-soft)] focus-within:bg-[var(--app-hover-soft)]"
              >
                <span class="select-none font-ui-mono text-xs text-[var(--app-muted)]">$</span>
                <code class="min-w-0 flex-1 break-all font-ui-mono text-xs leading-5 text-[var(--app-fg)]">
                  {{ token.value ? command.value.replace(token.value, "••••••••") : command.value }}
                </code>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-copy"
                  :aria-label="t('ConnectionGuide.CopyCommand')"
                  class="guide-copy-button shrink-0 text-[var(--app-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  @click="copy(command.value)"
                />
              </div>
              <p v-if="command.help" class="mt-2 px-1 text-xs text-[var(--app-muted)]">{{ command.help }}</p>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
@media (hover: none) {
  .guide-copy-button {
    opacity: 1;
  }
}
</style>
