<script setup lang="ts">
import { createReusableTemplate } from "@vueuse/core";

defineProps<{
  title: string;
  inline?: boolean;
  closable?: boolean;
}>();

const { t } = useI18n();
const appConfig = useAppConfig();
const { openModal, loginBtn, browserAuthUrl, backToLogin, closeLoginDialog } = useDesktopLogin();
const [DefinePanel, ReusePanel] = createReusableTemplate();

function updateOpen(open: boolean) {
  if (open) openModal.value = true;
  else closeLoginDialog();
}
</script>

<template>
  <DefinePanel>
    <UCard
      variant="outline"
      class="relative my-auto w-full max-w-md shrink-0"
      :ui="{
        root: `${appConfig.ui.modal.slots.content} ${inline ? 'desktop-login-card ring-0' : ''}`,
        header: `${appConfig.ui.modal.slots.header} pe-4 sm:pe-6 ${inline ? 'bg-transparent' : ''}`,
        body: `${appConfig.ui.modal.slots.body} ${inline ? 'bg-transparent' : ''}`
      }"
    >
      <template v-if="!browserAuthUrl" #header>
        <component :is="inline ? 'h1' : 'h2'" class="min-w-0 flex-1 text-base leading-5 font-semibold text-(--app-fg)">
          {{ title }}
        </component>
        <UButton
          v-if="closable"
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          class="shrink-0 p-0 text-muted hover:text-highlighted"
          :aria-label="t('Common.Close')"
          :disabled="loginBtn"
          @click="closeLoginDialog"
        />
      </template>
      <UButton
        v-if="closable && browserAuthUrl"
        icon="i-lucide-x"
        color="neutral"
        variant="link"
        class="absolute top-4 right-4 p-0 text-muted hover:text-highlighted sm:top-6 sm:right-6"
        :aria-label="t('Common.Close')"
        :disabled="loginBtn"
        @click="closeLoginDialog"
      />
      <DesktopLoginForm v-show="!browserAuthUrl" :inline="inline" />
      <DesktopBrowserLogin v-if="browserAuthUrl" :url="browserAuthUrl" :busy="loginBtn" @back="backToLogin" />
    </UCard>
  </DefinePanel>

  <ReusePanel v-if="inline" />
  <UModal
    v-else
    :open="openModal"
    :title="title"
    :dismissible="Boolean(closable) && !loginBtn"
    :close="false"
    :ui="{ content: 'max-w-md divide-y-0 bg-transparent shadow-none ring-0' }"
    @update:open="updateOpen"
  >
    <template #content>
      <ReusePanel />
    </template>
  </UModal>
</template>
