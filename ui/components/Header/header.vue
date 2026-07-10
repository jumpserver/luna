<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const route = useRoute();
const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const showSidebarChrome = computed(() => activeWorkspaceMode.value !== "assets" || loggedIn.value);

const pageHeader = computed(() => {
  const path = route.path.toLowerCase();

  if (path.includes("/videoplayer")) {
    return {
      icon: "lucide:clapperboard",
      title: t("Menu.Player")
    };
  }

  if (path.includes("/tools")) {
    return {
      icon: "lucide:menu",
      title: t("Menu.Tool")
    };
  }

  if (path.includes("/transcode")) {
    return {
      icon: "lucide:repeat-2",
      title: t("Transcode.Title")
    };
  }

  return null;
});
</script>

<template>
  <WorkspaceTopHeader>
    <template v-if="showSidebarChrome" #leading>
      <SideBarTopControls />
    </template>

    <WorkspaceTabHeader v-if="activeWorkspaceMode === 'assets'" />

    <div v-else-if="pageHeader" class="h-full min-w-0 flex items-center gap-2 px-4">
      <UIcon :name="pageHeader.icon" class="text-primary h-4 w-4 shrink-0" />
      <span class="min-w-0 truncate text-sm font-medium">
        {{ pageHeader.title }}
      </span>
    </div>
  </WorkspaceTopHeader>
</template>
