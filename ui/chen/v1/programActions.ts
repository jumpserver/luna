import type {
  GoProgramAction,
  GoProgramDefinition,
  GoProgramDetail,
  GoProgramIdentity,
  GoProgramIntent,
  GoProgramKind
} from "./api";

export function isProgramKind(kind?: string): kind is GoProgramKind {
  return kind === "procedure" || kind === "function" || kind === "trigger" || kind === "event";
}

export function definitionStatusMessage(status: Exclude<GoProgramDefinition["status"], "complete">) {
  if (status === "unsupported") return "Chen.ProgramUnsupported";
  if (status === "truncated") return "Chen.GoOverviewDDLTruncated";
  return "Chen.ProgramDefinitionUnavailable";
}

export function needsRecordColumns(detail?: GoProgramDetail) {
  if (detail?.ref.kind !== "function") return false;
  const type = detail.properties.return_type_ref;
  return (
    typeof type === "object" &&
    type !== null &&
    !Array.isArray(type) &&
    type.schema === "pg_catalog" &&
    type.name === "record" &&
    !detail.parameters?.some((p) => ["OUT", "TABLE", "INOUT"].includes(p.mode))
  );
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
