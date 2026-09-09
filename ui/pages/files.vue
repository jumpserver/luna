<script setup lang="ts">
import { KokoFileManagement } from "#koko";
import { useUserInfoStore } from "~/store/modules/userInfo";

definePageMeta({
  layout: "default",
  keepalive: true
});

const { loggedIn } = storeToRefs(useUserInfoStore());
</script>

<template>
  <KokoFileManagement v-if="loggedIn" global class="h-full min-h-0" />
</template>
