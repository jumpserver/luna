<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type {
  AssetItem,
  AssetPageType,
  ConnectionInfo,
  ConnectionPreferenceInfo,
  PermedAccount,
  PermedProtocol
} from "~/types/index";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

const props = withDefaults(
  defineProps<{
    tab: WorkspaceSessionTab;
    assetType?: AssetPageType;
  }>(),
  {
    assetType: "assets"
  }
);

const { t, locale } = useI18n();
const { getAssetDetail } = useAssetAction();
const { confirmConnection } = useAssetConnection();
const { closeSession, startSessionConnection } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();

const currentAsset = ref<AssetItem | null>(props.tab.setupAsset || null);
const loading = ref(false);
const connecting = ref(false);
const connectionError = ref("");

const draftProtocol = ref<string>("");
const draftAccount = ref<string>("");
const draftManualUsername = ref<string>("");
const draftManualPassword = ref<string>("");
const draftDynamicPassword = ref<string>("");
const draftRememberSecret = ref<boolean>(false);
const draftRememberSelection = ref<boolean>(false);
const draftConnectMethod = ref<string>("");
const draftConnectOptions = ref<Record<string, any>>({});

const title = computed(() => props.tab.assetName || currentAsset.value?.name || "");

const getVisibleProtocols = (protocols: PermedProtocol[]) => {
  if (isTauriRuntime()) return protocols;
  return protocols.filter((protocol) => protocol?.public !== false);
};

const getManualInputLabel = () => (locale.value === "zh" ? "手动输入" : "Manual input");
const getAnonymousLabel = () => (locale.value === "zh" ? "匿名账号" : "Anonymous");
const getDynamicAccountLabel = (account?: PermedAccount) => {
  if (!account) return "";

  const base = t("Account.DynamicUser");
  const username = account.username || "";
  return username ? `${base}(${username})` : base;
};

const resolvePreferredProtocol = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  protocols: PermedProtocol[]
) => {
  const available = sortPermedProtocols(protocols).map((item) => item.name);
  const explicit = (props.tab.protocol || "").trim();
  const preferred = (source?.protocol || "").trim();

  if (explicit && available.includes(explicit)) return explicit;
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] || "";
};

const resolvePreferredAccount = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  accounts: PermedAccount[]
) => {
  const mode = source?.accountMode || "hosted";
  const username = (source?.username || "").trim();

  if (mode === "manual") {
    const manual = accounts.find((account) => account.alias === "@INPUT");
    if (manual) return getManualInputLabel();
  }

  if (mode === "dynamic") {
    const dynamic = accounts.find((account) => account.alias === "@USER");
    if (dynamic) return getDynamicAccountLabel(dynamic);
  }

  if (mode === "anonymous") {
    const anonymous = accounts.find((account) => account.alias === "@ANON");
    if (anonymous) return "@ANON";
  }

  if (mode === "hosted" && username) {
    const hosted = accounts.find((account) => {
      if (source?.accountId && account.id === source.accountId) return true;
      return account.name === username || account.username === username || account.alias === username;
    });

    if (hosted) return hosted.name;
  }

  const firstHosted = accounts.find((account) => account?.alias && !account.alias.startsWith("@"));
  if (firstHosted) return firstHosted.name;

  const dynamic = accounts.find((account) => account.alias === "@USER");
  if (dynamic) return getDynamicAccountLabel(dynamic);

  const manual = accounts.find((account) => account.alias === "@INPUT");
  if (manual) return getManualInputLabel();

  const anonymous = accounts.find((account) => account.alias === "@ANON");
  if (anonymous) return "@ANON";

  return "";
};

const initDraft = (asset: AssetItem) => {
  const saved: ConnectionInfo | undefined = asset.savedConnection;
  const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
  const source = {
    ...(saved || {}),
    ...(preferred || {})
  } as ConnectionPreferenceInfo | ConnectionInfo;

  const protocols = sortPermedProtocols(getVisibleProtocols(asset.permedProtocols || ([] as PermedProtocol[])));
  const accounts = asset.permedAccounts || ([] as PermedAccount[]);

  draftProtocol.value = resolvePreferredProtocol(source, protocols);
  draftAccount.value = resolvePreferredAccount(source, accounts);
  draftManualUsername.value = source?.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = saved?.rememberSecret || false;
  draftRememberSelection.value = false;
  draftConnectMethod.value = source?.connectMethod || "";
  draftConnectOptions.value = { ...(source?.connectOptions || {}) };
};

