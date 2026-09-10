export function productNameAllowsDevTools(name: string, version = "") {
  return /beta/i.test(`${name} ${version}`);
}
