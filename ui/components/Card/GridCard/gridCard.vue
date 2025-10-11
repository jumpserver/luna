<script setup lang="ts">
import type { ContextMenuItem } from "@nuxt/ui";
import type { PermedAccount, PermedProtocol } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface DetailRow {
  key: string;
  title: string;
  content: string;
  popover?: boolean;
  class?: string;
}

const props = withDefaults(
  defineProps<{
    zone: string;
    user: string;
    assetId: string;
    address: string;
    iconName: string;
    protocol: string;
    assetName: string;
    highlight: boolean;
    isActive: boolean;
    accounts?: PermedAccount[];
    protocols?: PermedProtocol[];
  }>(),
  {
    accounts: () => [],
    protocols: () => []
  }
);

const emits = defineEmits<{
  (e: "openEditModal"): void;
}>();

const { t, locale } = useI18n();
const userInfoStore = useUserInfoStore();
const { handleAssetConnection } = useAssetAction();

const { currentConnectionInfoMap } = storeToRefs(userInfoStore);

const openEditModal = () => {
  emits("openEditModal");
};

const showEdit = ref(false);
const items = ref<ContextMenuItem[][]>([
  [
    {
      label: t("ContextMenu.Connect"),
      icon: "i-lucide-unplug"
    },
    {
      label: t("ContextMenu.Edit"),
      icon: "i-lucide-pencil",
      onSelect: openEditModal
    },
    {
      label: t("ContextMenu.MoreConnect"),
      icon: "i-lucide-plug",
      children: [
        {
          label: `${t("ContextMenu.Use")} SSH`
        },
        {
          label: `${t("ContextMenu.Use")} SFTP`
        }
      ]
    },
    {
      label: t("ContextMenu.Rename"),
      icon: "i-lucide-pencil"
    },
    {
      label: t("ContextMenu.Favorite"),
      icon: "i-lucide-star"
    }
  ]
]);

const handleMouseEnter = () => {
  showEdit.value = true;
};

const handleMouseLeave = () => {
  showEdit.value = false;
};

const displayProtocol = computed(() => {
  const saved = currentConnectionInfoMap.value[props.assetId];
  return saved?.protocol ?? props.protocol;
});

const displayUser = computed(() => {
  const saved = currentConnectionInfoMap.value[props.assetId];
  return saved?.username ?? props.user;
});

const labelMinWidth = computed(() => (locale.value.startsWith("zh") ? "24px" : "72px"));

const _labelColumnTemplate = computed(() => `minmax(${labelMinWidth.value}, max-content) 1fr`);

const _detailRows = computed(() => {
  const list: Array<DetailRow> = [
    {
      key: "address",
      title: t("AssetCard.Address"),
      content: props.address,
      popover: true,
      class: "max-w-40"
    },
    {
      key: "user",
      title: t("AssetCard.User"),
      content: displayUser.value
    },
    {
      key: "protocol",
      title: t("AssetCard.Protocol"),
      content: displayProtocol.value
    }
  ];

  return list;
});

const handleConnect = () => {
  handleAssetConnection(props.user, props.assetId, displayProtocol.value, props.accounts || []);
};
</script>

<template>
  <UPageCard
    class="w-full page-card border-solid border-red-500"
    variant="subtle"
    highlight-color="primary"
    :highlight="highlight"
    :ui="{
      body: 'p-1 ',
      container: 'p-2 sm:p-2 '
    }"
  >
    <UContextMenu
      size="sm"
      :items="items"
      :ui="{
        content: 'w-48'
      }"
    >
      <section
        class="flex items-center w-full p-3"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <UAvatar
            size="lg"
            :icon="iconName"
            :ui="{ root: 'rounded-md', icon: 'size-7' }"
            class="flex-shrink-0"
          />

          <div class="flex-1 min-w-0 overflow-hidden w-[120px]">
            <div class="text-sm font-bold truncate whitespace-nowrap">
              {{ assetName }}
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400 truncate whitespace-nowrap">
              {{ address }}
            </div>
          </div>
        </div>

        <div class="flex-shrink-0 ml-2">
          <UButton
            size="xs"
            color="primary"
            variant="solid"
            class="group gap-0 btn-appstore px-2"
            :disabled="!isActive"
            @click="handleConnect"
          >
            Connect
          </UButton>

          <!-- <UButton
            icon="solar:pen-new-square-linear"
            size="xs"
            color="primary"
            variant="outline"
            @click="openEditModal"
          /> -->
        </div>
      </section>
    </UContextMenu>
  </UPageCard>
</template>
