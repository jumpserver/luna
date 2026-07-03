<script setup lang="ts">
import { useKokoSessionAdapter } from "~/koko/composables/useSessionAdapter";

const { t } = useI18n();
const { onlineUsers, shareInfo, copyShareURL } = useKokoSessionAdapter();
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <div class="mb-2 flex items-center gap-2 text-sm font-medium">
        <span>{{ t("OnlineUser") || "Online users" }}</span>
        <UBadge color="success" variant="subtle">
          {{ onlineUsers.length }}
        </UBadge>
      </div>
      <div v-if="onlineUsers.length" class="space-y-2">
        <div
          v-for="user in onlineUsers"
          :key="user.user_id"
          class="rounded-lg border border-white/10 px-3 py-2 text-sm"
        >
          {{ user.user }}
          <UBadge v-if="user.primary" size="xs" class="ml-2">
            {{ t("Primary") || "Primary" }}
          </UBadge>
        </div>
      </div>
      <p v-else class="text-sm text-muted">
        {{ t("NoOnlineUsers") || "No online users" }}
      </p>
    </div>

    <div>
      <div class="mb-2 text-sm font-medium">
        {{ t("ShareLink") || "Share link" }}
      </div>
      <UButton
        color="primary"
        variant="soft"
        :disabled="!shareInfo.enableShare || !shareInfo.shareId"
        @click="copyShareURL"
      >
        {{ t("CopyShareURL") || "Copy share URL" }}
      </UButton>
      <p v-if="!shareInfo.enableShare" class="mt-2 text-xs text-muted">
        {{ t("ShareDisabled") || "Sharing is not enabled for this session" }}
      </p>
    </div>
  </div>
</template>
