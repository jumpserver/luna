<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AssetItem, PermedAccount } from "~/types";

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
const { handleAssetConnection, displayUser, displayProtocol } = useAssetAction();

const handleConnect = (asset: AssetItem) => {
  const protocol = displayProtocol(asset.id, asset.permed_protocols!);
  const selected = displayUser(asset.id, asset.permed_accounts!);
  const accounts = (asset.permed_accounts || []) as PermedAccount[];

  handleAssetConnection(selected, asset.id, protocol, accounts);
};

const columns: TableColumn<AssetItem>[] = [
  {
    accessorKey: "assetName",
    header: () => t("AssetCard.AssetName"),
    cell: ({ row }) => row.original.assetName
  },
  {
    accessorKey: "address",
    header: () => t("AssetCard.Address")
  },
  {
    id: "user",
    header: () => t("AssetCard.User"),
    cell: ({ row }) => displayUser(row.original.id, row.original.permed_accounts!)
  },
  {
    id: "protocol",
    header: () => t("AssetCard.Protocol"),
    cell: ({ row }) => displayProtocol(row.original.id, row.original.permed_protocols!)
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
        }),
        h(UButton, {
          icon: "solar:pen-new-square-linear",
          size: "xs",
          color: "primary",
          variant: "outline",
          onClick: () => emits("openEditModal", row.original)
        })
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
