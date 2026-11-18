import { describe, expect, it } from "bun:test";
import { countLines, largeFiles, removableFiles, unlistedLargeFiles } from "./file-size.ts";

describe("countLines", () => {
  it("counts as wc -l", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a\n")).toBe(1);
    expect(countLines("a\nb")).toBe(2);
    expect(countLines("a\nb\n")).toBe(2);
  });
});

describe("unlistedLargeFiles", () => {
  it("lets small files and allowlisted large ones pass, even when those grow", () => {
    expect(unlistedLargeFiles({ "a.ts": 400, "old.ts": 3000 }, ["old.ts"], 400)).toEqual([]);
  });

  it("reports a new file past the limit and a small one that grows past it", () => {
    expect(unlistedLargeFiles({ "new.ts": 401, "was-390.rs": 404 }, [], 400).map((r) => r.file)).toEqual([
      "new.ts",
      "was-390.rs",
    ]);
  });
});

describe("removableFiles", () => {
  it("names shrunk and deleted allowlisted files", () => {
    const reports = removableFiles(
      { "old.ts": 900, "small.ts": 380 },
      ["old.ts", "small.ts", "gone.ts"],
      400,
    );
    expect(reports.map((r) => r.file)).toEqual(["small.ts", "gone.ts"]);
    expect(reports[0]?.message).toContain("--clean");
  });
});

describe("largeFiles", () => {
  it("keeps only existing large files, sorted", () => {
    expect(
      largeFiles({ "b.ts": 700, "a.ts": 950, "small.ts": 380 }, ["b.ts", "small.ts", "gone.ts", "a.ts"], 400),
    ).toEqual(["a.ts", "b.ts"]);
  });
});
