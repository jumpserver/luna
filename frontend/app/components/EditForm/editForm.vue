<script setup lang="ts">
import type { PermedAccount, PermedProtocol } from '~/types/index';

const props = defineProps<{
  account: string;
  protocol: string;
  accounts: PermedAccount[];
  protocols: PermedProtocol[];
}>();

const emits = defineEmits<{
  (e: 'update:protocol', v: string): void;
  (e: 'update:account', v: string): void;
}>();

const { t, locale } = useI18n();
// prettier-ignore
const trailingIcon = "group-data-[state=open]:rotate-180 transition-transform duration-200";

const showManualInputArea = ref(false);
const showDynamicUserArea = ref(false);

watch(
  () => props.account,
  (newVal) => {
    console.log(newVal);
    handleSpecialAccount(newVal);
  },
  { immediate: true }
);

const protocolItems = computed(() =>
  props.protocols.map((p: PermedProtocol) => p.name)
);

const accountItems = computed(() => {
  // 过滤匿名账号
  const filteredAnonymous = props.accounts.filter(
    (a: PermedAccount) => a.alias !== '@ANON'
  );

  // 账号分组
  const hosted = filteredAnonymous
    .filter((acc: PermedAccount) => !acc.alias.includes('@'))
    .map((acc: PermedAccount) => {
      return acc.name;
    });
  const manual = filteredAnonymous
    .filter((acc: PermedAccount) => acc.alias.includes('@'))
    .map((acc: PermedAccount) => {
      if (acc.alias === '@USER') {
        return locale.value === 'zh'
          ? `${acc.name}(${acc.username})`
          : `Dynamic user(${acc.username})`;
      }
      if (acc.alias === '@INPUT') {
        return locale.value === 'zh' ? acc.name : 'Manual input';
      }

      return acc.name;
    });

  return [
    { type: 'label', label: t('Account.Hosted') },
    ...hosted,
    { type: 'separator' },
    { type: 'label', label: t('Account.Manual') },
    ...manual,
  ];
});

const selectedProtocol = computed<string>({
  get: () => props.protocol,
  set: (v: string) => emits('update:protocol', v ?? ''),
});

const selectedAccount = computed<string>({
  get: () => props.account,
  set: (v: string) => emits('update:account', v ?? ''),
});

function handleSpecialAccount(v: string) {
  showManualInputArea.value = false;
  showDynamicUserArea.value = false;

  if (v === '手动输入' || v === 'Manual input') {
    showManualInputArea.value = true;
  }

  if (v.includes('同名账号') || v.includes('Dynamic user')) {
    showDynamicUserArea.value = true;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField :label="t('EditModal.OptionalProtocol')" size="md">
      <USelect
        v-model="selectedProtocol"
        :items="protocolItems"
        :ui="{
          trailingIcon,
        }"
        icon="mingcute:plugin-line"
        variant="subtle"
        class="w-full"
      />
    </UFormField>

    <UFormField :label="t('EditModal.OptionalAccount')" size="md">
      <USelectMenu
        v-model="selectedAccount"
        :items="accountItems"
        :ui="{
          trailingIcon,
        }"
        icon="lucide:user-round"
        variant="subtle"
        class="w-full"
        @update:model-value="handleSpecialAccount"
      />
    </UFormField>

    <template v-if="showManualInputArea">
      <UFormField :label="t('Account.Username')" size="md">
        <UInput placeholder="Enter your email" />
      </UFormField>

      <UFormField :label="t('Account.Password')" size="md">
        <UInput placeholder="Enter your email" />
      </UFormField>
    </template>

    <template v-if="showDynamicUserArea">
      <UFormField :label="t('Account.Password')" size="md">
        <UInput placeholder="Enter your email" />
      </UFormField>
    </template>
  </div>
</template>
