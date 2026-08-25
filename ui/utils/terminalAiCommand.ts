interface TerminalAiShortcutEvent {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function isTerminalAiCommandShortcut(event: TerminalAiShortcutEvent, isMacOS: boolean) {
  const primaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return !event.repeat && !event.altKey && !event.shiftKey && primaryModifier && event.code === "KeyK";
}

export function terminalAiCommandShortcutAction(available: boolean, busy: boolean) {
  if (!available) return "ignore" as const;
  return busy ? ("panel" as const) : ("popover" as const);
}