const normalizeProtocols = () => {
  const protocols = getVisibleProtocols(currentAsset.value?.permedProtocols || [])
    .map((p) => (p?.name ? p.name.trim() : ""))
    .filter((name) => name.length > 0);

  return sortProtocolNames(protocols);
};

const buildConnectionInfo = () => {
  let accountMode: "hosted" | "dynamic" | "manual" | "anonymous" = "hosted";
  let normalizedAccount = draftAccount.value || "";
  let accountId: string | undefined;

  const v = draftAccount.value || "";

  if (v === getManualInputLabel()) accountMode = "manual";
  if (v.includes("@ANON") || v === getAnonymousLabel()) {
    accountMode = "anonymous";
    normalizedAccount = "@ANON";
  }
  if (v.startsWith(t("Account.DynamicUser"))) {
    accountMode = "dynamic";

    const accs = currentAsset.value?.permedAccounts || [];
    const dynamicAcc = accs.find((a) => a.alias === "@USER");

    if (dynamicAcc) normalizedAccount = dynamicAcc.name;
    else normalizedAccount = v.replace(/\(.+\)/, "");
  }

  if (accountMode === "hosted") {
    const accs = currentAsset.value?.permedAccounts || [];
    const matched = accs.find(
      (a) => a.name === normalizedAccount || a.username === normalizedAccount || a.alias === normalizedAccount
    );
    accountId = matched?.id;
  }

  return {
    protocol: draftProtocol.value || "",
    account: normalizedAccount,
    accountId,
    accountMode,
    manualUsername: draftManualUsername.value || "",
    manualPassword: draftManualPassword.value || "",
    dynamicPassword: draftDynamicPassword.value || "",
    rememberSecret: !!draftRememberSecret.value,
    rememberSelection: !!draftRememberSelection.value,
    connectMethod: draftConnectMethod.value || "",
    connectOptions: { ...draftConnectOptions.value },
    availableProtocols: normalizeProtocols()
  };
};

async function ensureDetails(asset: AssetItem) {
  const noAccounts = !asset.permedAccounts || asset.permedAccounts.length === 0;
  const noProtocols = !asset.permedProtocols || asset.permedProtocols.length === 0;

  if (!noAccounts && !noProtocols) return asset;

  let unsubscribe = () => {};
  const detailsReady = new Promise<AssetItem>((resolve) => {
    unsubscribe = useEventBus().on(
      "assetDetailUpdated",
      (payload: { assetId: string; permedAccounts: PermedAccount[]; permedProtocols: PermedProtocol[] }) => {
        if (payload.assetId !== asset.id) return;

        currentAsset.value = {
          ...(currentAsset.value || asset),
          permedAccounts: payload.permedAccounts || [],
          permedProtocols: payload.permedProtocols || []
        } as AssetItem;

        resolve(currentAsset.value!);
      },
      false
    );
  });
  const fallback = new Promise<AssetItem>((resolve) => {
    setTimeout(resolve, 2500, currentAsset.value || asset);
  });

  await getAssetDetail(asset.id);
  const updated = await Promise.race([detailsReady, fallback]);
  unsubscribe();
  return updated;
}

async function loadAsset() {
  const asset = currentAsset.value || props.tab.setupAsset;
  if (!asset) return;

  loading.value = true;
  try {
    currentAsset.value = await ensureDetails(asset);
    initDraft(currentAsset.value);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!currentAsset.value || connecting.value) return;

  const info = buildConnectionInfo();
  connecting.value = true;
  connectionError.value = "";
  startSessionConnection(props.tab.id, {
    protocol: info.protocol,
    account: info.account
  });
  try {
    await confirmConnection(currentAsset.value, {
      ...info,
      tabId: props.tab.id,
      onSessionError: (error) => {
        connecting.value = false;
        connectionError.value =
          error instanceof Error ? error.message : String(error || t("ConnectError.ConnectFailed"));
      }
    });
  } catch (error) {
    connecting.value = false;
    connectionError.value = error instanceof Error ? error.message : String(error || t("ConnectError.ConnectFailed"));
  }
}

