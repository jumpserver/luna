export enum KeyboardKey {
  A = "a",
  ArrowDown = "ArrowDown",
  ArrowLeft = "ArrowLeft",
  ArrowRight = "ArrowRight",
  ArrowUp = "ArrowUp",
  Backslash = "\\",
  Backspace = "Backspace",
  C = "c",
  Delete = "Delete",
  Digit1 = "1",
  Digit2 = "2",
  End = "End",
  Enter = "Enter",
  Escape = "Escape",
  F = "f",
  F2 = "F2",
  F5 = "F5",
  Home = "Home",
  L = "l",
  P = "p",
  R = "r",
  S = "s",
  T = "t",
  Tab = "Tab",
  V = "v",
  W = "w"
}

type TerminalChordEvent = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/** Copy chords that must not be sent to the remote terminal. */
export function isTerminalCopyChord(event: TerminalChordEvent) {
  if (event.altKey || event.key?.toLowerCase() !== KeyboardKey.C) return false;
  return (event.metaKey && !event.ctrlKey) || (event.ctrlKey && event.shiftKey);
}

/** Plain Ctrl+C. Callers must send the interrupt themselves so xterm does not clear the selection. */
export function isTerminalInterruptChord(event: TerminalChordEvent) {
  return (
    event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.key?.toLowerCase() === KeyboardKey.C
  );
}
