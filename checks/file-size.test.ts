import { describe, expect, it, spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
import { type Language, MESSAGES } from "./messages.ts";

type Mode = "check" | "init" | "clean";

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

describe("diskFiles as Haben's scripts/dateigroesse walked its folders", () => {
  const tree = (paths: string[]) => {
    const root = mkdtempSync(join(tmpdir(), "checks-"));
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "x\n");
    }
    return root;
  };

  it("enters a folder named .git below a start folder", () => {
    expect(diskFiles(["src/**/*.ts"], tree(["src/a/.git/b.ts"]))).toEqual(["src/a/.git/b.ts"]);
  });

  it("fails when the folder a pattern looks into is missing (readdir of apps or packages)", () => {
    const root = tree(["apps/web/src/a.ts"]);
    expect(() => diskFiles(["apps/*/src/**/*.ts", "packages/*/src/**/*.ts"], root)).toThrow("ENOENT");
  });

  it("fails when a start folder is a file (readdir of apps/*/src or scripts)", () => {
    expect(() => diskFiles(["apps/*/src/**/*.ts"], tree(["apps/web/src"]))).toThrow("ENOTDIR");
    expect(() => diskFiles(["scripts/**/*.ts"], tree(["scripts"]))).toThrow("ENOTDIR");
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

describe("runFileSize with language", () => {
  /** Runs the check in a folder of files with the given lines, printing into arrays instead of the terminal */
  function run(files: Record<string, number>, list: string[], language: Language, mode: Mode = "check") {
    const root = mkdtempSync(join(tmpdir(), "checks-"));
    for (const [path, count] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "x\n".repeat(count));
    }
    mkdirSync(join(root, ".checks"));
    writeFileSync(join(root, ".checks/large-files.txt"), list.map((file) => `${file}\n`).join(""));
    const config = resolveConfig({ language, fileSize: { include: ["src/**/*.ts"], files: "disk" } });
    const out: string[] = [];
    const err: string[] = [];
    const log = spyOn(console, "log").mockImplementation((line: string) => out.push(line));
    const error = spyOn(console, "error").mockImplementation((line: string) => err.push(line));
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const failed = runFileSize(config.fileSize ?? (undefined as never), mode, MESSAGES[config.language]);
      return { failed, out, err, list: readFileSync(join(root, ".checks/large-files.txt"), "utf8") };
    } finally {
      process.chdir(cwd);
      log.mockRestore();
      error.mockRestore();
    }
  }
  const files = { "src/new.ts": 401, "src/old.ts": 500, "src/small.ts": 12 };
  const list = ["src/gone.ts", "src/old.ts", "src/small.ts"];

  it("prints the English messages by default", () => {
    expect(run(files, list, "en")).toMatchObject({
      failed: true,
      out: [
        "note: src/gone.ts  deleted: `checks file-size --clean` takes it off the allowlist.",
        "note: src/small.ts  12 lines: `checks file-size --clean` takes it off the allowlist.",
      ],
      err: [
        "src/new.ts  401 lines, more than 400: put the new part into a file of its own. If it is a renamed file of the allowlist, rename it there too.",
        "\nfile size: 1 file(s) over 400 lines",
      ],
    });
  });

  it("prints the German messages of Haben's old check with language de, the list and command of today", () => {
    expect(run(files, list, "de")).toMatchObject({
      failed: true,
      out: [
        "Hinweis: src/gone.ts  gelöscht: kann mit `bun checks file-size --clean` aus .checks/large-files.txt.",
        "Hinweis: src/small.ts  12 Zeilen: kann mit `bun checks file-size --clean` aus .checks/large-files.txt.",
      ],
      err: [
        "src/new.ts  401 Zeilen, mehr als 400 und nicht in .checks/large-files.txt: Neues in eine eigene Datei legen. Ist es eine umbenannte alte Datei, den Pfad in .checks/large-files.txt mit ändern.",
        "\nDateigröße: 1 Datei über 400 Zeilen, nicht in .checks/large-files.txt",
      ],
    });
    expect(run({ ...files, "src/b.ts": 401 }, list, "de").err.at(-1)).toBe(
      "\nDateigröße: 2 Dateien über 400 Zeilen, nicht in .checks/large-files.txt",
    );
  });

  it("writes the list silently with --clean and --init in German, as the old check did", () => {
    for (const mode of ["clean", "init"] as const) {
      const result = run(files, list, "de", mode);
      expect(result).toMatchObject({ failed: false, out: [], err: [] });
      expect(result.list).toEndWith(mode === "clean" ? "\nsrc/old.ts\n" : "\nsrc/new.ts\nsrc/old.ts\n");
    }
    expect(run(files, list, "en", "clean").out).toEqual([".checks/large-files.txt: 1 file(s)"]);
  });

  it("reads the files before the list, as before requireList: a missing folder fails first", () => {
    const config =
      resolveConfig({
        fileSize: { include: ["src/**/*.ts"], allowlist: "/missing/list.txt", requireList: true },
      }).fileSize ?? (undefined as never);
    const cwd = process.cwd();
    process.chdir(mkdtempSync(join(tmpdir(), "checks-")));
    try {
      expect(() => runFileSize(config, "check")).toThrow(/git/);
    } finally {
      process.chdir(cwd);
    }
  });

  it("de: a list entry naming a property of Object.prototype is a note, as Haben's old check printed it; en: quiet, as v1", () => {
    const files = { "src/a.ts": 1 };
    expect(run(files, ["toString"], "de").out).toEqual([
      "Hinweis: toString  function toString() { [native code] } Zeilen: kann mit `bun checks file-size --clean` aus .checks/large-files.txt.",
    ]);
    expect(run(files, ["toString"], "en").out).toEqual([]);
  });
});

describe("resolveConfig with language", () => {
  it("takes en by default and refuses a language without messages", () => {
    expect(resolveConfig({}).language).toBe("en");
    expect(resolveConfig({ language: "de" }).language).toBe("de");
    expect(() => resolveConfig({ language: "fr" })).toThrow('checks.json: unknown language "fr"');
  });
});
