<script setup lang="ts">
import type { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";
import type { KokoPreparedSftpAsset, KokoSftpAsset } from "#koko/host";
import type { AssetItem, AssetTreeNode } from "~/types";
import { assetSupportsSftp } from "#koko/composables/sftp/file-manager/selectors";
import { useKokoHostAdapter } from "#koko/host";
import ConnectAccountFields from "~/components/ConnectForm/connectAccountFields.vue";
import { useAssetTree, useAssetTreeSearch } from "~/composables/useAssetTree";
import { useRecentConnections } from "~/composables/useRecentConnections";
import { useUserInfoStore } from "~/store/modules/userInfo";

type WorkspaceController = ReturnType<typeof useSftpWorkspacePanes>;

const props = defineProps<{ workspace: WorkspaceController }>();
const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const { modernIsland } = useSettingManager();
const {
  buildConnectionInfo,
  draft,
  initDraft,
  personalCredentials,
  personalCredentialsLoaded,
  personalCredentialsLoading,
  personalCredentialsLoadFailed
} = useConnectionFormState();
const host = useKokoHostAdapter();
const userInfoStore = useUserInfoStore();
const { fetchAuthorizationTreePage, treeNodeToAsset } = useAssetTree();
const { recentConnections, load: loadRecentConnections } = useRecentConnections();
const { connectModalOpen, connectRemoteAsset, currentOrgId, remoteAssetSearch, remoteConnecting } = props.workspace;

const step = ref<1 | 2>(1);
const stepDirection = ref<"next" | "prev">("next");
const selectedAsset = ref<KokoPreparedSftpAsset | null>(null);
const preparing = ref(false);
const stack = ref<AssetTreeNode[]>([]);
const items = ref<AssetTreeNode[]>([]);
const listLoading = ref(false);
const { nodes: searchNodes, loading: searchLoading } = useAssetTreeSearch(() => remoteAssetSearch.value, {
  onResults: () => {},
  onError: (_query, error) => addErrorToast({ title: t("Asset.GetAssetFailed"), error })
});
const searching = computed(() => Boolean(remoteAssetSearch.value.trim()));
const visibleItems = computed(() =>
  searching.value ? searchNodes.value.filter((node) => !isFolder(node)) : items.value
);
const previewRecents = ref<AssetItem[]>([]);
let recentPreviewRequest = 0;
const listBusy = computed(() => (searching.value ? searchLoading.value : listLoading.value));
const showRecents = computed(() => !searching.value && stack.value.length === 0 && previewRecents.value.length > 0);
const showEmpty = computed(() => !listBusy.value && !visibleItems.value.length && !showRecents.value);
const separatorUi = {
  border: "border-[color-mix(in_srgb,var(--theme-fg)_24%,transparent)]",
  label: "text-xs text-muted"
};

const flipName = computed(() => {
  if (!modernIsland.value) return "";
  return stepDirection.value === "prev" ? "sftp-flip-prev" : "sftp-flip-next";
});
const selectedAssetItem = computed(() => (selectedAsset.value ? toAssetItem(selectedAsset.value) : null));
const isManualAccount = computed(() => {
  const account = draft.value.account;
  return (
    account === "@INPUT" || account === t("Account.ManualInput") || account === "手动输入" || account === "Manual input"
  );
});
const canConnect = computed(() => {
  if (!selectedAsset.value || remoteConnecting.value || !draft.value.account) return false;
  if (!isManualAccount.value) return true;
  if (draft.value.personalCredentialId && !draft.value.savePersonalCredential) return true;
  return Boolean(draft.value.manualUsername.trim() && draft.value.manualPassword);
});

function isFolder(node: AssetTreeNode) {
  return node.meta?.type === "node" || Boolean(node.isParent);
}

function assetAddress(node: AssetTreeNode) {
  const asset = treeNodeToAsset(node);
  return asset.address && asset.address !== asset.name ? asset.address : "";
}

function lastAccountName(assetId: string, fallback?: string) {
  const name =
    userInfoStore.getConnectionPreferenceForAsset(assetId)?.username ||
    userInfoStore.getConnectionInfoForAsset(assetId)?.username ||
    fallback ||
    "";
  return name && name !== "-" ? name : "";
}

async function loadLevel(parent?: AssetTreeNode) {
  listLoading.value = true;
  try {
    items.value = (await fetchAuthorizationTreePage(parent)).nodes;
  } catch (error) {
    addErrorToast({ title: t("Asset.GetAssetFailed"), error });
  } finally {
    listLoading.value = false;
  }
}

async function enterFolder(node: AssetTreeNode) {
  stack.value = [...stack.value, node];
  await loadLevel(node);
}

function goUp() {
  stack.value = stack.value.slice(0, -1);
  void loadLevel(stack.value[stack.value.length - 1]);
}

function goTo(index: number) {
  stack.value = stack.value.slice(0, index + 1);
  void loadLevel(stack.value[stack.value.length - 1]);
}

function pickNode(node: AssetTreeNode) {
  if (isFolder(node)) {
    void enterFolder(node);
    return;
  }
  void selectAsset(treeNodeToAsset(node));
}

function toAssetItem(asset: KokoPreparedSftpAsset): AssetItem {
  return {
    id: asset.id,
    name: asset.name,
    address: asset.address,
    platform: asset.platform,
    zone: asset.zone,
    isActive: asset.isActive,
    category: asset.category,
    type: asset.type,
    comment: asset.comment,
    permedAccounts: asset.permedAccounts,
    permedProtocols: asset.permedProtocols
  };
}

function goToStep(next: 1 | 2) {
  stepDirection.value = next > step.value ? "next" : "prev";
  step.value = next;
}

async function loadPreviewRecents() {
  const request = ++recentPreviewRequest;
  const connections = recentConnections.value.slice(0, 10);
  const verified = await Promise.all(
    connections.map(async (asset) => {
      try {
        return assetSupportsSftp((await host.sftp.prepareAsset(asset)).permedProtocols) ? asset : null;
      } catch {
        return null;
      }
    })
  );
  if (request !== recentPreviewRequest) return;
  previewRecents.value = verified.filter((asset): asset is AssetItem => Boolean(asset)).slice(0, 4);
}

function resetModal() {
  recentPreviewRequest += 1;
  previewRecents.value = [];
  step.value = 1;
  stepDirection.value = "next";
  selectedAsset.value = null;
  preparing.value = false;
  stack.value = [];
  items.value = [];
}

async function selectAsset(asset: KokoSftpAsset) {
  if (preparing.value || remoteConnecting.value) return;
  preparing.value = true;
  try {
    const prepared = await host.sftp.prepareAsset(asset);
    if (!assetSupportsSftp(prepared.permedProtocols)) {
      toast.add({
        title: t("koko.fileManagement.unsupportedAsset"),
        description: t("koko.fileManagement.unsupportedAssetDescription"),
        color: "warning",
        icon: "i-lucide-circle-alert"
      });
      return;
    }
    selectedAsset.value = prepared;
    const item = toAssetItem(prepared);
    initDraft(item, "sftp");
    draft.value.protocol = "sftp";
    goToStep(2);
  } catch (error) {
    addErrorToast({ title: t("koko.fileManagement.remoteConnectFailed"), error });
  } finally {
    preparing.value = false;
  }
}

function backToAssets() {
  if (remoteConnecting.value) return;
  goToStep(1);
}

async function connect() {
  const asset = selectedAsset.value;
  if (!asset || !canConnect.value) return;
  const info = buildConnectionInfo(toAssetItem(asset));
  await connectRemoteAsset(
    { id: asset.id, name: asset.name },
    {
      account: info.account,
      accountId: info.accountId,
      accountMode: info.accountMode,
      manualUsername: info.manualUsername,
      manualPassword: info.manualPassword,
      personalCredentialId: info.personalCredentialId,
      personalCredentialVersion: info.personalCredentialVersion,
      personalCredentialSecretType: info.personalCredentialSecretType,
      savePersonalCredential: info.savePersonalCredential,
      dynamicPassword: info.dynamicPassword
    }
  );
}

watch(connectModalOpen, (open) => {
  if (!open) {
    resetModal();
    return;
  }
  stack.value = [];
  loadRecentConnections();
  void loadPreviewRecents();
  void loadLevel();
});
watch(currentOrgId, () => {
  if (!connectModalOpen.value) return;
  stack.value = [];
  loadRecentConnections();
  void loadPreviewRecents();
  void loadLevel();
});
</script>

<template>
  <UModal
    v-model:open="connectModalOpen"
    :title="step === 2 && selectedAsset ? selectedAsset.name : t('koko.fileManagement.connectRemoteSftp')"
    :ui="{
      content: modernIsland ? 'max-w-md rounded-[length:var(--workspace-island-radius)]' : 'max-w-md'
    }"
  >
    <template #body>
      <div class="sftp-step-stage" :class="{ 'sftp-step-stage--island': modernIsland }">
        <Transition :name="flipName" :css="modernIsland" mode="out-in">
          <div
            v-if="step === 1"
            key="pick"
            class="sftp-step-page"
            :class="{ 'pointer-events-none opacity-60': preparing }"
          >
            <UInput
              v-model="remoteAssetSearch"
              class="w-full"
              icon="i-lucide-search"
              :placeholder="t('koko.fileManagement.searchAssets')"
            />
            <div v-if="stack.length && !searching" class="mt-2 flex min-w-0 items-center gap-1 px-2 py-1.5 text-sm">
              <button
                type="button"
                class="shrink-0 text-muted hover:text-highlighted"
                :aria-label="t('koko.actions.back')"
                @click="goUp"
              >
                <UIcon name="i-lucide-chevron-left" class="size-4" />
              </button>
              <template v-for="(node, index) in stack" :key="node.id">
                <span v-if="index" class="shrink-0 text-muted">/</span>
                <button
                  v-if="index < stack.length - 1"
                  type="button"
                  class="min-w-0 truncate text-muted hover:text-highlighted"
                  @click="goTo(index)"
                >
                  {{ node.name }}
                </button>
                <span v-else class="min-w-0 truncate text-highlighted">{{ node.name }}</span>
              </template>
            </div>
            <div class="mt-2" :class="stack.length || searching ? 'max-h-64 overflow-y-auto' : ''">
              <div v-if="listBusy" class="grid h-24 place-items-center">
                <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
              </div>
              <template v-else>
                <template v-if="showRecents">
                  <USeparator :label="t('Menu.RecentConnections')" position="start" class="my-2" :ui="separatorUi" />
                  <button
                    v-for="asset in previewRecents"
                    :key="asset.id"
                    type="button"
                    class="sftp-pick-row"
                    @click="selectAsset(asset)"
                  >
                    <span class="sftp-pick-icon">
                      <UIcon name="i-lucide-monitor" class="size-4" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-highlighted">{{ asset.name }}</span>
                      <span
                        v-if="asset.address && asset.address !== asset.name"
                        class="block truncate text-xs text-muted"
                      >
                        {{ asset.address }}
                      </span>
                    </span>
                    <span v-if="lastAccountName(asset.id, asset.savedConnection?.username)" class="sftp-pick-account">
                      {{ lastAccountName(asset.id, asset.savedConnection?.username) }}
                    </span>
                  </button>
                </template>
                <USeparator
                  v-if="!searching && !stack.length && visibleItems.length"
                  :label="t('Menu.MyAssets')"
                  position="start"
                  class="my-2"
                  :ui="separatorUi"
                />
                <p v-if="showEmpty" class="px-2 py-6 text-center text-sm text-muted">
                  {{ searching ? t("AddSession.NoMatchingAssets") : t("Common.NoData") }}
                </p>
                <button
                  v-for="node in visibleItems"
                  :key="node.id"
                  type="button"
                  class="sftp-pick-row"
                  @click="pickNode(node)"
                >
                  <span class="sftp-pick-icon">
                    <UIcon :name="isFolder(node) ? 'i-lucide-folder' : 'i-lucide-monitor'" class="size-4" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-highlighted">{{ node.name }}</span>
                    <span v-if="assetAddress(node)" class="block truncate text-xs text-muted">
                      {{ assetAddress(node) }}
                    </span>
                  </span>
                  <span v-if="!isFolder(node) && lastAccountName(treeNodeToAsset(node).id)" class="sftp-pick-account">
                    {{ lastAccountName(treeNodeToAsset(node).id) }}
                  </span>
                  <UIcon v-else-if="isFolder(node)" name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
                </button>
              </template>
            </div>
          </div>
          <div v-else key="account" class="sftp-step-page">
            <ConnectAccountFields
              v-if="selectedAssetItem"
              v-model:account="draft.account"
              v-model:manual-username="draft.manualUsername"
              v-model:manual-password="draft.manualPassword"
              v-model:personal-credential-id="draft.personalCredentialId"
              v-model:personal-credential-version="draft.personalCredentialVersion"
              v-model:personal-credential-secret-type="draft.personalCredentialSecretType"
              v-model:save-personal-credential="draft.savePersonalCredential"
              v-model:dynamic-password="draft.dynamicPassword"
              v-model:remember-secret="draft.rememberSecret"
              :accounts="selectedAssetItem.permedAccounts || []"
              :personal-credentials="personalCredentials"
              :personal-credentials-loading="personalCredentialsLoading"
              :personal-credentials-loaded="personalCredentialsLoaded"
              :personal-credentials-load-failed="personalCredentialsLoadFailed"
            />
          </div>
        </Transition>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-1.5">
        <UButton
          v-if="step === 2"
          color="neutral"
          variant="ghost"
          :disabled="remoteConnecting"
          :label="t('koko.actions.back')"
          @click="backToAssets"
        />
        <div class="ml-auto flex items-center gap-1.5">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('koko.actions.cancel')"
            @click="void (connectModalOpen = false)"
          />
          <UButton
            v-if="step === 2"
            color="primary"
            :loading="remoteConnecting"
            :disabled="!canConnect"
            :label="t('koko.fileManagement.connect')"
            @click="void connect()"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.sftp-step-stage--island {
  perspective: 920px;
}

.sftp-pick-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  text-align: left;
}

.sftp-pick-row:hover {
  background: var(--app-state-hover);
}

.sftp-pick-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-fg) 8%, transparent);
  color: var(--app-text-muted);
}

.sftp-pick-account {
  flex: none;
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--app-text-muted);
}

.sftp-step-page {
  transform-origin: 50% 50%;
  backface-visibility: hidden;
}

.sftp-flip-next-enter-active,
.sftp-flip-next-leave-active,
.sftp-flip-prev-enter-active,
.sftp-flip-prev-leave-active {
  transition:
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease;
}

.sftp-flip-next-leave-to,
.sftp-flip-prev-enter-from {
  opacity: 0;
  transform: rotateY(-78deg);
}

.sftp-flip-next-enter-from,
.sftp-flip-prev-leave-to {
  opacity: 0;
  transform: rotateY(78deg);
}

@media (prefers-reduced-motion: reduce) {
  .sftp-flip-next-enter-active,
  .sftp-flip-next-leave-active,
  .sftp-flip-prev-enter-active,
  .sftp-flip-prev-leave-active {
    transition: none;
  }
}
</style>
