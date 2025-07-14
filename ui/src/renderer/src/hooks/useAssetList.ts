import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLoadingBar, useMessage } from 'naive-ui';
import { useUserStore } from '@renderer/store/module/userStore';
import { getAssets, getFavoriteAssets } from '@renderer/api/modals/asset';

import type { Ref } from 'vue';
import type { IListItem, ITypeObject } from '@renderer/components/MainSection/interface';

export function useAssetList(type: string) {
  const { t } = useI18n();
  const message = useMessage();
  const userStore = useUserStore();
  const loadingBar = useLoadingBar();

  const hasMore = ref(true);
  const loadingStatus = ref(true);

  const listData: Ref<IListItem[]> = ref([]);
  const typeObject: Ref<ITypeObject> = ref({});

  switch (type) {
    case 'linux':
      typeObject.value = { type: 'linux' };
      break;
    case 'windows':
      typeObject.value = { type: 'windows' };
      break;
    case 'databases':
      typeObject.value = { category: 'database' };
      break;
    case 'device':
      typeObject.value = { category: 'device' };
      break;
  }

  const params = ref({
    ...typeObject.value,
    offset: 0,
    limit: 20,
    search: '',
    order: userStore.sort
  });

  const handleScroll = async () => {
    if (!hasMore.value || loadingStatus.value) return;

    params.value.offset += 20;
    params.value.order = userStore.sort;

    try {
      await getAssetsFromServer();
    } catch (e) {
      message.error(`${t('Message.ListErrorOccurred')}`, { closable: true });
    }
  };

  const getAssetsFromServer = async (searchInput?: string) => {
    loadingBar.start();

    if (searchInput !== undefined) {
      params.value.offset = 0;
      params.value.search = searchInput;
      params.value.order = userStore.sort;
      hasMore.value = true;
    }

    if (searchInput === 'reset') {
      params.value.offset = 0;
      params.value.search = '';
      params.value.order = userStore.sort;
      listData.value = [];
      hasMore.value = true;
    }

    loadingStatus.value = true;

    try {
      const func = type === 'favorite' ? getFavoriteAssets : getAssets;

      const res = await func(params.value);

      if (res) {
        const { results, count: total } = res;

        if (params.value.offset === 0) {
          listData.value = results;
        } else {
          listData.value = [...listData.value, ...results];
        }

        hasMore.value = listData.value.length < total;
        loadingStatus.value = false;
      } else {
        hasMore.value = false;
        loadingStatus.value = false;

        message.error(`${t('Message.FailedRetrieveAssetDataList')}`, {
          closable: true,
          duration: 5000
        });
      }
    } catch (e) {
      hasMore.value = false;
      loadingStatus.value = false;
    } finally {
      loadingBar.finish();
    }
  };

  // 监听排序变化
  watch(
    () => userStore.sort,
    () => {
      params.value = {
        ...params.value,
        offset: 0,
        order: userStore.sort
      };
      listData.value = [];
      hasMore.value = true;
      getAssetsFromServer('reset');
    }
  );

  // 监听用户信息变化
  watch(
    () => userStore.userInfo,
    userInfo => {
      if (userInfo && userInfo.length === 0) {
        listData.value = [];
        userStore.setSession('');
      } else {
        getAssetsFromServer('reset');
      }
    },
    { immediate: true }
  );

  return {
    hasMore,
    loadingStatus,
    listData,
    handleScroll,
    getAssetsFromServer
  };
}
