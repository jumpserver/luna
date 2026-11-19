import { afterEach, expect, it, vi } from "vitest";
import {
  dispatchKokoBroadcastInput,
  registerKokoBroadcastEndpoint,
  setKokoBroadcastSource,
  startKokoTerminalBroadcast,
  stopKokoTerminalBroadcast,
  unregisterKokoBroadcastEndpoint,
  updateKokoBroadcastTargets,
  useKokoTerminalBroadcast,
  validateKokoTerminalBroadcast
} from "#koko/composables/terminal/useTerminalBroadcast";

const ids = Array.from({ length: 12 }, (_, index) => `pane-${index}`);
const { broadcast } = useKokoTerminalBroadcast();
afterEach(() => {
  stopKokoTerminalBroadcast();
  ids.forEach(unregisterKokoBroadcastEndpoint);
});
function endpoint(id: string, canSend = (_data: string, _paste: boolean) => true) {
  const send = vi.fn();
  registerKokoBroadcastEndpoint(id, { canSend, send });
  return send;
}

it("starts only with an explicit, unique selection and available endpoints", () => {
  endpoint(ids[0]!);
  endpoint(ids[1]!);
  expect(startKokoTerminalBroadcast("tab", ids[0]!, [], () => true)).toBe(false);
  expect(startKokoTerminalBroadcast("tab", ids[0]!, [ids[0]!], () => true)).toBe(false);
  expect(startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!, ids[1]!], () => true)).toBe(false);
  expect(startKokoTerminalBroadcast("tab", ids[0]!, [ids[2]!], () => true)).toBe(false);
  expect(startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => false)).toBe(false);
  expect(broadcast.value).toBeNull();
});

it("sends keyboard data, control bytes and paste to nine targets exactly once", () => {
  const sends = ids.map((id) => endpoint(id));
  expect(startKokoTerminalBroadcast("tab", ids[0]!, ids.slice(1, 10), () => true)).toBe(true);
  for (const data of ["pwd", "\r", "\x03", "\x04", "\x1a", "\x1b[A", "中文"]) {
    expect(dispatchKokoBroadcastInput(ids[0]!, data)).toBe("sent");
    sends.slice(0, 10).forEach((send) => expect(send).toHaveBeenLastCalledWith(data, false));
  }
  expect(dispatchKokoBroadcastInput(ids[0]!, "line one\nline two", true)).toBe("sent");
  sends.slice(0, 10).forEach((send) => expect(send).toHaveBeenLastCalledWith("line one\nline two", true));
  sends.slice(10).forEach((send) => expect(send).not.toHaveBeenCalled());
  expect(dispatchKokoBroadcastInput(ids[1]!, "local")).toBe("inactive");
  expect(setKokoBroadcastSource(ids[1]!)).toBe(true);
  expect(dispatchKokoBroadcastInput(ids[0]!, "local")).toBe("inactive");
  expect(dispatchKokoBroadcastInput(ids[1]!, "new source")).toBe("sent");
  sends.slice(0, 10).forEach((send) => expect(send).toHaveBeenCalledTimes(9));
  stopKokoTerminalBroadcast();
  expect(dispatchKokoBroadcastInput(ids[1]!, "local")).toBe("inactive");
});

it("checks every target before sending any input when a target denies paste or is locked", () => {
  const source = endpoint(ids[0]!);
  let locked = false;
  const target = endpoint(ids[1]!, (_data, paste) => !locked && !paste);
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => true);
  expect(dispatchKokoBroadcastInput(ids[0]!, "secret", true)).toBe("blocked");
  expect(source).not.toHaveBeenCalled();
  expect(target).not.toHaveBeenCalled();
  expect(broadcast.value).toBeNull();
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => true);
  locked = true;
  expect(dispatchKokoBroadcastInput(ids[0]!, "\r")).toBe("blocked");
  expect(source).not.toHaveBeenCalled();
});

it("stops on tab/scope changes and endpoint removal or replacement without rejoining", () => {
  endpoint(ids[0]!);
  endpoint(ids[1]!);
  let current = true;
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => current);
  current = false;
  validateKokoTerminalBroadcast();
  expect(broadcast.value).toBeNull();
  current = true;
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => current);
  unregisterKokoBroadcastEndpoint(ids[1]!);
  expect(broadcast.value).toBeNull();
  endpoint(ids[1]!);
  expect(broadcast.value).toBeNull();
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => current);
  endpoint(ids[1]!);
  expect(broadcast.value).toBeNull();
});

