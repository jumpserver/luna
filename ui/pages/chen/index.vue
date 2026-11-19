<script setup lang="ts">
import ChenSessionState from "~/chen/components/ChenSessionState.vue";
import GoDatabaseSessionSurface from "~/chen/v1/GoDatabaseSessionSurface.vue";
import { chenSelectorFromQuery } from "~/chen/v1/standalone";

definePageMeta({ layout: false });
const route = useRoute();
const { t } = useI18n();
const selector = computed(() => chenSelectorFromQuery(route.query.selector));
useHead({ title: "Chen" });
</script>

<template>
  <div class="h-screen w-screen">
    <GoDatabaseSessionSurface v-if="selector" :key="selector" :selector="selector" />
    <ChenSessionState v-else icon="i-lucide-database" title="Chen" :message="t('Chen.GoV1SelectorRequired')" />
  </div>
</template>
