<script setup lang="ts">
import AppConfigProtocolList from "~/components/SettingItems/appConfigProtocolList.vue";

definePageMeta({
  layout: "setting"
});
</script>

<template>
  <AppConfigProtocolList category="terminal" protocol="telnet" />
</template>
