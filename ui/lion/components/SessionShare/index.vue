<script lang="ts" setup>
import { useI18n } from 'vue-i18n';
import type { Composer } from 'vue-i18n';
import { removeShareUser } from '@/lion/api';
import CardContainer from '@/lion/components/CardContainer/index.vue';
import CreateLink from '@/lion/components/SessionShare/widget/CreateLink.vue';
import UserItem from '@/lion/components/SessionShare/widget/UserItem.vue';

export type TranslateFunction = Composer['t'];

const props = defineProps<{
  session: string;
  users?: Array<{
    user_id: string;
    user: string;
    primary: boolean;
    writable: boolean;
  }>;
  disableCreate?: boolean;
}>();

const { t } = useI18n();
const { addErrorToast } = useErrorToast();

const handleRemoveShareUser = (user: any) => {
  removeShareUser(user)
    .then((res: any) => res.json())
    .then((response) => {
      if (response.message && !response.success) {
        addErrorToast({ title: response.message });
      }
    })
    .catch(() => {
      addErrorToast({ title: t('ShareUserRemoveError') });
    });
};
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <CardContainer>
      <template #custom-header>
        <span class="text-xs-plus">{{ t('OnlineUser') }}</span>
        <UBadge color="success" variant="subtle" class="ml-2">
          {{ props.users?.length || 0 }}
        </UBadge>
      </template>

      <div v-if="props.users?.length" class="mb-4 w-full space-y-2">
        <UserItem
          v-for="currentUser in props.users"
          :key="currentUser.user_id"
          :meta="currentUser"
          :username="currentUser.user"
          :primary="currentUser.primary"
          :writable="currentUser.writable"
          :user-id="currentUser.user_id"
          @remove-user="handleRemoveShareUser"
        />
      </div>
    </CardContainer>

    <CardContainer :title="t('ShareLink')">
      <CreateLink :session="session" :disabled-create-link="props.disableCreate" />
    </CardContainer>
  </div>
</template>
