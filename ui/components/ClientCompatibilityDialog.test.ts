import ts from "typescript";
import { expect, it } from "vitest";
import { computed, ref } from "vue";
import messages from "../../i18n/locales/en.json";
import source from "./ClientCompatibilityDialog.vue?raw";

const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

it.each([
  ["5.1.0", "v5.1.0"],
  ["v5.1.0", "v5.1.0"],
  [" v5.1.0 ", "v5.1.0"],
  ["5.1.1-rc1+build.9", "v5.1.1-rc1+build.9"],
  ["v5.1.0-lts+build.1", "v5.1.0-lts+build.1"]
])("displays a single v prefix for %s without changing release suffixes", (version, expected) => {
  const scope = {
    computed,
    useI18n: () => ({
      t: (key: string, values: Record<string, string> = {}) => {
        const message = messages.ClientCompatibility[key.split(".")[1] as keyof typeof messages.ClientCompatibility];
        return message.replace(/\{(\w+)\}/g, (_match, name) => values[name] || "");
      }
    }),
    useToast: () => ({ add() {} }),
    useClientCompatibility: () => ({
      blocked: ref({
        status: "incompatible",
        clientVersion: version,
        minClientVersion: version,
        coreVersion: version,
        minCoreVersion: version,
        failures: ["client-too-old", "core-too-old"]
      }),
      dismiss() {},
      retry() {},
      download() {}
    })
  };
  const description = new Function(...Object.keys(scope), `${outputText}; return description;`)(
    ...Object.values(scope)
  );
  expect(description.value).toBe(
    `Client ${expected} is too old. This site requires ${expected} or later.\n` +
      `Core ${expected} is too old. Contact your administrator to upgrade to ${expected} or later.`
  );
});
