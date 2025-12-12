<script setup lang="ts">
import AppConfigProtocolList from "~/components/SettingItems/appConfigProtocolList.vue";

definePageMeta({
  layout: "setting"
});
</script>

<template>
  <AppConfigProtocolList category="remotedesktop" protocol="rdp" />
</template>
