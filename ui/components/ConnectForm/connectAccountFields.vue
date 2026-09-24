<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import type { AssetPageType, PermedAccount, PersonalAssetCredential } from "~/types/index";
import { resolvePersonalCredentialSecretType } from "~/utils/connection";

const props = defineProps<{
  accounts: PermedAccount[];
  protocol: string;
  assetType?: AssetPageType;
  personalCredentials: PersonalAssetCredential[];
  personalCredentialsLoading?: boolean;
  personalCredentialsLoaded?: boolean;
  personalCredentialsLoadFailed?: boolean;
}>();

const account = defineModel<string>("account", { required: true });
const accountId = defineModel<string>("accountId", { default: "" });
const hostedSecret = defineModel<string>("hostedSecret", { default: "" });
const inputSecretType = defineModel<string>("inputSecretType", { default: "password" });
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
const selectedHostedAccount = computed(() => {
  const hosted = props.accounts.filter((item) => !item.alias.startsWith("@"));
  return (
    hosted.find((item) => accountId.value && item.id === accountId.value) ||
    hosted.find((item) => item.name === account.value)
  );
});
const showHostedSecretArea = computed(
  () => !showManualInputArea.value && !showDynamicUserArea.value && selectedHostedAccount.value?.has_secret === false
);
const selectedAccountValue = computed<string>({
  get: () => selectedHostedAccount.value?.id || account.value,
  set: (value) => {
    const hosted = props.accounts.find((item) => item.id === value && !item.alias.startsWith("@"));
    if (hosted && hosted.name === account.value && hosted.id !== accountId.value) {
      manualPassword.value = "";
      dynamicPassword.value = "";
      hostedSecret.value = "";
      inputSecretType.value = "password";
    }
    account.value = hosted?.name || value || "";
    accountId.value = hosted?.id || "";
  }
});
const isSsh = computed(() => ["ssh", "sftp"].includes(props.protocol.toLowerCase()));
const selectedAccountEntry = computed(() => {
  if (showManualInputArea.value) return props.accounts.find((item) => item.alias === "@INPUT");
  if (showDynamicUserArea.value) return props.accounts.find((item) => item.alias === "@USER");
  return selectedHostedAccount.value;
});
const usingSavedCredential = computed(
  () => showManualInputArea.value && !!personalCredentialId.value && !savePersonalCredential.value
);
const secretType = computed<string>({
  get: () =>
    isSsh.value
      ? inputSecretType.value
      : resolvePersonalCredentialSecretType(props.protocol, selectedAccountEntry.value?.secret_type || "password"),
  set: (value) => {
    inputSecretType.value = value;
  }
});
const showSshKey = computed(() => isSsh.value && secretType.value === "ssh_key" && !usingSavedCredential.value);
const editableSecret = computed<string>({
  get: () =>
    showManualInputArea.value
      ? manualPassword.value
      : showDynamicUserArea.value
        ? dynamicPassword.value
        : hostedSecret.value,
  set: (value) => {
    if (showManualInputArea.value) manualPassword.value = value;
    else if (showDynamicUserArea.value) dynamicPassword.value = value;
    else hostedSecret.value = value;
  }
});
const secretVisible = ref(false);
const keyInput = ref<HTMLInputElement | null>(null);
const keyReadError = ref(false);
let keyReadGeneration = 0;
const readKeyFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const generation = ++keyReadGeneration;
  keyReadError.value = false;
  try {
    const content = await file.text();
    if (generation === keyReadGeneration && showSshKey.value) editableSecret.value = content;
  } catch {
    if (generation === keyReadGeneration) keyReadError.value = true;
  }
};
const manualCredentialChoice = "__manual_input__";