watch(
  () => props.tab.status,
  (status) => {
    if (status === "failed") {
      connecting.value = false;
      if (!connectionError.value) connectionError.value = t("ConnectError.ConnectFailed");
    }
  }
);

onMounted(loadAsset);
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-auto bg-[var(--workspace-surface-background)] px-4 py-4 sm:px-10">
    <div class="mx-auto flex min-h-full w-full items-center justify-center">
      <div v-if="loading" class="grid h-full min-h-64 w-full place-items-center text-sm text-[var(--app-muted)]">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          <span>{{ t("Loading.Loading") }}</span>
        </div>
      </div>

      <template v-else-if="currentAsset">
        <section
          class="connection-setup-shell w-[min(640px,100%)] overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--workspace-surface-panel)] shadow-[var(--theme-shadow-soft)]"
        >
          <div
            class="flex h-11 items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--workspace-surface-header)] px-4"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-semibold text-[var(--app-fg)]">{{ t("ContextMenu.Connect") }}</span>
              <span class="truncate text-xs text-[var(--app-muted)]">{{ title || props.tab.address }}</span>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="sm"
              :aria-label="t('Common.Cancel')"
              @click="closeSession(props.tab.id)"
            />
          </div>

          <div class="flex min-h-[300px] flex-col bg-[var(--app-surface-panel-strong)]">
            <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
              <ConnectForm
                v-model:protocol="draftProtocol"
                v-model:account="draftAccount"
                v-model:manual-username="draftManualUsername"
                v-model:manual-password="draftManualPassword"
                v-model:dynamic-password="draftDynamicPassword"
                v-model:remember-secret="draftRememberSecret"
                v-model:connect-method="draftConnectMethod"
                v-model:connect-options="draftConnectOptions"
                :accounts="currentAsset.permedAccounts || []"
                :protocols="currentAsset.permedProtocols || []"
                :asset-type="props.assetType"
                @keydown.enter="submit"
              />
              <UCheckbox
                v-model="draftRememberSelection"
                icon="i-lucide-check"
                :label="t('EditModal.RememberSelection')"
                class="mt-4"
              />
            </div>

            <div
              v-if="connecting || connectionError"
              class="border-t border-[var(--app-border)] bg-[var(--workspace-surface-footer)] px-5 py-3"
            >
              <div v-if="connecting" class="space-y-2">
                <div class="flex items-center gap-2 text-xs text-[var(--app-muted)]">
                  <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                  <span>{{ locale === "zh" ? "正在建立连接..." : "Establishing connection..." }}</span>
                </div>
                <div class="connection-activity-track">
                  <span class="connection-activity-bar" />
                </div>
              </div>

              <div
                v-if="connectionError"
                class="mt-2 flex items-start gap-2 rounded-md border border-error/25 bg-error/10 px-3 py-2 text-xs text-error"
              >
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
                <span class="min-w-0 break-words">{{ connectionError }}</span>
              </div>
            </div>

            <div
              class="border-t border-[var(--app-border)] bg-[var(--workspace-surface-footer)] px-5 pt-3 pb-5"
            >
              <UButton
                :label="t('Common.Connect')"
                color="primary"
                :loading="connecting"
                block
                @click="submit"
              />
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.connection-setup-shell {
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--app-surface-panel-strong) 82%, transparent) inset,
    var(--theme-shadow-soft);
}

.connection-activity-track {
  position: relative;
  height: 0.1875rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}

.connection-activity-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 38%;
  border-radius: inherit;
  background: var(--ui-primary);
  animation: connection-activity-slide 1.05s ease-in-out infinite alternate;
}

@keyframes connection-activity-slide {
  from {
    transform: translateX(-20%);
  }

  to {
    transform: translateX(185%);
  }
}
</style>
