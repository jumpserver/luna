// Cross-repository contract check: node scripts/check-chen-errors.mjs ../chen
// Native database/parser diagnostics are intentionally retained as original details.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chenErrorCatalog } from "../ui/chen/utils/errorCatalog.ts";

if (!process.argv[2]) throw new Error("Usage: node scripts/check-chen-errors.mjs <chen checkout>");
const root = path.resolve(process.argv[2], "internal");
const aliases = new Set(Object.values(chenErrorCatalog).flat());
const codes = new Set();
const missing = new Set();
let plainMessages = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    if (!entry.isFile() || !entry.name.endsWith(".go") || entry.name.endsWith("_test.go")) continue;
    const source = await readFile(file, "utf8");
    const patterns = [
      /fail\(w,\s*[^,]+,\s*"([\w.-]+)"/g,
      /APIError\{(?:Code:\s*)?"([\w.-]+)"/g,
      /(?:editError|policyError)\("([\w.-]+)"/g,
      /(?:closeSession|terminate)\([^,]+,\s*"([\w.-]+)"/g
    ];
    if (entry.name === "server.go") {
      const diagnostics = source.slice(
        source.indexOf("public := map[string]string{"),
        source.indexOf("if message, ok := public[code]")
      );
      for (const match of diagnostics.matchAll(/"([a-z_]+)":\s*"/g)) codes.add(match[1]);
    }
    if (entry.name === "types.go" && path.basename(directory) === "jumpserver")
      patterns.push(/Err\w+\s*= errors.New\("([a-z_]+)"\)/g);
    if (["control.go", "review.go", "policy.go", "execution.go"].includes(entry.name))
      patterns.push(/"((?:command_|script_partial_|permission_expires_|unsupported_session_control)[a-z_0-9]*)"/g);
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) codes.add(match[1]);
    const textPatterns = [];
    if (entry.name === "inspect.go") textPatterns.push(/(?:\.Error =|Error:)\s*"([^"\n]+)"/g);
    if (["edit.go", "edit_plan.go"].includes(entry.name))
      textPatterns.push(/errors.New\("([^"\n]+)"/g, /\.Reason = "([^"\n]+)"/g);
    for (const pattern of textPatterns)
      for (const match of source.matchAll(pattern)) {
        plainMessages++;
        if (!aliases.has(match[1])) missing.add(`${path.relative(root, file)}: ${match[1]}`);
      }
  }
}
await inspect(root);
for (const code of codes) if (code !== "DB2_SQL_ERROR" && !Object.hasOwn(chenErrorCatalog, code)) missing.add(code);
if (codes.size < 100) throw new Error("Too few public codes found; check the Chen checkout and scanner patterns");
if (missing.size) {
  console.error(`Missing Chen error translations:\n${[...missing].sort().join("\n")}`);
  process.exitCode = 1;
} else
  console.log(`Covered ${codes.size} public codes/reasons and ${plainMessages} plain-text metadata/edit diagnostics.`);
