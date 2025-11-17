<script setup lang="ts">
import type { PermedAccount, PermedProtocol } from "~/types/index";
import type { SelectMenuItem } from "@nuxt/ui";

const props = defineProps<{
  account: string;
  protocol: string;
  accounts: PermedAccount[];
  protocols: PermedProtocol[];
  manualUsername?: string;
  manualPassword?: string;
  dynamicPassword?: string;
  rememberSecret?: boolean;
}>();

const emits = defineEmits<{
  (e: "update:protocol", v: string): void;
  (e: "update:account", v: string): void;
  (e: "update:manualUsername", v: string): void;
  (e: "update:manualPassword", v: string): void;
  (e: "update:dynamicPassword", v: string): void;
  (e: "update:rememberSecret", v: boolean): void;
}>();

const { t, locale } = useI18n();
// prettier-ignore
const trailingIcon = "group-data-[state=open]:rotate-180 transition-transform duration-200";

const showManualInputArea = ref(false);
const showDynamicUserArea = ref(false);

const localManualUsername = computed<string>({
  get: () => props.manualUsername || "",
  set: (v: string) => emits("update:manualUsername", v ?? "")
});

const localManualPassword = computed<string>({
  get: () => props.manualPassword || "",
  set: (v: string) => emits("update:manualPassword", v ?? "")
});

const localDynamicPassword = computed<string>({
  get: () => props.dynamicPassword || "",
  set: (v: string) => emits("update:dynamicPassword", v ?? "")
});

const localRememberSecret = computed<boolean>({
  get: () => props.rememberSecret || false,
  set: (v: boolean) => emits("update:rememberSecret", !!v)
});

watch(
  () => props.account,
  (newVal) => {
    handleSpecialAccount(newVal || "");
  },
  { immediate: true }
);

const protocolItems = computed(() => props.protocols.map((p: PermedProtocol) => p.name));

const accountItems = computed(() => {
  // 过滤匿名账号
  const filteredAnonymous = props.accounts.filter((a: PermedAccount) => a.alias !== "@ANON");

  // 账号分组
  const hosted = filteredAnonymous
    .filter((acc: PermedAccount) => !acc.alias.includes("@"))
    .map((acc: PermedAccount) => {
      return acc.name;
    });

  const manual = filteredAnonymous
    .filter((acc: PermedAccount) => acc.alias.includes("@"))
    .map((acc: PermedAccount) => {
      if (acc.alias === "@USER") {
        const base = t("Account.DynamicUser");
        const username = acc.username || "";
        return username ? `${base}(${username})` : base;
      }

      if (acc.alias === "@INPUT") {
        return t("Account.ManualInput");
      }

      return acc.name;
    });

  return [
    { type: "label", label: t("Account.Hosted") },
    ...hosted,
    { type: "separator" },
    { type: "label", label: t("Account.Manual") },
    ...manual
  ] as SelectMenuItem[];
});

const selectedProtocol = computed<string>({
  get: () => props.protocol,
  set: (v: string) => emits("update:protocol", v ?? "")
});

const selectedAccount = computed<string>({
  get: () => props.account,
  set: (v: string) => emits("update:account", v ?? "")
});

function handleSpecialAccount(v: string) {
  showManualInputArea.value = false;
  showDynamicUserArea.value = false;

  if (v === "手动输入" || v === "Manual input") {
    showManualInputArea.value = true;
  }

  if (v.includes("同名账号") || v.includes("Dynamic user")) {
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
          trailingIcon
        }"
        icon="mingcute:plugin-line"
        class="w-full"
      />
    </UFormField>

    <UFormField :label="t('EditModal.OptionalAccount')" size="md">
      <USelectMenu
        v-model="selectedAccount"
        :items="accountItems"
        :ui="{
          trailingIcon
        }"
        icon="lucide:user-round"
        class="w-full"
      />
    </UFormField>

    <template v-if="showManualInputArea">
      <UFormField :label="t('Account.Username')" size="md">
        <UInput
          v-model="localManualUsername"
          autocapitalize="none"
          autocorrect="off"
          :placeholder="t('Account.Username')"
        />
      </UFormField>

      <UFormField :label="t('Account.Password')" size="md">
        <UInput
          v-model="localManualPassword"
          type="password"
          autocapitalize="none"
          autocorrect="off"
          :placeholder="t('Account.Password')"
        />
      </UFormField>

      <div class="flex justify-end items-center w-full">
        <USwitch v-model="localRememberSecret" :label="t('Account.RememberPassword')" />
      </div>
    </template>

    <template v-if="showDynamicUserArea">
      <UFormField :label="t('Account.Password')" size="md">
        <UInput
          v-model="localDynamicPassword"
          type="password"
          autocapitalize="none"
          autocorrect="off"
          :placeholder="t('Account.Password')"
        />
      </UFormField>
    </template>
  </div>
</template>
