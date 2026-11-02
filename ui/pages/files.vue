<script setup lang="ts">
import { KokoFileManagement } from "#koko";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

definePageMeta({
  layout: "default",
  keepalive: true
});

const { loggedIn } = storeToRefs(useUserInfoStore());
const workspaceMounted = ref(loggedIn.value);
watch(loggedIn, (value) => {
  if (value) workspaceMounted.value = true;
});
</script>

<template>
  <!-- Existing transfers belong to the file workspace, not the login token. -->
  <KokoFileManagement v-if="loggedIn || (isDesktopRuntime() && workspaceMounted)" global class="h-full min-h-0" />
</template>
