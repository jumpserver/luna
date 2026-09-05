<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import type { AssetPageType, PermedAccount, PersonalAssetCredential } from "~/types/index";

const props = defineProps<{
  accounts: PermedAccount[];
  assetType?: AssetPageType;
  personalCredentials: PersonalAssetCredential[];
  personalCredentialsLoading?: boolean;
  personalCredentialsLoaded?: boolean;
  personalCredentialsLoadFailed?: boolean;
}>();

const account = defineModel<string>("account", { required: true });
const manualUsername = defineModel<string>("manualUsername", { default: "" });
const manualPassword = defineModel<string>("manualPassword", { default: "" });
const personalCredentialId = defineModel<string>("personalCredentialId", { default: "" });
const personalCredentialVersion = defineModel<number | undefined>("personalCredentialVersion");
const personalCredentialSecretType = defineModel<string>("personalCredentialSecretType", { default: "password" });
const savePersonalCredential = defineModel<boolean>("savePersonalCredential", { default: false });
const dynamicPassword = defineModel<string>("dynamicPassword", { default: "" });
const rememberSecret = defineModel<boolean>("rememberSecret", { default: false });

const { t } = useI18n();
const { formFieldUi, controlBaseUi, overlayMenuUi } = useConnectFormAppearance();

const showManualInputArea = computed(
  () =>
    account.value === "@INPUT" ||
    account.value === t("Account.ManualInput") ||
    account.value === "手动输入" ||
    account.value === "Manual input"
);
const showDynamicUserArea = computed(
  () =>
    account.value === "@USER" ||
    account.value.startsWith(t("Account.DynamicUser")) ||
    account.value.includes("同名账号") ||
    account.value.includes("Dynamic user")
);
const manualPasswordVisible = ref(false);
const dynamicPasswordVisible = ref(false);
const manualCredentialChoice = "__manual_input__";

const accountItems = computed(() => {
  const filteredAnonymous = props.accounts.filter((item) => {
    return item.alias !== "@ANON" || props.assetType?.toLowerCase() === "web";
  });

  const hosted = filteredAnonymous
    .filter((acc) => !acc.alias.includes("@"))
    .map((acc) => ({
      label: acc.name,
      value: acc.name
    }));

  const manual = filteredAnonymous
    .filter((acc) => acc.alias.includes("@"))
    .map((acc) => {
      if (acc.alias === "@USER") {
        const base = t("Account.DynamicUser");
        const username = acc.username || "";
        const text = username ? `${base}(${username})` : base;
        return { label: text, value: text };
      }

      if (acc.alias === "@INPUT") {
        const text = t("Account.ManualInput");
        return { label: text, value: text };
      }

      if (acc.alias === "@ANON") {
        const text = t("Account.Anonymous");
        return { label: text, value: "@ANON" };
      }

      return { label: acc.name, value: acc.name };
    });

  const items: SelectMenuItem[] = [];

  if (hosted.length > 0) {
    items.push({ type: "label", label: t("Account.Hosted") });
    items.push(...hosted);
  }

  if (manual.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push({ type: "label", label: t("Account.Manual") });
    items.push(...manual);
  }

  return items;
});

const personalCredentialItems = computed<SelectMenuItem[]>(() => [
  {
    label: t("Account.ManualOtherAccount"),
    value: manualCredentialChoice
  },
  ...props.personalCredentials.map((credential) => {
    const accountLabel = t("Account.SavedAccount", { username: credential.username });
    const secretType = credential.secret_type;
    const secretTypeLabel =
      typeof secretType === "string"
        ? secretType === "password"
          ? t("Account.Password")
          : secretType.replace(/_/g, " ")
        : secretType.label;
    return {
      label: `${accountLabel} · ${secretTypeLabel}`,
      value: credential.id
    };
  })
]);

const selectedPersonalCredential = computed(() =>
  props.personalCredentials.find((credential) => credential.id === personalCredentialId.value)
);

