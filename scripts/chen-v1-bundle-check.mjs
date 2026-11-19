// Run after web:generate or generate:client. Nuxt's ambient types can hide
// missing runtime auto-imports; inspect the emitted JavaScript's actual scope.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ESLint } from "eslint";
import * as vue from "vue";

const directory = path.resolve(process.argv[2] || ".output/public/_nuxt");
const helpers = new Set([...Object.keys(vue).filter((name) => typeof vue[name] === "function"), "useI18n"]);
const lint = new ESLint({
  overrideConfigFile: true,
  ignore: false,
  overrideConfig: [{ languageOptions: { ecmaVersion: "latest", sourceType: "module" }, rules: { "no-undef": "error" } }]
});
let failures = 0;
let files = 0;
for (const filename of await readdir(directory)) {
  if (!filename.endsWith(".js")) continue;
  files++;
  const [result] = await lint.lintText(await readFile(path.join(directory, filename), "utf8"), { filePath: filename });
  for (const message of result.messages) {
    const name = /^'([^']+)' is not defined/.exec(message.message)?.[1];
    if (message.fatal || (name && helpers.has(name))) {
      console.error(`${filename}:${message.line}:${message.column} ${message.message}`);
      failures++;
    }
  }
}
if (!files) throw new Error(`No emitted JavaScript found in ${directory}`);
console.log(`Checked ${files} emitted JavaScript files; unresolved Vue/i18n helpers: ${failures}`);
process.exitCode = failures ? 1 : 0;
