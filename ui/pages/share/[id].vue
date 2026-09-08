<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { KokoConnectView } from "#koko";
import { useKokoConnectionStore } from "#koko/stores/connection";

definePageMeta({ layout: "connect" });

const route = useRoute();
const { t } = useI18n();
const colorMode = useColorMode();
const { activePaneId } = useWorkspaceTabs();
const { bootstrapPersistedSession } = useAuthSession();
const connectionStore = useKokoConnectionStore();

const shareId = computed(() => String(route.params.id || ""));
const verifyValue = ref(String(route.query.code || "").trim());
const showModal = ref(!verifyValue.value);
const sessionContext = ref<ConnectorSessionContext | null>(null);

provide(connectorSessionKey, sessionContext);

function startShareSession(code: string) {
  const trimmed = code.trim();
  if (!trimmed || !shareId.value) return;

  const paneId = `share:${shareId.value}`;
  connectionStore.updateConnectionState({ shareId: shareId.value, shareCode: trimmed });
  sessionContext.value = {
    component: "koko",
    tokenId: "",
    endpointUrl: window.location.origin,
    tabId: paneId,
    colorMode: colorMode.value,
    themeType: colorMode.value === "dark" ? "darkGary" : "default",
    wsQuery: { type: "share", target_id: shareId.value },
    terminalProfile: { protocol: "ssh" }
  };
  activePaneId.value = paneId;
  showModal.value = false;
}

onMounted(async () => {
  await bootstrapPersistedSession();
  if (verifyValue.value) startShareSession(verifyValue.value);
});

onBeforeUnmount(() => {
  if (activePaneId.value === sessionContext.value?.tabId) activePaneId.value = "";
});
</script>

<template>
  <div class="h-full min-h-0">
    <UModal v-model:open="showModal" :dismissible="false" :title="t('RightPanel.VerifyCode')">
      <template #body>
        <UFormField :label="t('RightPanel.VerifyCode')">
          <UInput
            v-model="verifyValue"
            maxlength="4"
            :placeholder="t('RightPanel.VerifyCode')"
            @keydown.enter.prevent="startShareSession(verifyValue)"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          block
          color="primary"
          :label="t('Common.Confirm')"
          :disabled="!verifyValue.trim() || !shareId"
          @click="startShareSession(verifyValue)"
        />
      </template>
    </UModal>

    <KokoConnectView v-if="sessionContext" />
  </div>
</template>
