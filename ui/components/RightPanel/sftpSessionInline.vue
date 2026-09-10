<script setup lang="ts">
import type { SftpCapabilities } from "#koko";
import type { KokoWorkspaceTab } from "#koko/host";
import type { WorkspacePane } from "~/composables/useWorkspaceTabs";
import { KokoFileManagerSessionSurface } from "#koko";
import {
  createKokoCompactFileAiOwnerId,
  createKokoCompactFileAiTargetId
} from "#koko/composables/sftp/useFileAiSessions";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";

const props = defineProps<{ session: WorkspacePane }>();

const { t } = useI18n();
const { activeTab } = useWorkspaceTabs();
const { openDevelopmentWorkspace: openDevelopmentWorkspaceSession } = useWorkspaceTabMenu();
const { getSessionDetails } = useWorkspaceSessionDetails();
const { setOpen: setRightPanelOpen } = useRightPanel();

const connecting = ref(false);
const inlinePayload = ref<Record<string, unknown> | null>(null);
const inlineError = ref("");
const inlineCapabilities = shallowRef<SftpCapabilities | null>(null);
const developmentOpening = ref(false);
let connectionAttempt = 0;

const requestFileToken = computed(() => getSessionDetails(props.session.id)?.requestFileToken);
const compactAiOwnerId = computed(() => createKokoCompactFileAiOwnerId(props.session.id));
const inlineAccount = computed(() => props.session.account || "");
const inlineTab = computed<KokoWorkspaceTab | null>(() => {
  if (!inlinePayload.value) return null;
  return {
    id: createKokoCompactFileAiTargetId(props.session.id, props.session.assetId, inlineAccount.value),
    assetId: props.session.assetId,
    assetName: props.session.assetName,
    assetType: props.session.assetType || "",
    assetPlatform: props.session.assetPlatform || "",
    assetCategory: props.session.assetCategory || "",
    protocol: "sftp",
    account: inlineAccount.value,
    payload: inlinePayload.value
  };
});
const canOpenDevelopmentWorkspace = computed(() => {
  const editor = inlineCapabilities.value?.file_editor;
  return Boolean(
    props.session.protocol === "ssh" &&
    inlineTab.value?.assetId === props.session.assetId &&
    requestFileToken.value &&
    editor?.enabled &&
    editor.read &&
    editor.write &&
    editor.save.version === 1 &&
    editor.save.expected_version &&
    editor.save.force
  );
});

const openSftp = async () => {
  const requester = requestFileToken.value;
  if (!requester || connecting.value) return;

  const attempt = ++connectionAttempt;
  connecting.value = true;
  inlineError.value = "";
  inlineCapabilities.value = null;
  inlinePayload.value = null;
  try {
    const tokenId = await requester();
    if (attempt !== connectionAttempt) return;
    if (!tokenId) throw new Error(t("koko.fileManagement.unavailableInSession") || "SFTP unavailable");
    inlinePayload.value = {
      id: tokenId,
      token: { id: tokenId },
      connectMethod: { value: SFTP_FILE_MANAGER_VALUE, component: "koko" }
    };
  } catch (error) {
    if (attempt === connectionAttempt) {
      inlineError.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (attempt === connectionAttempt) connecting.value = false;
  }
};

const openDevelopmentWorkspace = async () => {
  const workspaceTab = activeTab.value;
  const requester = requestFileToken.value;
  if (!workspaceTab || !requester || developmentOpening.value) return;

  developmentOpening.value = true;
  try {
    const editorPane = await openDevelopmentWorkspaceSession(workspaceTab, props.session, requester);
    if (editorPane) setRightPanelOpen(false);
  } finally {
    developmentOpening.value = false;
  }
};

watch(
  requestFileToken,
  (requester) => {
    if (requester && !inlinePayload.value && !connecting.value) void openSftp();
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="inlineTab" class="flex min-h-0 flex-1 flex-col">
      <div v-if="canOpenDevelopmentWorkspace" class="shrink-0 border-b border-default px-2 py-2">
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          block
          icon="i-lucide-panels-top-left"
          :label="t('RightPanel.OpenDevelopmentWorkspace')"
          :title="t('RightPanel.OpenDevelopmentWorkspaceHint')"
          :loading="developmentOpening"
          @click="openDevelopmentWorkspace"
        />
      </div>

      <KokoFileManagerSessionSurface
        :key="inlineTab.id"
        :tab="inlineTab"
        :ai-owner-id="compactAiOwnerId"
        :close-guard-session-id="session.id"
        compact
        class="min-h-0 flex-1"
        @capabilities="inlineCapabilities = $event"
      />
    </div>

    <div v-else-if="inlineError" class="grid min-h-0 flex-1 place-items-center px-4 text-xs">
      <div class="flex max-w-full flex-col items-center gap-3 text-center">
        <UIcon name="i-lucide-circle-alert" class="size-6 text-error" />
        <span class="break-all text-muted">{{ inlineError }}</span>
        <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-refresh-cw" @click="openSftp">
          {{ t("koko.fileManagement.reconnect") }}
        </UButton>
      </div>
    </div>

    <div v-else class="grid min-h-0 flex-1 place-items-center text-xs text-muted">
      <div class="flex flex-col items-center gap-2">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        <span>{{ t("koko.workspace.preparingSftp") }}</span>
      </div>
    </div>
  </div>
</template>
