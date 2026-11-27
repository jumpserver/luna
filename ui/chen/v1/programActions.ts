import type { GoProgramAction, GoProgramIdentity, GoProgramIntent, GoProgramKind } from "./api";

export function isProgramKind(kind?: string): kind is GoProgramKind {
  return kind === "procedure" || kind === "function" || kind === "trigger" || kind === "event";
}

const icons: Record<GoProgramAction, string> = {
  fetchCursor: "i-lucide-list-end",
  readDefinition: "i-lucide-file-text",
  create: "i-lucide-plus",
  edit: "i-lucide-pencil",
  drop: "i-lucide-trash-2",
  invoke: "i-lucide-play",
  setState: "i-lucide-toggle-right",
  rename: "i-lucide-text-cursor-input"
};

export function programActions(
  object: GoProgramIdentity,
  actions: string[],
  ready: boolean,
  translate: (key: string) => string,
  select: (intent: GoProgramIntent) => void
) {
  return (Object.keys(icons) as GoProgramAction[])
    .filter((action) => actions.includes(action))
    .map((action) => ({
      label: translate(`Chen.ProgramAction.${action}`),
      icon: icons[action],
      disabled: !ready,
      onSelect: () => {
        if (ready) select({ ref: object.ref, oid: object.oid, action });
      }
    }));
}