const accountItems = computed(() => {
  const hosted = props.accounts
    .filter((acc) => !acc.alias.includes("@"))
    .map((acc) => ({
      label: acc.name,
      value: acc.id
    }));

  const manual = props.accounts
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

const displayedSecretType = computed(() =>
  usingSavedCredential.value ? personalCredentialSecretType.value : secretType.value
);
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
  secretVisible.value = false;
};

watch(personalCredentialId, (id, previousId) => {
  manualPassword.value = "";
  secretVisible.value = false;
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
  [account, () => props.protocol],
  (current, previous) => {
    secretVisible.value = false;
    keyReadError.value = false;
    keyReadGeneration += 1;
    if (previous && current.some((value, index) => value !== previous[index])) {
      manualPassword.value = "";
      dynamicPassword.value = "";
      hostedSecret.value = "";
      inputSecretType.value = isSsh.value
        ? "password"
        : resolvePersonalCredentialSecretType(props.protocol, selectedAccountEntry.value?.secret_type || "password");
    }
  },
  { immediate: true }
);

watch(
  [account, () => props.accounts],
  () => {
    accountId.value = selectedHostedAccount.value?.id || "";
  },
  { immediate: true }
);

watch(secretType, () => {
  editableSecret.value = "";
  keyReadGeneration += 1;
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField :label="t('EditModal.OptionalAccount')" :ui="formFieldUi" size="md">
      <USelectMenu
        v-model="selectedAccountValue"
        :items="accountItems"
        :disabled="accounts.length === 0"
        :placeholder="accounts.length === 0 ? t('Account.NoAuthorizedAccounts') : undefined"
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
      </div>
    </template>

    <template v-if="showManualInputArea || showDynamicUserArea || showHostedSecretArea">
      <div class="credentials-fields">
        <UFormField
          v-if="isSsh && !usingSavedCredential"
          :label="t('Account.CredentialType')"
          :ui="formFieldUi"
          size="md"
        >
          <USelectMenu
            v-model="secretType"
            :items="[
              { label: t('Account.Password'), value: 'password' },
              { label: t('Account.SshKey'), value: 'ssh_key' }
            ]"
            value-key="value"
            label-key="label"
            :ui="{ base: controlBaseUi, ...overlayMenuUi }"
            size="md"
            class="w-full"
          />
        </UFormField>
        <UFormField v-if="showSshKey" :label="t('Account.SshKey')" :ui="formFieldUi" size="md">
          <UTextarea
            v-model="editableSecret"
            :placeholder="t('Account.PasteSshKey')"
            :rows="5"
            :ui="{ base: controlBaseUi }"
            class="w-full"
            @keydown.enter.stop
          />
          <input ref="keyInput" type="file" class="hidden" accept=".pem,.key,text/plain" @change="readKeyFile" />
          <UButton
            type="button"
            icon="i-lucide-file-up"
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('Account.ChooseSshKeyFile')"
            class="mt-2"
            @click="keyInput?.click()"
          />
          <p v-if="keyReadError" class="mt-1 text-xs text-error">
            {{ t("Account.ReadSshKeyFailed") }}
          </p>
        </UFormField>
        <UFormField
          v-else
          :label="
            displayedSecretType === 'ssh_key'
              ? t('Account.SshKey')
              : displayedSecretType === 'token'
                ? t('Account.Token')
                : t('Account.Password')
          "
          :ui="formFieldUi"
          size="md"
        >
          <UFieldGroup class="w-full">
            <UInput
              v-model="editableSecret"
              :type="secretVisible ? 'text' : 'password'"
              :disabled="usingSavedCredential"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="
                t(
                  usingSavedCredential
                    ? 'Account.UseSavedSecret'
                    : secretType === 'token'
                      ? 'Account.Token'
                      : 'Account.Password'
                )
              "
              :ui="{ base: controlBaseUi, trailing: 'pe-1' }"
              icon="i-lucide-lock-keyhole"
              size="md"
              class="min-w-0 flex-1"
            >
              <template #trailing>
                <UButton
                  v-if="!usingSavedCredential"
                  type="button"
                  :icon="secretVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="t(secretVisible ? 'Account.HidePassword' : 'Account.ShowPassword')"
                  :title="t(secretVisible ? 'Account.HidePassword' : 'Account.ShowPassword')"
                  :aria-pressed="secretVisible"
                  color="neutral"
                  variant="link"
                  size="xs"
                  :ui="{ leadingIcon: 'size-[18px]' }"
                  @click="secretVisible = !secretVisible"
                />
              </template>
            </UInput>
            <UTooltip
              v-if="
                showManualInputArea &&
                (!personalCredentialId || personalCredentialSecretType === 'password') &&
                secretType !== 'ssh_key'
              "
              :text="credentialActionLabel"
              :delay-duration="150"
            >
              <UButton
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
                :disabled="credentialActionDisabled"
                color="neutral"
                variant="ghost"
                size="md"
                :ui="{ leadingIcon: 'size-[18px]' }"
                class="remember-secret-button"
                :class="{ 'remember-secret-button-active': savePersonalCredential }"
                @click="togglePersonalCredentialSave"
              />
            </UTooltip>
            <UButton
              v-if="showDynamicUserArea && secretType !== 'ssh_key'"
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

:deep(input[type="password"]::-ms-reveal) {
  display: none;
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
