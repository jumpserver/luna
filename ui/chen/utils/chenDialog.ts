export interface ChenDialogItem {
  label: string;
  value: unknown;
}

export interface ChenDialogButton {
  label: string;
  event: string;
}

export interface ChenDialogMessage {
  id: string | null;
  title: string;
  payload: unknown;
  items: ChenDialogItem[];
  buttons: ChenDialogButton[];
  showClose: boolean;
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
      id: null,
      title: "Message",
      payload,
      items: [],
      buttons: [],
      showClose: true,
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
  const rawButtons = Array.isArray(payload.buttons) ? payload.buttons : [];
  const buttons = rawButtons.flatMap((button): ChenDialogButton[] => {
    if (!isRecord(button) || typeof button.event !== "string" || !button.event.trim()) return [];

    return [
      {
        label: typeof button.label === "string" && button.label.trim() ? button.label : button.event,
        event: button.event
      }
    ];
  });

  return {
    id: typeof payload.id === "string" && payload.id ? payload.id : null,
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title : "Message",
    payload,
    items,
    buttons,
    showClose: payload.showClose !== false,
    text: typeof payload.body === "string" ? payload.body : formatChenDialogValue(payload)
  };
}
