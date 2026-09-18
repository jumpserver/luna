import { describe, expect, it } from "vitest";
import {
  changedLineCounts,
  comparisonWindow,
  decodeText,
  encodeText,
  expectedLanguage,
  formatFileSize,
  joinPath,
  parentPath,
  rewriteTreePaths
} from "#koko/components/SftpIde/sftpIdeShared";

describe("sftpIdeShared", () => {
  it("joins and splits posix editor paths", () => {
    expect(joinPath("/home/user", "notes.txt")).toBe("/home/user/notes.txt");
    expect(joinPath("/home/user/", "notes.txt")).toBe("/home/user/notes.txt");
    expect(parentPath("/home/user/notes.txt")).toBe("/home/user");
    expect(parentPath("/notes.txt")).toBe("/");
  });

  it("rewrites tree keys and expanded paths on rename", () => {
    const rewritten = rewriteTreePaths(
      {
        "/a/b": { entries: [], loading: false, error: "" },
        "/a/b/x": { entries: [], loading: false, error: "" },
        "/a/d": { entries: [], loading: false, error: "" }
      },
      ["/a/b", "/a/b/x", "/a/d"],
      "/a/b",
      "/a/c"
    );
    expect(Object.keys(rewritten.tree).sort()).toEqual(["/a/c", "/a/c/x", "/a/d"]);
    expect([...rewritten.expanded].sort()).toEqual(["/a/c", "/a/c/x", "/a/d"]);
  });

  it("detects languages and formats sizes", () => {
    expect(expectedLanguage("main.ts")).toBe("typescript");
    expect(formatFileSize("1536")).toBe("1.5 KB");
  });

  it("round-trips utf-8 text with CRLF", () => {
    const encoded = encodeText("a\nb", "utf-8", "CRLF");
    expect([...encoded]).toEqual([...new TextEncoder().encode("a\r\nb")]);
    expect(decodeText(encoded.buffer)).toEqual({ content: "a\nb", encoding: "utf-8", lineEnding: "CRLF" });
  });

  it("windows a diff around the changed hunk", () => {
    const local = ["keep", "old", "tail"].join("\n");
    const remote = ["keep", "new", "tail"].join("\n");
    const window = comparisonWindow(local, remote);
    expect(window.local.map((line) => line.text)).toEqual(["keep", "old", "tail"]);
    expect(window.remote.find((line) => line.changed)?.text).toBe("new");
    expect(changedLineCounts(local, remote)).toEqual({ added: 1, removed: 1 });
  });
});