const selectedCredentialChoice = computed<string>({
  get: () => personalCredentialId.value || manualCredentialChoice,
  set: (value) => {
    personalCredentialId.value = value === manualCredentialChoice ? "" : value || "";
  }
});

const usingSavedCredential = computed(() => !!personalCredentialId.value && !savePersonalCredential.value);
const credentialActionLabel = computed(() => {
  if (!personalCredentialId.value) return t("Account.SaveAsPersonalCredential");
  return savePersonalCredential.value
    ? t("Account.CancelPersonalCredentialUpdate")
    : t("Account.UpdatePersonalCredential");
});
const credentialActionDisabled = computed(
  () => !!personalCredentialId.value && personalCredentialVersion.value === undefined
);

const resolveSecretType = (credential: PersonalAssetCredential) => {
  const secretType = credential.secret_type;
  return typeof secretType === "string" ? secretType : secretType?.value || "password";
};

const togglePersonalCredentialSave = () => {
  savePersonalCredential.value = !savePersonalCredential.value;
  manualPassword.value = "";
  manualPasswordVisible.value = false;
};

watch(personalCredentialId, (id, previousId) => {
  manualPassword.value = "";
  manualPasswordVisible.value = false;
  savePersonalCredential.value = false;
  if (!id) {
    if (previousId) manualUsername.value = "";
    personalCredentialVersion.value = undefined;
    personalCredentialSecretType.value = "password";
  }
});

watch(
  [selectedPersonalCredential, () => props.personalCredentialsLoaded],
  ([credential, loaded]) => {
    if (credential) {
      manualUsername.value = credential.username;
      personalCredentialVersion.value = credential.version;
      personalCredentialSecretType.value = resolveSecretType(credential);
      return;
    }
    if (loaded && personalCredentialId.value) {
      personalCredentialId.value = "";
      personalCredentialVersion.value = undefined;
      personalCredentialSecretType.value = "password";
    }
  },
  { immediate: true }
);

