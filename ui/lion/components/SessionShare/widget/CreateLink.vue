<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, reactive, ref, watch } from 'vue';
import type { Composer } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import { useClipboard } from '@vueuse/core';
import { useColor } from '@/lion/hooks/useColor';
import { createShareURL } from '@/lion/api';
import { withBaseUrl } from '@/lion/utils/base';

export type TranslateFunction = Composer['t'];

const props = defineProps<{
  session: string;
  disabledCreateLink: boolean;
}>();

const { copy } = useClipboard({ legacy: true });
const getMinuteLabel = (item: number, t: TranslateFunction): string => {
  const minuteLabel = item > 1 ? t('Minutes') : t('Minute');
  return `${item} ${minuteLabel}`;
};

export interface ShareUserOptions {
  id: string;
  name: string;
  username: string;
}

export interface UserInfo {
  id: string;
  name: string;
  username: string;
}

interface ExpiredOption {
  label: string;
  value: number;
  checked: boolean;
}

interface ActionPermOption {
  label: string;
  value: string;
  checked: boolean;
}

const { t } = useI18n();
const { lighten } = useColor();
const toast = useToast();
const shareInfo = ref({
  shareCode: '',
  sessionId: props.session,
  shareId: '',
  shareURL: '',
});
const userOptions = ref<UserInfo[]>([]);
const selectedUserIds = ref<string[]>([]);
const currentQuery = ref<string>('');
const currentPage = ref<number>(1);
const hasMore = ref<boolean>(true);
const searchLoading = ref<boolean>(false);
const showLinkResult = ref<boolean>(false);

const searchUsers = useDebounceFn(async (value: string, isLoadMore: boolean = false) => {
  if (value === '' && !isLoadMore) {
    searchLoading.value = false;
    return;
  }

  if (!isLoadMore || value !== currentQuery.value) {
    currentQuery.value = value;
    currentPage.value = 1;
    userOptions.value = [];
    hasMore.value = true;
  }

  searchLoading.value = true;

  try {
    const params = new URLSearchParams({
      search: currentQuery.value,
      page: currentPage.value.toString(),
      limit: '10',
    });

    const response = await fetch(withBaseUrl(`/api/v1/users/users/suggestions/?${params}`)).then(
      (res: any) => res.json(),
    );

    const newUsers = response.results || response;
    const filterUsers = (users: UserInfo[]) => users.filter((user) => {
      const query = currentQuery.value.toLowerCase();
      return user.name.toLowerCase().includes(query) || user.username.toLowerCase().includes(query);
    });

    userOptions.value = isLoadMore && currentPage.value > 1
      ? [...userOptions.value, ...filterUsers(newUsers)]
      : filterUsers(newUsers);

    hasMore.value = response.next !== null && response.next !== undefined;
  } catch (error) {
    console.error('Search users error:', error);
    toast.add({ title: t('NoUserFound'), color: 'error' });
  } finally {
    searchLoading.value = false;
  }
}, 300);

watch(
  () => shareInfo.value.shareCode,
  (nv) => {
    showLinkResult.value = Boolean(nv);
  },
);

const mappedUserOptions = computed(() =>
  userOptions.value.map((item) => ({
    label: item.username,
    value: item.id,
  })),
);

const createSingleSelectHandler = <T, K extends keyof T>(
  options: T[],
  valueKey: K,
  checkedKey: keyof T,
  onSelect?: (value: T[K]) => void,
) => {
  return (selectedValue: T[K]) => {
    options.forEach((item) => {
      (item as any)[checkedKey] = item[valueKey] === selectedValue;
    });
    onSelect?.(selectedValue);
  };
};

const shareLinkRequest = reactive({
  expiredTime: 10,
  actionPerm: 'writable',
});

const expiredOptions = reactive<ExpiredOption[]>([
  { label: getMinuteLabel(1, t), value: 1, checked: false },
  { label: getMinuteLabel(5, t), value: 5, checked: false },
  { label: getMinuteLabel(10, t), value: 10, checked: true },
  { label: getMinuteLabel(20, t), value: 20, checked: false },
  { label: getMinuteLabel(60, t), value: 60, checked: false },
]);

const actionsPermOptions = reactive<ActionPermOption[]>([
  { label: t('Writable'), value: 'writable', checked: true },
  { label: t('ReadOnly'), value: 'readonly', checked: false },
]);

const debounceSearch = useDebounceFn((query: string) => searchUsers(query, false), 300);
const handleChangeExpired = createSingleSelectHandler(expiredOptions, 'value', 'checked', (value) => {
  shareLinkRequest.expiredTime = value;
});
const handleChangeActionPerm = createSingleSelectHandler(actionsPermOptions, 'value', 'checked', (value) => {
  shareLinkRequest.actionPerm = value;
});

