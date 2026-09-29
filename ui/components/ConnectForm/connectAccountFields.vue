<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import type { AssetPageType, PermedAccount, PersonalAssetCredential } from "~/types/index";
import { resolvePersonalCredentialSecretType } from "~/utils/connection";

const props = defineProps<{
  accounts: PermedAccount[];
  protocol?: string;
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
const personalAccountPrefix = "personal:";
const supportsManualInput = computed(() => props.accounts.some((item) => item.alias === "@INPUT"));

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
  if (showManualInputArea.value || showDynamicUserArea.value) return;
  const hosted = props.accounts.filter((item) => !item.alias.startsWith("@"));
  return (
    hosted.find((item) => accountId.value && item.id === accountId.value) ||
    hosted.find((item) => item.name === account.value)
  );
});
const showHostedSecretArea = computed(
  () =>
    !!props.protocol &&
    !showManualInputArea.value &&
    !showDynamicUserArea.value &&
    selectedHostedAccount.value?.has_secret === false
);
let keyReadGeneration = 0;
const enteredSecrets = new Map<string, string>();
const selectedAccountValue = computed<string>({
  get: () =>
    showManualInputArea.value
      ? personalCredentialId.value
        ? `${personalAccountPrefix}${personalCredentialId.value}`
        : t("Account.ManualInput")
      : selectedHostedAccount.value?.id || account.value,
  set: (value) => {
    if (value?.startsWith(personalAccountPrefix)) {
      const credential = props.personalCredentials.find((item) => `${personalAccountPrefix}${item.id}` === value);
      if (!credential || !supportsManualInput.value) return;
      account.value = "@INPUT";
      accountId.value = "";
      personalCredentialId.value = credential.id;
      return;
    }
    personalCredentialId.value = "";
    const hosted = props.accounts.find((item) => item.id === value && !item.alias.startsWith("@"));
    if (hosted && hosted.name === account.value && hosted.id !== accountId.value) {
      enteredSecrets.clear();
      keyReadGeneration += 1;
      manualPassword.value = "";
      dynamicPassword.value = "";
      hostedSecret.value = "";
      inputSecretType.value = "password";
    }
    account.value = hosted?.name || value || "";
    accountId.value = hosted?.id || "";
  }
});
const isSsh = computed(() => ["ssh", "sftp"].includes(props.protocol?.toLowerCase() || ""));
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
    showManualInputArea.value
      ? resolvePersonalCredentialSecretType(props.protocol || "", personalCredentialSecretType.value)
      : isSsh.value
        ? inputSecretType.value
        : resolvePersonalCredentialSecretType(
            props.protocol || "",
            selectedAccountEntry.value?.secret_type || "password"
          ),
  set: (value) => {
    if (showManualInputArea.value) personalCredentialSecretType.value = value;
    else inputSecretType.value = value;
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
const resolveSecretType = (credential: PersonalAssetCredential) => {
  const secretType = credential.secret_type;
  return typeof secretType === "string" ? secretType : secretType?.value || "password";
};
const accountItems = computed(() => {
  const hosted = props.accounts
    .filter((acc) => !acc.alias.startsWith("@"))
    .map((acc) => ({
      label: acc.name,
      value: acc.id
    }));

  const virtual = props.accounts
    .filter((acc) => acc.alias.startsWith("@"))
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

  if (virtual.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push({ type: "label", label: t("Account.Virtual") });
    items.push(...virtual);
  }

  if (supportsManualInput.value && props.personalCredentials.length) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push({ type: "label", label: t("Account.Personal") });
    items.push(
      ...props.personalCredentials.map((credential) => {
        const type = resolveSecretType(credential);
        const typeLabel =
          type === "ssh_key" ? t("Account.SshKey") : type === "token" ? t("Account.Token") : t("Account.Password");
        return {
          label: `${credential.username} · ${typeLabel}`,
          value: `${personalAccountPrefix}${credential.id}`,
          icon: type === "ssh_key" ? "i-lucide-key-round" : "i-lucide-lock-keyhole"
        };
      })
    );
  }

  return items;
});

const selectedPersonalCredential = computed(() =>
  props.personalCredentials.find((credential) => credential.id === personalCredentialId.value)
);

const credentialSaveLabel = computed(() =>
  t(personalCredentialId.value ? "Account.UpdatePersonalCredential" : "Account.SaveAsPersonalCredential")
);
const credentialSaveDisabled = computed(
  () => !!personalCredentialId.value && personalCredentialVersion.value === undefined
);

