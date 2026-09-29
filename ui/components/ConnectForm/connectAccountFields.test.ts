import type { ComputedRef, Ref, WritableComputedRef } from "vue";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { resolvePersonalCredentialSecretType } from "~/utils/connection";
import source from "./connectAccountFields.vue?raw";

const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nkey-data\n-----END OPENSSH PRIVATE KEY-----";
const account = {
  id: "root-account",
  alias: "root",
  name: "root",
  username: "root",
  has_secret: false,
  has_username: true,
  secret_type: "password",
  date_expired: "",
  actions: []
};

function mountFields(selected = "@INPUT", protocol = "ssh") {
  const models = Vue.reactive({
    account: selected,
    accountId: selected === "root" ? account.id : "",
    hostedSecret: "",
    inputSecretType: "password",
    manualUsername: "root",
    manualPassword: "",
    personalCredentialId: "",
    personalCredentialVersion: undefined as number | undefined,
    personalCredentialSecretType: "password",
    savePersonalCredential: false,
    dynamicPassword: "",
    rememberSecret: false
  });
  const props = Vue.reactive({
    protocol,
    accounts: [account, { ...account, id: "", alias: "@INPUT" }, { ...account, id: "", alias: "@USER" }],
    personalCredentials: [] as Record<string, unknown>[],
    personalCredentialsLoaded: false
  });
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "account-fields" });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  const globals = {
    computed: Vue.computed,
    ref: Vue.ref,
    watch: Vue.watch,
    onBeforeUnmount: Vue.onBeforeUnmount,
    useI18n: () => ({ t: (key: string) => key }),
    useConnectFormAppearance: () => ({})
  };
  const component = new Function(
    "require",
    ...Object.keys(globals),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => (name === "vue" ? Vue : { resolvePersonalCredentialSecretType }), ...Object.values(globals));
  let state!: {
    secretType: WritableComputedRef<string>;
    editableSecret: WritableComputedRef<string>;
    selectedAccountValue: WritableComputedRef<string>;
    accountItems: ComputedRef<{ type?: string; label?: string; value?: string; icon?: string }[]>;
    showSshKey: ComputedRef<boolean>;
    showHostedSecretArea: ComputedRef<boolean>;
    usingSavedCredential: ComputedRef<boolean>;
    keyReadError: Ref<boolean>;
    readKeyFile: (event: Event) => Promise<void>;
    credentialSaveLabel: ComputedRef<string>;
  };
  const setup = component.setup;
  component.setup = (props: unknown, context: unknown) => {
    state = setup(props, context);
    return () => null;
  };
  const renderer = Vue.createRenderer({
    insert() {},
    remove() {},
    patchProp() {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null
  });
  const app = renderer.createApp({
    render: () =>
      Vue.h(component, {
        ...props,
        ...models,
        ...Object.fromEntries(
          Object.keys(models).map((key) => [
            `onUpdate:${key}`,
            (value: unknown) => Object.assign(models, { [key]: value })
          ])
        )
      })
  });
  app.mount({});
  return { state, models, props, unmount: () => app.unmount() };
}

function fileEvent(text: () => Promise<string>) {
  return { target: { files: [{ text }], value: "id_rsa" } } as unknown as Event;
}