const handleCreateLink = () => {
  if (!shareInfo.value.sessionId) {
    toast.add({ title: t('FailedCreateConnection'), color: 'error' });
    return;
  }

  const users = selectedUserIds.value.map((id) => {
    const user = userOptions.value.find((item) => item.id === id);
    return user || { id, name: id, username: id };
  });

  createShareURL({
    session_id: props.session,
    expired_time: shareLinkRequest.expiredTime,
    users,
    action_perm: shareLinkRequest.actionPerm,
  })
    .then((response: any) => response.json())
    .then((res: any) => {
      if (res.success && !res.success) {
        toast.add({ title: `${t('CreateLinkFailed')}: ${res?.message || ''}`, color: 'error' });
        return;
      }
      shareInfo.value.shareId = res.id;
      shareInfo.value.shareCode = res.verify_code;
      shareInfo.value.shareURL = generateShareURL(res.id, res.verify_code);
    })
    .catch(() => {
      toast.add({ title: t('CreateLinkFailed'), color: 'error' });
    });
};

const generateShareURL = (shareId: string, shareCode: string) => {
  const encodedShareCode = encodeURIComponent(shareCode);
  return withBaseUrl(`/lion/share/${shareId}?code=${encodedShareCode}`);
};

const handleCopyShareURL = () => {
  const url = shareInfo.value.shareURL;
  const shareCode = shareInfo.value.shareCode;
  if (!url || !shareCode) {
    toast.add({ title: t('NoLink'), color: 'error' });
    return;
  }
  const text = `${t('LinkAddr')}: ${url}\n${t('VerifyCode')}: ${shareCode}`;
  copy(text)
    .then(() => toast.add({ title: t('CopyShareURLSuccess'), color: 'info' }))
    .catch((err) => console.log('copy share url err: ', err));
};

const handleBack = () => {
  showLinkResult.value = false;
  shareLinkRequest.expiredTime = 10;
  shareLinkRequest.actionPerm = 'writable';
  selectedUserIds.value = [];
};
</script>

<template>
  <div v-if="!showLinkResult" class="space-y-4">
    <div>
      <div class="mb-2 text-xs-plus">{{ t('ExpiredTime') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in expiredOptions"
          :key="item.value"
          type="button"
          class="rounded-md border px-4 py-2 text-xs-plus"
          :style="{ borderColor: item.checked ? lighten(20) : undefined }"
          @click="handleChangeExpired(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <UDivider />

    <div>
      <div class="mb-2 text-xs-plus">{{ t('ActionPerm') }}</div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="item in actionsPermOptions"
          :key="item.value"
          type="button"
          class="rounded-md border px-4 py-2 text-xs-plus"
          :style="{ borderColor: item.checked ? lighten(20) : undefined }"
          @click="handleChangeActionPerm(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <UDivider />

    <div>
      <div class="mb-2 text-xs-plus">{{ t('ShareUser') }}</div>
      <UInput
        :placeholder="t('GetShareUser')"
        class="mb-2"
        @update:model-value="(value) => debounceSearch(String(value ?? ''))"
        @focus="debounceSearch('')"
      />
      <USelectMenu
        v-model="selectedUserIds"
        multiple
        searchable
        :items="mappedUserOptions"
        value-key="value"
        label-key="label"
        :loading="searchLoading"
        :placeholder="t('GetShareUser')"
        class="w-full"
      />
    </div>

    <UDivider />

    <UButton block :disabled="disabledCreateLink" @click="handleCreateLink">
      {{ t('CreateLink') }}
    </UButton>
  </div>

  <div v-else class="space-y-4">
    <UInput :model-value="shareInfo.shareURL" readonly placeholder="Link">
      <template #leading>
        <UIcon name="i-lucide-link" class="size-3.5" />
      </template>
    </UInput>

    <UCard>
      <div class="flex flex-col items-center gap-2 py-4 text-center">
        <span>{{ t('VerifyCode') }}</span>
        <span class="text-2xl tracking-widest">{{ shareInfo.shareCode }}</span>
      </div>
    </UCard>

    <div class="grid grid-cols-2 gap-2">
      <UButton icon="i-lucide-copy" color="success" variant="soft" block @click="handleCopyShareURL">
        {{ t('CopyLink') }}
      </UButton>
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" block @click="handleBack">
        {{ t('Back') }}
      </UButton>
    </div>
  </div>
</template>
