<script setup lang="ts">
import type { ContextMenuItem } from "@nuxt/ui";
import type { PermedAccount, PermedProtocol } from "~/types/index";

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
const { handleAssetConnection, displayUser, displayProtocol, handleAssetFavorite } =
  useAssetAction();

const showEdit = ref(false);

const contextMenuItems = computed<ContextMenuItem[][]>(() => {
  const protocols = (props.protocols || []).map((p: PermedProtocol) => p.name);
  const uniqueProtocols = Array.from(new Set(protocols));

  const moreConnectChildren: ContextMenuItem[] = uniqueProtocols.map((name: string) => ({
    label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
    onClick: () => handleConnect(name)
  }));

  return [
    [
      {
        label: t("ContextMenu.QuickConnect"),
        icon: "i-lucide-unplug",
        onClick: () => handleConnect()
      },
      {
        label: t("ContextMenu.MoreConnect"),
        icon: "i-lucide-plug",
        children: [moreConnectChildren]
      },
      {
        label: t("ContextMenu.Rename"),
        icon: "i-lucide-pencil"
      },
      {
        label: t("ContextMenu.Favorite"),
        icon: "i-lucide-star",
        onClick: () => handleAssetFavorite(props.assetId)
      }
    ]
  ];
});

const detailRows = computed(() => {
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
      content: displayUser(props.assetId, props.accounts)
    },
    {
      key: "protocol",
      title: t("AssetCard.Protocol"),
      content: displayProtocol(props.assetId, props.protocols!)
    }
  ];

  return list;
});

const labelMinWidth = computed(() => (locale.value.startsWith("zh") ? "24px" : "72px"));

const labelColumnTemplate = computed(() => `minmax(${labelMinWidth.value}, max-content) 1fr`);

function handleConnect(protocolOverride?: string) {
  handleAssetConnection(
    props.user,
    props.assetId,
    displayProtocol(props.assetId, props.protocols!),
    props.accounts || [],
    protocolOverride
  );
}

const openEditModal = () => {
  emits("openEditModal");
};

const handleMouseEnter = () => {
  showEdit.value = true;
};

const handleMouseLeave = () => {
  showEdit.value = false;
};
</script>

<template>
  <UPageCard
    class="w-full page-card"
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
      :items="contextMenuItems"
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
            @click="handleConnect()"
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
