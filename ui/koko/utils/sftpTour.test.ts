import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVisibleSftpTourTarget, hasVisibleSftpTourTargets, visibleSftpTourTargets } from "./sftpTour";

type FakeEl = {
  dataset: { sftpTour: string };
  style: { display: string; visibility: string };
  getBoundingClientRect: () => { width: number; height: number };
};

const nodes: FakeEl[] = [];

function mountTarget(target: string, visible: boolean) {
  const element: FakeEl = {
    dataset: { sftpTour: target },
    style: { display: visible ? "block" : "none", visibility: "visible" },
    getBoundingClientRect: () => (visible ? { width: 8, height: 8 } : { width: 0, height: 0 })
  };
  nodes.push(element);
  return element;
}

beforeEach(() => {
  nodes.length = 0;
  vi.stubGlobal("document", {
    querySelectorAll: (selector: string) => {
      const match = /data-sftp-tour="([^"]+)"/.exec(selector);
      return nodes.filter((el) => !match || el.dataset.sftpTour === match[1]);
    }
  });
  vi.stubGlobal("getComputedStyle", (el: FakeEl) => ({
    display: el.style.display,
    visibility: el.style.visibility
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sftp tour targets", () => {
  it("ignores hidden duplicate anchors", () => {
    const visible = mountTarget("remote-connect", true);
    mountTarget("remote-connect", false);

    expect(getVisibleSftpTourTarget("remote-connect")).toBe(visible);
  });

  it("keeps the global tour on the base three steps until file chrome exists", () => {
    mountTarget("workspace", true);
    mountTarget("remote-connect", true);
    mountTarget("transfer-center", true);
    mountTarget("file-table", false);

    expect(hasVisibleSftpTourTargets("global")).toBe(true);
    expect(hasVisibleSftpTourTargets("session")).toBe(false);
    expect(visibleSftpTourTargets("global")).toEqual(["workspace", "remote-connect", "transfer-center"]);
  });
});