it("does not recursively relay target paste and stops after a send failure", () => {
  const nested: string[] = [];
  for (const id of ids.slice(0, 3))
    registerKokoBroadcastEndpoint(id, {
      canSend: () => true,
      send: (data, paste) => {
        nested.push(dispatchKokoBroadcastInput(id, data, paste));
      }
    });
  startKokoTerminalBroadcast("tab", ids[0]!, ids.slice(1, 3), () => true);
  expect(dispatchKokoBroadcastInput(ids[0]!, "paste", true)).toBe("sent");
  expect(nested).toEqual(["inactive", "inactive", "inactive"]);
  stopKokoTerminalBroadcast();
  registerKokoBroadcastEndpoint(ids[1]!, {
    canSend: () => true,
    send: () => {
      throw new Error("closed");
    }
  });
  const last = endpoint(ids[2]!);
  startKokoTerminalBroadcast("tab", ids[0]!, ids.slice(1, 3), () => true);
  expect(dispatchKokoBroadcastInput(ids[0]!, "x")).toBe("blocked");
  expect(last).not.toHaveBeenCalled();
  expect(broadcast.value).toBeNull();
});

it.each(["manual", "disconnect", "blocked", "scope"])("runs layout cleanup once on %s stop", (reason) => {
  let available = true;
  let current = true;
  endpoint(ids[0]!, () => available);
  endpoint(ids[1]!, () => available);
  const cleanup = vi.fn(() => expect(broadcast.value).toBeNull());
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => current, cleanup);
  expect(setKokoBroadcastSource(ids[1]!)).toBe(true);
  expect(cleanup).not.toHaveBeenCalled();
  if (reason === "disconnect") unregisterKokoBroadcastEndpoint(ids[0]!);
  else if (reason === "blocked") {
    available = false;
    dispatchKokoBroadcastInput(ids[1]!, "x");
  } else if (reason === "scope") {
    current = false;
    validateKokoTerminalBroadcast();
  } else stopKokoTerminalBroadcast();
  stopKokoTerminalBroadcast();
  expect(cleanup).toHaveBeenCalledOnce();
});

it("keeps a hidden broadcast intact and resumes input only when its workspace is active", () => {
  let active = true;
  const source = endpoint(ids[0]!);
  const target = endpoint(ids[1]!);
  const unrelated = endpoint(ids[2]!);
  const cleanup = vi.fn();
  startKokoTerminalBroadcast(
    "tab",
    ids[0]!,
    [ids[1]!],
    () => true,
    cleanup,
    () => active
  );
  active = false;
  validateKokoTerminalBroadcast();
  expect(dispatchKokoBroadcastInput(ids[0]!, "hidden input")).toBe("blocked");
  expect(dispatchKokoBroadcastInput(ids[2]!, "new tab")).toBe("inactive");
  expect(broadcast.value?.targetIds).toEqual([ids[1]!]);
  expect(source).not.toHaveBeenCalled();
  expect(target).not.toHaveBeenCalled();
  expect(unrelated).not.toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
  active = true;
  expect(dispatchKokoBroadcastInput(ids[0]!, "\x03")).toBe("sent");
  expect(target).toHaveBeenCalledExactlyOnceWith("\x03", false);
});

it("updates targets without ending the broadcast and stops when the last target is removed", () => {
  const source = endpoint(ids[0]!);
  const removed = endpoint(ids[1]!);
  const added = endpoint(ids[2]!);
  const cleanup = vi.fn();
  startKokoTerminalBroadcast("tab", ids[0]!, [ids[1]!], () => true, cleanup);
  expect(updateKokoBroadcastTargets([ids[1]!, ids[2]!], () => true)).toBe(true);
  expect(dispatchKokoBroadcastInput(ids[0]!, "first")).toBe("sent");
  expect(removed).toHaveBeenCalledExactlyOnceWith("first", false);
  expect(added).toHaveBeenCalledExactlyOnceWith("first", false);
  expect(updateKokoBroadcastTargets([ids[2]!], () => true)).toBe(true);
  expect(updateKokoBroadcastTargets([ids[2]!, ids[2]!], () => true)).toBe(false);
  expect(updateKokoBroadcastTargets([ids[0]!], () => true)).toBe(false);
  expect(updateKokoBroadcastTargets([ids[3]!], () => true)).toBe(false);
  expect(updateKokoBroadcastTargets([ids[1]!], () => false)).toBe(false);
  expect(dispatchKokoBroadcastInput(ids[0]!, "second")).toBe("sent");
  expect(removed).toHaveBeenCalledTimes(1);
  expect(added).toHaveBeenLastCalledWith("second", false);
  expect(source).toHaveBeenCalledTimes(2);
  expect(cleanup).not.toHaveBeenCalled();
  expect(updateKokoBroadcastTargets([], () => true)).toBe(true);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(broadcast.value).toBeNull();
});
