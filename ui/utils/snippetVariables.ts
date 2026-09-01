export interface SnippetVariableField {
  key: string;
  type: "string" | "labeled_choice";
  label: string;
  helpText: string;
  required: boolean;
  defaultValue: string;
  choices: Array<{ value: string; label: string }>;
}

export interface SnippetVariableDefinition {
  id?: string;
  name: string;
  varName: string;
  type: "text" | "select";
  required: boolean;
  defaultValue: string;
  tips: string;
  options: string;
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

const variableType = (value: unknown): SnippetVariableDefinition["type"] => {
  const raw = typeof value === "object" && value && "value" in value ? (value as { value?: unknown }).value : value;
  return raw === "select" ? "select" : "text";
};

export const normalizeSnippetVariableDefinitions = (value: unknown): SnippetVariableDefinition[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const varName = String(raw.varName ?? raw.var_name ?? "")
      .trim()
      .replace(/^jms_/, "");
    if (!varName) return [];
    const type = variableType(raw.type);
    const rawExtraArgs = raw.extra_args ?? raw.options;
    const options =
      typeof rawExtraArgs === "string"
        ? rawExtraArgs
        : rawExtraArgs && typeof rawExtraArgs === "object" && "options" in rawExtraArgs
          ? String((rawExtraArgs as { options?: unknown }).options ?? "")
          : "";
    const defaultValue = String(
      raw.defaultValue ??
        (type === "select" ? raw.select_default_value : raw.text_default_value) ??
        raw.default_value ??
        ""
    );

    return [
      {
        ...(raw.id ? { id: String(raw.id) } : {}),
        name: String(raw.name || varName),
        varName,
        type,
        required: raw.required === true,
        defaultValue,
        tips: String(raw.tips || ""),
        options
      }
    ];
  });
};

export const serializeSnippetVariableDefinitions = (variables: SnippetVariableDefinition[]) =>
  variables.map((variable) => ({
    ...(variable.id ? { id: variable.id } : {}),
    name: variable.name.trim() || variable.varName.trim(),
    var_name: variable.varName.trim().replace(/^jms_/, ""),
    type: variable.type,
    required: variable.required,
    tips: variable.tips.trim(),
    extra_args: variable.type === "select" ? variable.options.trim() : "",
    ...(variable.type === "select"
      ? { select_default_value: variable.defaultValue }
      : { text_default_value: variable.defaultValue })
  }));
