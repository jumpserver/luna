export interface ChenDialogItem {
  label: string;
  value: unknown;
}

export interface ChenDialogMessage {
  title: string;
  payload: unknown;
  items: ChenDialogItem[];
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatChenDialogValue(value: unknown) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function normalizeChenDialogMessage(payload: unknown): ChenDialogMessage {
  if (!isRecord(payload)) {
    return {
      title: "Message",
      payload,
      items: [],
      text: formatChenDialogValue(payload)
    };
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.map((item, index): ChenDialogItem => {
    if (!isRecord(item)) return { label: `Item ${index + 1}`, value: item };

    return {
      label:
        typeof item.label === "string" ? item.label : typeof item.name === "string" ? item.name : `Item ${index + 1}`,
      value: item.value
    };
  });

  return {
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title : "Message",
    payload,
    items,
    text: typeof payload.body === "string" ? payload.body : formatChenDialogValue(payload)
  };
}