describe("grouped account selection", () => {
  it.each(["ssh", "sftp"])("selects a personal account from the hosted account list for %s", async (protocol) => {
    const { state, models, props, unmount } = mountFields("root", protocol);
    try {
      props.personalCredentials = [
        { id: "saved-password", username: "root", secret_type: "password", version: 2 },
        { id: "saved-key", username: "root", secret_type: { value: "ssh_key" }, version: 3 }
      ];
      props.personalCredentialsLoaded = true;
      await Vue.nextTick();
      expect(state.accountItems.value.filter((item) => item.type === "label").map((item) => item.label)).toEqual([
        "Account.Hosted",
        "Account.Virtual",
        "Account.Personal"
      ]);
      expect(state.accountItems.value.filter((item) => item.value?.startsWith("personal:"))).toEqual([
        { label: "root · Account.Password", value: "personal:saved-password", icon: "i-lucide-lock-keyhole" },
        { label: "root · Account.SshKey", value: "personal:saved-key", icon: "i-lucide-key-round" }
      ]);
      state.editableSecret.value = "previous-hosted-password";
      await Vue.nextTick();
      state.selectedAccountValue.value = "personal:saved-key";
      await Vue.nextTick();
      expect(models).toMatchObject({
        account: "@INPUT",
        accountId: "",
        personalCredentialId: "saved-key",
        personalCredentialVersion: 3,
        personalCredentialSecretType: "ssh_key",
        manualUsername: "root",
        manualPassword: "",
        hostedSecret: "",
        savePersonalCredential: false
      });
      expect(state.selectedAccountValue.value).toBe("personal:saved-key");
      expect(state.usingSavedCredential.value).toBe(true);

      models.savePersonalCredential = true;
      await Vue.nextTick();
      state.editableSecret.value = privateKey;
      await Vue.nextTick();
      state.selectedAccountValue.value = "personal:saved-password";
      await Vue.nextTick();
      expect(models).toMatchObject({
        personalCredentialId: "saved-password",
        personalCredentialVersion: 2,
        personalCredentialSecretType: "password",
        manualPassword: "",
        savePersonalCredential: false
      });

      state.selectedAccountValue.value = "Account.ManualInput";
      await Vue.nextTick();
      expect(models).toMatchObject({
        personalCredentialId: "",
        personalCredentialVersion: undefined,
        manualUsername: "",
        personalCredentialSecretType: "password"
      });
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      expect(state.editableSecret.value).toBe("");
      state.selectedAccountValue.value = "root-account";
      await Vue.nextTick();
      expect(models.accountId).toBe("root-account");
      expect(state.usingSavedCredential.value).toBe(false);
    } finally {
      unmount();
    }
  });

  it("excludes personal accounts when manual input is not authorized", async () => {
    const { state, models, props, unmount } = mountFields("root");
    try {
      props.accounts = [account];
      props.personalCredentials = [{ id: "saved-key", username: "root", secret_type: "ssh_key", version: 3 }];
      await Vue.nextTick();
      expect(state.accountItems.value.some((item) => item.label === "Account.Personal")).toBe(false);
      state.selectedAccountValue.value = "personal:saved-key";
      await Vue.nextTick();
      expect(models.accountId).toBe("root-account");
      expect(models.personalCredentialId).toBe("");
    } finally {
      unmount();
    }
  });

  it("returns to the manual input label if the selected personal account no longer exists", async () => {
    const { state, models, props, unmount } = mountFields();
    try {
      props.personalCredentials = [{ id: "saved-key", username: "root", secret_type: "ssh_key", version: 3 }];
      props.personalCredentialsLoaded = true;
      await Vue.nextTick();
      state.selectedAccountValue.value = "personal:saved-key";
      await Vue.nextTick();
      props.personalCredentials = [];
      await Vue.nextTick();
      expect(models.personalCredentialId).toBe("");
      expect(models.manualUsername).toBe("");
      expect(state.selectedAccountValue.value).toBe("Account.ManualInput");
    } finally {
      unmount();
    }
  });
});

