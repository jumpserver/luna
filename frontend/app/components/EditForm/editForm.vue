<script setup lang="ts">
import type { PermedAccount, PermedProtocol } from '~/types/index';

const props = defineProps<{
  accounts: PermedAccount[];
  protocols: PermedProtocol[];
  protocol: string;
  account: string;
}>();

const emits = defineEmits<{
  (e: 'update:protocol', v: string): void;
  (e: 'update:account', v: string): void;
}>();

const { t } = useI18n();

const protocolItems = computed(() => props.protocols.map(p => p.name));
const accountItems = computed(() => props.accounts.map(a => a.username));

const selectedProtocol = computed<string>({
  get: () => props.protocol,
  set: (v) => emits('update:protocol', v ?? ''),
});

const selectedAccount = computed<string>({
  get: () => props.account,
  set: (v) => emits('update:account', v ?? ''),
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField :label="t('EditModal.OptionalProtocol')" size="md">
      <USelect
        v-model="selectedProtocol"
        :items="protocolItems"
        class="w-full"
      />
    </UFormField>

    <UFormField :label="t('EditModal.OptionalAccount')" size="md">
      <USelect
        v-model="selectedAccount"
        :items="accountItems"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
