<script lang="ts" setup>
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import { shouldShowSessionTabStrip } from "~/composables/useSessionWindowConnect";

const route = useRoute();
const { isMacOS } = usePlatform();
const { focusMode, nativeFullscreen } = useWorkspaceTabs();
useWorkspaceFullscreenShortcuts();
useWorkspaceSessionShortcuts();
const isSessionWindow = computed(() => route.path.startsWith("/session/"));
const showSessionTabs = computed(() => shouldShowSessionTabStrip(route.path, route.query));
const showSessionTabChrome = computed(() => showSessionTabs.value && !focusMode.value);
const macTrafficLightInset = computed(() => isDesktopRuntime() && isMacOS.value && !nativeFullscreen.value);
</script>

<template>
  <div class="flex h-dvh w-full flex-col overflow-hidden" :style="{ backgroundColor: 'var(--app-main-bg)' }">
    <HeaderDesktopTitleBar v-if="isSessionWindow && !isMacOS" :show-menus="false">
      <WorkspaceTabHeader v-if="showSessionTabChrome" standalone />
      <template v-if="showSessionTabChrome" #trailing>
        <HeaderActionButtons :show-profile="false" />
      </template>
    </HeaderDesktopTitleBar>
    <HeaderDesktopTitleBar v-else :show-menus="false" />
    <header
      v-if="isDesktopRuntime() && isMacOS && !isSessionWindow"
      data-desktop-drag-region
      class="flex h-8 min-h-8 items-center px-20 text-xs font-medium"
    >
      <span class="truncate">JumpServer</span>
    </header>
    <WorkspaceTopHeader v-if="showSessionTabChrome && (!isDesktopRuntime() || isMacOS)" :show-profile="false">
      <div class="h-full" :class="macTrafficLightInset ? 'pl-20' : ''">
        <WorkspaceTabHeader standalone />
      </div>
    </WorkspaceTopHeader>
    <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
    </div>
    <KokoSftpTransferCenter />
  </div>
</template>
