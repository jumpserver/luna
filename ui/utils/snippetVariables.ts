export interface SnippetVariableField {
  key: string;
  type: "string" | "labeled_choice";
  label: string;
  helpText: string;
  required: boolean;
  defaultValue: string;
  choices: Array<{ value: string; label: string }>;
}

export const isTerminalSnippetModule = (module: string) => ["shell", "raw", "win_shell", "python"].includes(module);

export const renderSnippetCommand = (command: string, values: Record<string, string>) =>
  command.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, variableName: string) => {
    if (!variableName.startsWith("jms_")) return placeholder;

    const fieldKey = variableName.slice(4);
    return Object.hasOwn(values, fieldKey) ? (values[fieldKey] ?? "") : placeholder;
  });

export const normalizeSnippetVariableFields = (data: unknown): SnippetVariableField[] => {
  const fields = (data as any)?.actions?.GET;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return [];

  return Object.entries(fields).map(([key, rawField]) => {
    const field = rawField as any;
    if (field?.type !== "string" && field?.type !== "labeled_choice") {
      throw new Error(`Unsupported snippet variable type: ${String(field?.type || "unknown")}`);
    }

    return {
      key,
      type: field.type,
      label: String(field.label || key),
      helpText: String(field.help_text || ""),
      required: field.required === true,
      defaultValue: String(field.default ?? ""),
      choices: Array.isArray(field.choices)
        ? field.choices.map((choice: any) => ({
            value: String(choice?.value ?? ""),
            label: String(choice?.label ?? choice?.value ?? "")
          }))
        : []
    };
  });
};
