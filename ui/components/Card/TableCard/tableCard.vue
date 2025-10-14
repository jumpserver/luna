<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AssetItem } from "~/types";
import { h, resolveComponent } from "vue";

const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem, event: MouseEvent): void;
}>();

const props = defineProps<{
  items: AssetItem[];
}>();

const { t } = useI18n();
const { displayUser, displayProtocol } = useAssetAction();


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
      h("div", { class: "flex gap-2" }, [
        h(UButton, {
          size: "xs",
          color: "primary",
          variant: "outline",
          label: t("Common.Connect"),
          onClick: () => emits("connectAsset", row.original)
        }),
        h(UButton, {
          icon: "i-lucide-ellipsis",
          size: "xs",
          color: "primary",
          variant: "outline",
          "data-table-context-button": true,
          onClick: (event: MouseEvent) => emits("contextTrigger", row.original, event)
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