watch(
  account,
  () => {
    manualPasswordVisible.value = false;
    dynamicPasswordVisible.value = false;
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField :label="t('EditModal.OptionalAccount')" :ui="formFieldUi" size="md">
      <USelectMenu
        v-model="account"
        :items="accountItems"
        value-key="value"
        label-key="label"
        :ui="{
          base: controlBaseUi,
          ...overlayMenuUi
        }"
        icon="i-lucide-id-card"
        trailing-icon="i-lucide-chevrons-up-down"
        size="md"
        class="w-full"
      />
    </UFormField>

    <template v-if="showManualInputArea">
      <div class="credentials-fields">
        <UFormField :label="t('Account.PersonalCredential')" :ui="formFieldUi" size="md">
          <USelectMenu
            v-model="selectedCredentialChoice"
            :items="personalCredentialItems"
            value-key="value"
            label-key="label"
            :loading="personalCredentialsLoading"
            :ui="{
              base: controlBaseUi,
              ...overlayMenuUi
            }"
            icon="i-lucide-key-round"
            trailing-icon="i-lucide-chevrons-up-down"
            size="md"
            class="w-full"
          />
          <p v-if="personalCredentialsLoadFailed" class="mt-1 text-xs text-warning">
            {{ t("Account.LoadPersonalCredentialsFailed") }}
          </p>
        </UFormField>

        <UFormField :label="t('Account.Username')" :ui="formFieldUi" size="md">
          <UInput
            v-model="manualUsername"
            :disabled="!!personalCredentialId"
            autocapitalize="none"
            autocorrect="off"
            :placeholder="t('Account.Username')"
            :ui="{ base: controlBaseUi }"
            icon="i-lucide-user-round"
            size="md"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('Account.Password')" :ui="formFieldUi" size="md">
          <UFieldGroup class="w-full">
            <UInput
              v-model="manualPassword"
              :type="manualPasswordVisible ? 'text' : 'password'"
              :disabled="usingSavedCredential"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="t(usingSavedCredential ? 'Account.UseSavedPassword' : 'Account.Password')"
              :ui="{ base: controlBaseUi, trailing: 'pe-1' }"
              icon="i-lucide-lock-keyhole"
              size="md"
              class="min-w-0 flex-1"
            >
              <template v-if="!usingSavedCredential" #trailing>
                <UButton
                  type="button"
                  :icon="manualPasswordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="t(manualPasswordVisible ? 'Account.HidePassword' : 'Account.ShowPassword')"
                  :title="t(manualPasswordVisible ? 'Account.HidePassword' : 'Account.ShowPassword')"
                  :aria-pressed="manualPasswordVisible"
                  color="neutral"
                  variant="link"
                  size="xs"
                  :ui="{ leadingIcon: 'size-[18px]' }"
                  @click="manualPasswordVisible = !manualPasswordVisible"
                />
              </template>
            </UInput>
            <UButton
              v-if="!personalCredentialId || personalCredentialSecretType === 'password'"
              type="button"
              :icon="
                personalCredentialId
                  ? savePersonalCredential
                    ? 'i-lucide-x'
                    : 'i-lucide-refresh-cw'
                  : savePersonalCredential
                    ? 'i-lucide-bookmark-check'
                    : 'i-lucide-bookmark'
              "
              :aria-label="credentialActionLabel"
              :title="credentialActionLabel"
              :disabled="credentialActionDisabled"
              color="neutral"
              variant="ghost"
              size="md"
              :ui="{ leadingIcon: 'size-[18px]' }"
              class="remember-secret-button"
              :class="{ 'remember-secret-button-active': savePersonalCredential }"
              @click="togglePersonalCredentialSave"
            />
          </UFieldGroup>
        </UFormField>
      </div>
    </template>

    <template v-if="showDynamicUserArea">
      <div class="credentials-fields">
        <UFormField :label="t('Account.Password')" :ui="formFieldUi" size="md">
          <UFieldGroup class="w-full">
            <UInput
              v-model="dynamicPassword"
              :type="dynamicPasswordVisible ? 'text' : 'password'"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="t('Account.Password')"
              :ui="{ base: controlBaseUi, trailing: 'pe-1' }"
              icon="i-lucide-lock-keyhole"
              size="md"
              class="min-w-0 flex-1"
            >
              <template #trailing>
                <UButton
                  type="button"
                  :icon="dynamicPasswordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="t(dynamicPasswordVisible ? 'Account.HidePassword' : 'Account.ShowPassword')"
                  :title="t(dynamicPasswordVisible ? 'Account.HidePassword' : 'Account.ShowPassword')"
                  :aria-pressed="dynamicPasswordVisible"
                  color="neutral"
                  variant="link"
                  size="xs"
                  :ui="{ leadingIcon: 'size-[18px]' }"
                  @click="dynamicPasswordVisible = !dynamicPasswordVisible"
                />
              </template>
            </UInput>
            <UButton
              type="button"
              :icon="rememberSecret ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
              :aria-label="t('Account.RememberPassword')"
              :title="t('Account.RememberPassword')"
              color="neutral"
              variant="ghost"
              size="md"
              :ui="{ leadingIcon: 'size-[18px]' }"
              class="remember-secret-button"
              :class="{ 'remember-secret-button-active': rememberSecret }"
              @click="rememberSecret = !rememberSecret"
            />
          </UFieldGroup>
        </UFormField>
      </div>
    </template>
  </div>
</template>

<style scoped>
.credentials-fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.remember-secret-button {
  height: 32px;
  background: var(--app-input-bg);
  color: var(--app-text-muted);
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.remember-secret-button:hover {
  background: var(--app-hover-soft);
  color: var(--app-fg);
}

.remember-secret-button-active {
  background: var(--app-selected-soft);
  color: var(--theme-accent);
}

.remember-secret-button-active:hover {
  background: var(--app-selected-soft);
  color: var(--theme-accent);
}
</style>
