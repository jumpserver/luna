<script setup lang="ts">
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { KokoConnectView } from "#koko";
import LionProvider from "~/components/lion/LionProvider.vue";
import { useSessionShare } from "~/composables/useSessionShare";
import LionShareView from "~/lion/views/ShareView.vue";

definePageMeta({ layout: "connect" });

const route = useRoute();
const { t } = useI18n();
const shareId = String(route.params.id || "");
const verifyValue = ref(String(route.query.code || "").trim());
const showModal = ref(!verifyValue.value);
const { sessionContext, loading, error, join } = useSessionShare(shareId, String(route.query.component || ""));

provide(connectorSessionKey, sessionContext);

async function startShareSession() {
  await join(verifyValue.value);
  showModal.value = !sessionContext.value;
}

onMounted(() => {
  if (verifyValue.value) void startShareSession();
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
            :disabled="loading"
            @keydown.enter.prevent="startShareSession"
          />
        </UFormField>
        <p v-if="error" class="mt-2 text-sm text-error" role="alert">{{ error }}</p>
      </template>
      <template #footer>
        <UButton
          block
          color="primary"
          :label="t('Common.Confirm')"
          :loading="loading"
          :disabled="!verifyValue.trim() || !shareId"
          @click="startShareSession"
        />
      </template>
    </UModal>

    <LionProvider v-if="sessionContext?.component === 'lion'">
      <LionShareView :context="sessionContext" />
    </LionProvider>
    <KokoConnectView v-else-if="sessionContext?.component === 'koko'" />
  </div>
</template>
