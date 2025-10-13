<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AssetItem } from "~/types";

import { h, resolveComponent } from "vue";

const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");

const emits = defineEmits<{
  (e: "openEditModal", asset: AssetItem): void;
}>();

const props = defineProps<{
  items: AssetItem[];
}>();

const { t } = useI18n();
const { getAssetDetail, displayUser, displayProtocol } = useAssetAction();

const handleConnect = (asset: AssetItem) => {
  getAssetDetail(asset.id);
};

const columns: TableColumn<AssetItem>[] = [
  {
    accessorKey: "assetName",
    header: () => t("AssetCard.AssetName"),
    cell: ({ row }) => row.original.name
  },
  {
    accessorKey: "address",
    header: () => t("AssetCard.Address")
  },
  {
    id: "user",
    header: () => t("AssetCard.User"),
    cell: ({ row }) => displayUser(row.original.id, row.original.permedAccounts!)
  },
  {
    id: "protocol",
    header: () => t("AssetCard.Protocol"),
    cell: ({ row }) => displayProtocol(row.original.id, row.original.permedProtocols!)
  },
  {
    id: "status",
    header: () => t("AssetCard.Status"),
    cell: ({ row }) =>
      h(
        UBadge,
        {
          variant: "subtle",
          color: row.original.isActive ? "success" : "error"
        },
        () => (row.original.isActive ? t("Common.Active") : t("Common.Inactive"))
      )
  },
  {
    id: "actions",
    header: () => t("AssetCard.Actions"),
    cell: ({ row }) =>
      h("div", { class: "flex  gap-2" }, [
        h(UButton, {
          icon: "heroicons:rocket-launch",
          size: "xs",
          color: "primary",
          variant: "outline",
          onClick: () => handleConnect(row.original)
        })
        // h(UButton, {
        //   icon: "solar:pen-new-square-linear",
        //   size: "xs",
        //   color: "primary",
        //   variant: "outline",
        //   onClick: () => emits("openEditModal", row.original)
        // })
      ])
  }
];
</script>

<template>
  <UCard variant="outline" class="w-full">
    <UTable
      sticky
      :data="props.items"
      :columns="columns"
      class="flex-1"
      :ui="{ tr: 'hover:bg-muted/50' }"
    />
  </UCard>
</template>
