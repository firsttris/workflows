import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { diskFiles, readList, resolveConfig } from "./config.ts";
import {
  countLines,
  largeFiles,
  linesOf,
  removableFiles,
  runFileSize,
  unlistedLargeFiles,
} from "./file-size.ts";

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

describe("linesOf", () => {
  /** A repository with a tracked, an ignored and an untracked file, node_modules and a link to a folder */
  function project(): string {
    const root = mkdtempSync(join(tmpdir(), "checks-"));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    write("apps/web/src/a.ts", "a\nb\n");
    write("apps/web/src/gen/ignored.ts", "x\n");
    write("apps/web/src/new.tsx", "x\n");
    write("apps/web/src/a.test.ts", "x\n");
    write("apps/web/src/node_modules/m.ts", "x\n");
    write("apps/web/other/b.ts", "x\n");
    write("apps/web/data/receipt.pdf", "x\n");
    write("scripts/.hidden/c.ts", "x\n");
    write(".gitignore", "gen/\nnode_modules/\n");
    symlinkSync(join(root, "apps/web/other"), join(root, "apps/web/src/linked"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "apps/web/src/a.ts", "scripts", ".gitignore"], { cwd: root });
    return root;
  }
  const config = (files?: "disk") =>
    resolveConfig({
      fileSize: {
        include: ["apps/*/src/**/*.{ts,tsx}", "scripts/**/*.ts"],
        exclude: ["**/*.test.ts"],
        ...(files && { files }),
      },
    }).fileSize ?? (undefined as never);

  it("reads the files git knows, new ones too, by default", () => {
    expect(Object.keys(linesOf(config(), project())).sort()).toEqual([
      "apps/web/src/a.ts",
      "apps/web/src/new.tsx",
      "scripts/.hidden/c.ts",
    ]);
  });

  it("with files: disk reads every file in the folders of the globs, ignored ones too, without git", () => {
    const root = project();
    expect(linesOf(config("disk"), root)).toEqual({
      "apps/web/src/a.ts": 2,
      "apps/web/src/gen/ignored.ts": 1,
      "apps/web/src/new.tsx": 1,
      "scripts/.hidden/c.ts": 1,
    });
  });
});

describe("diskFiles", () => {
  it("enters only the folders the globs can reach, as a lint that never reads data folders beside src", () => {
    const root = mkdtempSync(join(tmpdir(), "checks-"));
    for (const path of [
      "apps/web/src/a.ts",
      "apps/web/data/receipt.pdf",
      "apps/web/other/b.ts",
      "scripts/c.ts",
      "docs/d.ts",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "x\n");
    }
    expect(diskFiles(["apps/*/src/**/*.ts", "scripts/**/*.ts"], root).sort()).toEqual([
      "apps/web/src/a.ts",
      "scripts/c.ts",
    ]);
  });
});

describe("requireList", () => {
  const root = () => mkdtempSync(join(tmpdir(), "checks-"));

  it("readList: an absent list is empty, unless it is required", () => {
    const path = join(root(), "missing.txt");
    expect(readList(path)).toEqual([]);
    expect(() => readList(path, true)).toThrow(path);
  });

  it("file-size aborts in every mode when the required allowlist is missing, and writes none", () => {
    const allowlist = join(root(), ".checks/large-files.txt");
    const config =
      resolveConfig({ fileSize: { include: ["src/**/*.ts"], files: "disk", allowlist, requireList: true } })
        .fileSize ?? (undefined as never);
    for (const mode of ["check", "init", "clean"] as const)
      expect(() => runFileSize(config, mode)).toThrow(allowlist);
    expect(existsSync(allowlist)).toBe(false);
  });
});
