<script setup lang="ts">
import type { GuacamoleConnectionErrorDetails } from "@/lion/utils/status";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { KokoBaseWorkspaceShell as BaseWorkspaceShell } from "#koko";
import ConnectView from "@/lion/views/ConnectView.vue";
import { useBaseWorkspaceSession } from "@/lion/workspaces/useBaseWorkspaceSession";
import LionProvider from "~/components/lion/LionProvider.vue";
import { writeClipboardText } from "~/utils/clipboard";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();
const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const tab = toRef(props, "tab");
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab);
const { markSessionFailed } = useWorkspaceTabs();
const disconnectedError = ref("");
const disconnectedDetails = shallowRef<GuacamoleConnectionErrorDetails>();
const workspaceError = computed(() => error.value || disconnectedError.value);
const errorDetailsText = computed(() => {
  const details = disconnectedDetails.value;
  if (error.value || !details) return "";
  return [
    details.code !== undefined ? `${t("GuaErrorCode")}: ${details.code}` : "",
    details.message ? `${t("GuaErrorMessage")}: ${details.message}` : "",
    details.sessionId ? `${t("GuaErrorSessionId")}: ${details.sessionId}` : ""
  ]
    .filter(Boolean)
    .join("\n");
});

function handleDisconnected(message: string, details?: GuacamoleConnectionErrorDetails) {
  disconnectedError.value = message;
  disconnectedDetails.value = details;
  markSessionFailed({
    tabId: props.tab.id,
    assetId: props.tab.assetId,
    protocol: props.tab.protocol,
    account: props.tab.account
  });
}

async function copyErrorDetails() {
  try {
    await writeClipboardText(`${workspaceError.value}\n${errorDetailsText.value}`);
    toast.add({ title: t("Common.CopySuccess"), color: "success" });
  } catch {
    addErrorToast({ title: t("Common.CopyFailed") });
  }
}

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <LionProvider>
    <BaseWorkspaceShell
      :ready="Boolean(context) && !loading && !workspaceError"
      :loading="loading"
      :error="workspaceError"
      loading-text="正在准备远程桌面连接..."
      :retry-label="t('WorkspacePane.Reconnect')"
      @retry="emit('reconnect')"
    >
      <template #error-actions>
        <UPopover v-if="errorDetailsText">
          <UButton :label="t('GuaErrorDetails')" size="sm" color="neutral" variant="ghost" />
          <template #content>
            <div class="w-80 max-w-[80vw] space-y-2 p-3">
              <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-default">{{
                errorDetailsText
              }}</pre>
              <UButton
                :label="t('Common.Copy')"
                icon="i-lucide-copy"
                size="xs"
                color="neutral"
                variant="soft"
                @click="copyErrorDetails"
              />
            </div>
          </template>
        </UPopover>
      </template>
      <div class="relative h-full w-full min-h-0">
        <ConnectView :tab-id="tab.id" @disconnected="handleDisconnected" />
      </div>
    </BaseWorkspaceShell>
  </LionProvider>
</template>
