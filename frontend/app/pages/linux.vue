<script setup lang="ts">
import { useUserSettingStore } from '~/store/modules/userSetting';

const editModalOpen = ref(false);
const selectedCardIndex = ref<number | null>(null);

const providerClearSelection = inject<(callback: () => void) => void>(
  'providerClearSelection'
);

const userSettingStore = useUserSettingStore();

const { componentsConfig } = useAppConfig();
const { layouts } = storeToRefs(userSettingStore);

const handleCardClick = (index: number, event: MouseEvent) => {
  event.stopPropagation();
  selectedCardIndex.value = index;
};

const clearSelectedCard = () => {
  selectedCardIndex.value = null;
};

const mockData = [
  {
    assetName: 'y4',
    address: 'https://y4.cmdb.cc',
    os: 'Ubuntu 22.04',
    user: 'root',
    protocol: 'ssh',
  },
  {
    assetName: 'yy',
    address: 'https://yy.cmdb.cc',
    os: 'CentOS 7.9',
    user: 'root',
    protocol: 'sftp',
  },
  {
    assetName: 'test',
    address: 'https://jumpserver-test.cmdb.cc/',
    os: 'RedHat 8.6',
    user: 'jym',
    protocol: 'sftp',
  },
];

onMounted(() => {
  if (providerClearSelection) {
    providerClearSelection(clearSelectedCard);
  }
});
</script>

<template>
  <div>
    <div
      class="grid grid-cols-[repeat(auto-fit,minmax(504px,1fr))] gap-2 overflow-y-auto p-2"
    >
      <template v-if="layouts === 'grid'">
        <GridCard
          v-for="(item, index) in mockData"
          :key="index"
          :os="item.os"
          :user="item.user"
          :address="item.address"
          :asset-name="item.assetName"
          :protocol="item.protocol"
          :style="{
            borderColor:
              selectedCardIndex === index
                ? componentsConfig.pages.focusColor
                : 'transparent',
          }"
          class="border border-solid"
          @open-edit-modal="editModalOpen = true"
          @click="handleCardClick(index, $event)"
        />
      </template>

      <template v-else>
        <TableCard />
      </template>
    </div>

    <Modal :open="editModalOpen" @update:open="editModalOpen = $event" />
  </div>
</template>