watch(personalCredentialId, (id, previousId) => {
  enteredSecrets.clear();
  keyReadGeneration += 1;
  keyReadError.value = false;
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
      enteredSecrets.clear();
      manualPassword.value = "";
      dynamicPassword.value = "";
      hostedSecret.value = "";
      if (showManualInputArea.value && !personalCredentialId.value) {
        personalCredentialSecretType.value = resolvePersonalCredentialSecretType(props.protocol || "");
      }
      inputSecretType.value = isSsh.value
        ? "password"
        : resolvePersonalCredentialSecretType(
            props.protocol || "",
            selectedAccountEntry.value?.secret_type || "password"
          );
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

watch(secretType, (type, previousType) => {
  enteredSecrets.set(previousType, editableSecret.value);
  editableSecret.value = enteredSecrets.get(type) || "";
  secretVisible.value = false;
  keyReadError.value = false;
  keyReadGeneration += 1;
});

watch(usingSavedCredential, (usingSaved) => {
  keyReadGeneration += 1;
  if (usingSaved) {
    enteredSecrets.clear();
    manualPassword.value = "";
  }
});

onBeforeUnmount(() => {
  keyReadGeneration += 1;
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField :label="t('EditModal.OptionalAccount')" :ui="formFieldUi" size="md">
      <USelectMenu
        v-model="selectedAccountValue"
        :items="accountItems"
        :loading="personalCredentialsLoading"
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
      <p v-if="personalCredentialsLoadFailed" class="mt-1 text-xs text-warning">
        {{ t("Account.LoadPersonalCredentialsFailed") }}
      </p>
    </UFormField>

    <UFormField
      v-if="showManualInputArea && !personalCredentialId"
      :label="t('Account.Username')"
      :ui="formFieldUi"
      size="md"
    >
      <UInput
        v-model="manualUsername"
        autocapitalize="none"
        autocorrect="off"
        :placeholder="t('Account.Username')"
        :ui="{ base: controlBaseUi }"
        icon="i-lucide-user-round"
        size="md"
        class="w-full"
      />
    </UFormField>

    <template v-if="showManualInputArea || showDynamicUserArea || showHostedSecretArea">
      <div class="credentials-fields">
        <UFormField
          :label="
            secretType === 'ssh_key'
              ? t('Account.SshKey')
              : secretType === 'token'
                ? t('Account.Token')
                : t('Account.Password')
          "
          :ui="{ ...formFieldUi, labelWrapper: 'justify-start gap-2', hint: 'flex-1' }"
          size="md"
        >
          <template v-if="isSsh || showManualInputArea" #hint>
            <span class="flex items-center gap-1">
              <UButton
                v-if="isSsh && (!showManualInputArea || !personalCredentialId)"
                type="button"
                icon="i-lucide-arrow-left-right"
                :label="t(secretType === 'ssh_key' ? 'Account.Password' : 'Account.SshKey')"
                :aria-label="`${t('Account.CredentialType')}: ${t(secretType === 'ssh_key' ? 'Account.Password' : 'Account.SshKey')}`"
                color="neutral"
                variant="ghost"
                size="xs"
                class="h-6 gap-1 px-1.5 font-normal text-[var(--app-text-muted)]"
                @click="secretType = secretType === 'ssh_key' ? 'password' : 'ssh_key'"
              />
              <!-- Give the checkbox its own form field so it does not share the secret input's ID. -->
              <UFormField v-if="showManualInputArea" class="ms-auto w-auto">
                <UCheckbox
                  v-model="savePersonalCredential"
                  :label="credentialSaveLabel"
                  :disabled="credentialSaveDisabled"
                  icon="i-lucide-check"
                  size="xs"
                  :ui="{ label: 'font-normal text-[var(--app-text-muted)]' }"
                  @update:model-value="secretVisible = false"
                />
              </UFormField>
            </span>
          </template>
          <template v-if="showSshKey">
            <UTextarea
              v-model="editableSecret"
              :placeholder="t('Account.PasteSshKey')"
              :rows="3"
              :ui="{ base: [controlBaseUi, 'h-auto font-mono text-xs'], trailing: 'inset-y-1 pe-1' }"
              class="w-full"
              @keydown.enter.stop
            >
              <template #trailing>
                <UButton
                  type="button"
                  icon="i-lucide-file-up"
                  :aria-label="t('Account.ChooseSshKeyFile')"
                  :title="t('Account.ChooseSshKeyFile')"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="h-6 w-6 justify-center text-[var(--app-text-muted)]"
                  @click="keyInput?.click()"
                />
              </template>
            </UTextarea>
            <input ref="keyInput" type="file" class="hidden" accept=".pem,.key,.txt,text/plain" @change="readKeyFile" />
            <p v-if="keyReadError" class="mt-1 text-xs text-error">
              {{ t("Account.ReadSshKeyFailed") }}
            </p>
          </template>
          <UFieldGroup v-else class="w-full">
            <UInput
              v-model="editableSecret"
              :type="secretVisible ? 'text' : 'password'"
              :disabled="usingSavedCredential"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="
                t(
                  usingSavedCredential
                    ? 'Account.UseSavedPassword'
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
