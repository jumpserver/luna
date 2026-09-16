<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";
import { workspaceAiEnabled } from "~/shared/aiAvailability";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = withDefaults(defineProps<{ showProfile?: boolean }>(), { showProfile: true });

const { t } = useI18n();
const { loggedIn } = storeToRefs(useUserInfoStore());
const { activeWorkspaceMode, isUtilityRoute } = useWorkspaceMode();
const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();
const { open: aiPanelOpen, toggleAi } = useAiPanel();
const showAiButton = computed(() => loggedIn.value && !isUtilityRoute.value);
const showRightPanelButton = computed(
  () => loggedIn.value && !isUtilityRoute.value && activeWorkspaceMode.value !== "files"
);

const aiButtonLabel = computed(() =>
  t(
    !workspaceAiEnabled.value ? "RightPanel.AIDisabled" : aiPanelOpen.value ? "RightPanel.AIClose" : "RightPanel.AIOpen"
  )
);
const headerIconButtonClass =
  "grid size-6 shrink-0 place-items-center rounded-lg p-0 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]";
const headerIconButtonActiveClass = "bg-[var(--app-hover-soft)] text-[var(--app-fg)]";

const handleToggleAi = () => {
  toggleAi();
};
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1.5 px-2">
      <UTooltip v-if="showAiButton" arrow :text="aiButtonLabel">
        <UButton
          data-ai-context="preserve"
          :aria-label="aiButtonLabel"
          :aria-pressed="aiPanelOpen"
          :disabled="!workspaceAiEnabled"
          size="sm"
          color="neutral"
          variant="ghost"
          class="ai-launcher"
          :class="[headerIconButtonClass, aiPanelOpen ? headerIconButtonActiveClass : '']"
          @click="handleToggleAi"
        >
          <template #leading>
            <span class="relative block size-4.5" aria-hidden="true">
              <UIcon name="i-lucide-sparkle" class="absolute inset-0 size-4.5" />
              <UIcon name="i-lucide-sparkle" class="ai-launcher-twinkle absolute right-0 top-0 size-1.5" />
              <UIcon name="i-lucide-sparkle" class="ai-launcher-twinkle absolute bottom-0 left-0 size-1.5" />
            </span>
          </template>
        </UButton>
      </UTooltip>

      <Profile v-if="props.showProfile" />

      <UTooltip v-if="showRightPanelButton" arrow :text="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')">
        <UButton
          :icon="rightPanelOpen ? 'i-proicons-panel-right-contract' : 'i-proicons-panel-right'"
          :aria-label="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
          :aria-pressed="rightPanelOpen"
          size="sm"
          color="neutral"
          variant="ghost"
          :class="[headerIconButtonClass, rightPanelOpen ? headerIconButtonActiveClass : '']"
          :ui="{ leadingIcon: 'm-0 size-4.5' }"
          @click="toggleRightPanel"
        />
      </UTooltip>
    </div>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .ai-launcher:not(:disabled):hover .ai-launcher-twinkle,
  .ai-launcher:not(:disabled):focus-visible .ai-launcher-twinkle {
    animation: ai-star-twinkle 600ms ease-in-out;
  }
}

@keyframes ai-star-twinkle {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(0.9);
  }
}
</style>
