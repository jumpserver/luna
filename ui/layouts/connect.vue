<script lang="ts" setup>
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";

const route = useRoute();
const { isMacOS } = usePlatform();
const isSessionWindow = computed(() => route.path.startsWith("/session/"));
</script>

<template>
  <div class="flex h-dvh w-full flex-col overflow-hidden" :style="{ backgroundColor: 'var(--app-main-bg)' }">
    <HeaderDesktopTitleBar v-if="isSessionWindow && !isMacOS" :show-menus="false">
      <WorkspaceTabHeader standalone />
    </HeaderDesktopTitleBar>
    <HeaderDesktopTitleBar v-else :show-menus="false" />
    <header
      v-if="isDesktopRuntime() && isMacOS && !isSessionWindow"
      data-desktop-drag-region
      class="flex h-8 min-h-8 items-center px-20 text-xs font-medium"
    >
      <span class="truncate">JumpServer</span>
    </header>
    <WorkspaceTopHeader v-if="isSessionWindow && (!isDesktopRuntime() || isMacOS)" :show-actions="false">
      <div class="h-full" :class="isMacOS ? 'pl-20' : ''">
        <WorkspaceTabHeader standalone />
      </div>
    </WorkspaceTopHeader>
    <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
    </div>
    <KokoSftpTransferCenter />
  </div>
</template>
