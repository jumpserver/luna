export function interpolateCommand(template: string, context: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(context, name)) {
      throw new Error(`Unknown command variable: ${name}`);
    }
    const value = context[name];
    return value == null ? '' : String(value);
  });
}
