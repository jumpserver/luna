<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { PermOrgItem } from "~/types/index";

import { invalidatePersonalAssetCredentialCache } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { getOrganizationAvatarText } from "~/utils/organization";

withDefaults(
  defineProps<{
    selectable?: boolean;
  }>(),
  {
    selectable: true
  }
);

const userInfoStore = useUserInfoStore();
const { setCurrentOrg } = userInfoStore;
const { loggedIn, currentOrganizations, currentUser } = storeToRefs(userInfoStore);

const currentOrgName = computed(() => {
  const currentOrg = currentUser.value?.org;
  return currentOrganizations.value.find((org) => org.id === currentOrg?.id)?.name || currentOrg?.name || "";
});
const currentOrgAvatarText = computed(() => getOrganizationAvatarText(currentOrgName.value));

const organizationDropdownItems = computed<DropdownMenuItem[]>(() =>
  currentOrganizations.value.map((org: PermOrgItem) => ({
    label: org.name,
    type: "checkbox" as const,
    checked: org.id === currentUser.value?.org?.id,
    onUpdateChecked: (checked: boolean) => {
      if (checked) handleOrgChange(org);
    }
  }))
);

/**
 * @description 切换组织
 * @param org
 */
function handleOrgChange(org: PermOrgItem) {
  if (org.id === currentUser.value?.org?.id) return;

  invalidatePersonalAssetCredentialCache();
  setCurrentOrg(org);
}
</script>

<template>
  <div v-show="loggedIn" class="flex w-full min-w-0 max-w-full items-center gap-1">
    <UAvatar
      :alt="currentOrgName"
      :text="currentOrgAvatarText"
      color="primary"
      size="xs"
      class="shrink-0"
      :ui="{ root: 'rounded-md', fallback: 'uppercase' }"
    />
    <UDropdownMenu
      v-if="selectable"
      size="sm"
      :items="organizationDropdownItems"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{
        content: 'w-44 max-h-64 overflow-y-auto p-1',
        item: 'mx-0 px-2 py-1.5 rounded-md leading-5 transition-colors duration-150',
        itemLabel: 'text-xs'
      }"
    >
      <UButton
        variant="ghost"
        size="sm"
        color="neutral"
        data-workspace-tour="organization"
        class="h-7 min-w-0 w-fit max-w-full py-0 pr-1.5 pl-1"
        :ui="{
          base: 'flex items-center justify-start gap-1.5 rounded-md bg-transparent transition-colors hover:bg-black/5 focus:bg-transparent active:bg-transparent data-[state=open]:bg-black/[0.06] dark:hover:bg-white/8 dark:data-[state=open]:bg-white/10'
        }"
      >
        <span
          data-overflow-tooltip
          class="min-w-0 truncate text-left text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          {{ currentOrgName }}
        </span>
        <UIcon name="i-lucide-chevrons-up-down" class="size-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
      </UButton>
    </UDropdownMenu>
    <span
      v-else
      data-workspace-tour="organization"
      data-overflow-tooltip
      class="min-w-0 truncate px-1 text-left text-xs font-medium text-gray-700 dark:text-gray-300"
    >
      {{ currentOrgName }}
    </span>
  </div>
</template>
