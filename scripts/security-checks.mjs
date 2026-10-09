import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync('src/app/utils/random.ts', 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const context = {exports: {}, Uint8Array, crypto: webcrypto};
vm.runInNewContext(js, context);
const randomString = context.exports.randomString;
for (const n of [0, 1, 16, 32, 100]) {
  const value = randomString(n);
  assert.equal(value.length, n);
  assert.match(value, /^[A-Za-z0-9]*$/);
}
assert.equal(new Set(Array.from({length: 500}, () => randomString(32))).size, 500);
// Rejection sampling: rejected byte 255 must not introduce modulo bias.
context.crypto = {getRandomValues(bytes) {bytes.fill(255); bytes[0] = 61; return bytes;}};
assert.equal(randomString(3), '999');
context.crypto = undefined;
assert.throws(() => randomString(16));
console.log('CSPRNG controls passed (length, alphabet, rejection, unavailable API)');

const templateJS = ts.transpileModule(fs.readFileSync('src/app/utils/command-template.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const sandbox = {exports: {}};
vm.runInNewContext(templateJS, sandbox);
const interpolate = sandbox.exports.interpolateCommand;
assert.equal(interpolate('echo {{ jms_name }}', {jms_name: "$&{{jms_other}}"}), 'echo $&{{jms_other}}');
assert.equal(interpolate('<% throw new Error("executed") %> {{jms_name}}', {jms_name: 'normal'}), '<% throw new Error("executed") %> normal');
assert.equal(interpolate('{{jms_null}}', {jms_null: null}), '');
assert.throws(() => interpolate('{{constructor}}', {}));
assert.throws(() => interpolate('{{jms_missing}}', {}));
console.log('Command interpolation controls passed (no evaluation or recursive substitution)');