describe("SSH credentials in the connection form", () => {
  it.each([
    ["ssh", "@INPUT"],
    ["ssh", "@USER"],
    ["ssh", "root"],
    ["sftp", "@INPUT"],
    ["sftp", "@USER"],
    ["sftp", "root"]
  ])("accepts pasted and file-loaded keys for %s/%s", async (protocol, selected) => {
    const { state, models, unmount } = mountFields(selected, protocol);
    try {
      if (selected === "root") expect(state.showHostedSecretArea.value).toBe(true);
      state.editableSecret.value = "password";
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      expect(state.showSshKey.value).toBe(true);
      expect(state.editableSecret.value).toBe("");
      state.editableSecret.value = privateKey;
      await Vue.nextTick();
      expect(
        selected === "@INPUT"
          ? models.manualPassword
          : selected === "@USER"
            ? models.dynamicPassword
            : models.hostedSecret
      ).toBe(privateKey);

      state.secretType.value = "password";
      await Vue.nextTick();
      expect(state.editableSecret.value).toBe("password");
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      expect(state.editableSecret.value).toBe(privateKey);

      const event = fileEvent(async () => `${privateKey}\n`);
      await state.readKeyFile(event);
      await Vue.nextTick();
      expect(state.editableSecret.value).toBe(`${privateKey}\n`);
      expect((event.target as HTMLInputElement).value).toBe("");
    } finally {
      unmount();
    }
  });

  it.each(["account", "protocol", "unmount"])("ignores a late key file after %s changes", async (change) => {
    const { state, models, props, unmount } = mountFields();
    try {
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      let resolve!: (value: string) => void;
      const reading = state.readKeyFile(
        fileEvent(
          () =>
            new Promise((done) => {
              resolve = done;
            })
        )
      );
      if (change === "account") models.account = "@USER";
      else if (change === "protocol") props.protocol = "rdp";
      else unmount();
      await Vue.nextTick();
      if (change !== "unmount") {
        models.account = "@INPUT";
        props.protocol = "ssh";
        await Vue.nextTick();
        state.secretType.value = "ssh_key";
        await Vue.nextTick();
      }
      resolve(privateKey);
      await reading;
      await Vue.nextTick();
      expect(models.manualPassword).toBe("");
      expect(models.dynamicPassword).toBe("");
    } finally {
      unmount();
    }
  });

  it("shows file read errors and accepts a retry", async () => {
    const { state, unmount } = mountFields();
    try {
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      await state.readKeyFile(
        fileEvent(async () => {
          throw new Error("unreadable");
        })
      );
      expect(state.keyReadError.value).toBe(true);
      await state.readKeyFile(fileEvent(async () => privateKey));
      await Vue.nextTick();
      expect(state.keyReadError.value).toBe(false);
      expect(state.editableSecret.value).toBe(privateKey);
    } finally {
      unmount();
    }
  });

  it("resets the manual credential type when changing protocols or accounts", async () => {
    const { state, models, props, unmount } = mountFields();
    try {
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      state.editableSecret.value = privateKey;
      await Vue.nextTick();
      props.protocol = "rdp";
      await Vue.nextTick();
      expect(state.secretType.value).toBe("password");
      expect(state.showSshKey.value).toBe(false);
      expect(models.manualPassword).toBe("");

      props.protocol = "ssh";
      await Vue.nextTick();
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      models.account = "@USER";
      await Vue.nextTick();
      models.account = "@INPUT";
      await Vue.nextTick();
      expect(state.secretType.value).toBe("password");
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      expect(state.editableSecret.value).toBe("");
    } finally {
      unmount();
    }
  });

  it("clears key drafts and pending file reads for hosted accounts with the same name", async () => {
    const { state, models, props, unmount } = mountFields("root");
    try {
      props.accounts.push({ ...account, id: "other-root-account" });
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      state.editableSecret.value = privateKey;
      await Vue.nextTick();
      let resolve!: (value: string) => void;
      const reading = state.readKeyFile(
        fileEvent(
          () =>
            new Promise((done) => {
              resolve = done;
            })
        )
      );
      state.selectedAccountValue.value = "other-root-account";
      await Vue.nextTick();
      state.secretType.value = "ssh_key";
      await Vue.nextTick();
      resolve(privateKey);
      await reading;
      await Vue.nextTick();
      expect(models.accountId).toBe("other-root-account");
      expect(state.editableSecret.value).toBe("");
    } finally {
      unmount();
    }
  });

  it("updates a saved SSH key and clears the entered key when the update is cancelled", async () => {
    const { state, models, props, unmount } = mountFields();
    try {
      props.personalCredentials = [{ id: "saved-key", username: "root", secret_type: "ssh_key", version: 3 }];
      models.personalCredentialId = "saved-key";
      await Vue.nextTick();
      expect(state.secretType.value).toBe("ssh_key");
      expect(state.usingSavedCredential.value).toBe(true);
      expect(state.showSshKey.value).toBe(false);
      expect(state.credentialSaveLabel.value).toBe("Account.UpdatePersonalCredential");
      models.savePersonalCredential = true;
      await Vue.nextTick();
      expect(state.credentialSaveLabel.value).toBe("Account.UpdatePersonalCredential");
      expect(state.showSshKey.value).toBe(true);
      state.editableSecret.value = privateKey;
      await Vue.nextTick();
      models.savePersonalCredential = false;
      await Vue.nextTick();
      expect(models.manualPassword).toBe("");
      expect(models.personalCredentialVersion).toBe(3);
    } finally {
      unmount();
    }
  });
});
