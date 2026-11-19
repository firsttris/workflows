import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Language, MESSAGES } from "./messages.ts";

/*
 * The settings of a project, from `checks.json` in its root. Every part is optional; a check whose
 * part is missing is skipped by `checks all` and refused when called by name. Paths are relative to
 * the root and matched as globs (Bun.Glob, with braces: `src/**\/*.{ts,tsx}`).
 */

/** `git`: the files git knows; `disk`: every file on disk, also ignored ones (works without git, say in a container) */
export type FileSource = "git" | "disk";
export type FileSizeConfig = {
  max: number;
  include: string[];
  exclude: string[];
  allowlist: string;
  files: FileSource;
  /** Abort when the allowlist is missing instead of reading it as empty */
  requireList: boolean;
};
export type FunctionsConfig = { max: number; include: string[]; exclude: string[] };
export type PagesConfig = {
  routeTree: string;
  specs: string[];
  ignore: string[];
  exceptions: string;
  /** Abort when the exceptions file is missing instead of reading it as empty */
  requireList: boolean;
};
export type I18nConfig = {
  project: string;
  include: string[];
  exclude: string[];
  allowlist: string;
  dynamicPrefixes: string[];
};
export type CyclesConfig = {
  modules: string[];
  include: string[];
  exclude: string[];
  aliases: Record<string, string>;
  allowlist: string;
};
export type PrConfig = { code: string[]; docs: string[]; tests: string[]; grownLines: number };

export type Config = {
  /** The language of the messages of file-size and pages (`en`, `de`) */
  language: Language;
  fileSize?: FileSizeConfig;
  functions?: FunctionsConfig;
  pages?: PagesConfig;
  i18n?: I18nConfig;
  cycles?: CyclesConfig;
  pr: PrConfig;
};

/** Tests, end-to-end specs and generated code: not held to the limits of the code they check */
export const DEFAULT_EXCLUDE = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/e2e/**",
  "**/tests/**",
  "**/test/**",
  "**/*.gen.ts",
  "**/*.d.ts",
  "**/paraglide/**",
  "**/node_modules/**",
];

type Raw = {
  language?: string;
  fileSize?: Partial<FileSizeConfig>;
  functions?: Partial<FunctionsConfig>;
  pages?: Partial<PagesConfig>;
  i18n?: Partial<I18nConfig>;
  cycles?: Partial<CyclesConfig>;
  pr?: Partial<PrConfig>;
};

/** Fills in the defaults; `functions` takes the globs of `fileSize` unless it has its own */
export function resolveConfig(raw: Raw): Config {
  const fileSize = raw.fileSize && {
    max: 400,
    exclude: DEFAULT_EXCLUDE,
    allowlist: ".checks/large-files.txt",
    include: [],
    files: "git" as const,
    requireList: false,
    ...raw.fileSize,
  };
  // Only JavaScript and TypeScript files of these globs are read (isScript); Rust has clippy for it
  const functions =
    raw.functions || fileSize
      ? {
          max: 80,
          exclude: fileSize?.exclude ?? DEFAULT_EXCLUDE,
          include: fileSize?.include ?? [],
          ...raw.functions,
        }
      : undefined;
  const pages = raw.pages?.routeTree
    ? {
        specs: [],
        ignore: ["^/api/"],
        exceptions: ".checks/pages.txt",
        requireList: false,
        ...raw.pages,
        routeTree: raw.pages.routeTree,
      }
    : undefined;
  const i18n = raw.i18n && {
    project: "project.inlang",
    include: ["src/**/*.{ts,tsx}"],
    exclude: DEFAULT_EXCLUDE,
    allowlist: ".checks/texts.txt",
    dynamicPrefixes: [],
    ...raw.i18n,
  };
  const pr = {
    code: fileSize?.include ?? [],
    docs: ["docs/**"],
    tests: ["**/*.test.*", "**/*.spec.*", "**/e2e/**", "**/tests/**", "**/test/**"],
    grownLines: 20,
    ...raw.pr,
  };
  const cycles = raw.cycles?.modules
    ? {
        include: (fileSize?.include ?? ["**/*.{ts,tsx}"]).filter((glob) => !glob.endsWith(".rs")),
        exclude: DEFAULT_EXCLUDE,
        aliases: {},
        allowlist: ".checks/cycles.txt",
        ...raw.cycles,
        modules: raw.cycles.modules,
      }
    : undefined;
  const language = raw.language ?? "en";
  if (!(language in MESSAGES)) throw new Error(`checks.json: unknown language "${language}"`);
  return { language: language as Language, fileSize, functions, pages, i18n, cycles, pr };
}

export function loadConfig(root = "."): Config {
  const path = `${root}/checks.json`;
  if (!existsSync(path)) throw new Error("checks.json not found in the current directory");
  return resolveConfig(JSON.parse(readFileSync(path, "utf8")) as Raw);
}

/** True if a path matches one of the globs */
export const matchesAny = (path: string, globs: string[]) =>
  globs.some((glob) => new Bun.Glob(glob).match(path));

/** True if a path is included and not excluded */
export const selects = (path: string, include: string[], exclude: string[]) =>
  matchesAny(path, include) && !matchesAny(path, exclude);

export const isScript = (path: string) => /\.[cm]?[jt]sx?$/.test(path);

/** The files git knows of, tracked or new and not ignored, without deleted ones */
export function projectFiles(root = "."): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(out.split("\0").filter(Boolean))].filter((file) => existsSync(`${root}/${file}`));
}

/** Files below a path, without `node_modules` and `.git`; symbolic links count as files and are not followed */
function walk(root: string, path: string): string[] {
  const full = path === "" ? root : join(root, path);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return [];
    const child = path === "" ? entry.name : `${path}/${entry.name}`;
    return entry.isDirectory() ? walk(root, child) : [child];
  });
}

const isPattern = (segment: string) => /[*?[{]/.test(segment);

/**
 * The folders a glob starts in: its segments up to `**` (or up to the file name) name folders, so `apps/*\/src/**`
 * gives `apps/web/src` and `apps/api/src` and never enters `apps/web/data`. A fixed segment follows a link, a pattern
 * matches real folders only.
 */
function startFolders(root: string, glob: string): string[] {
  const segments = glob.split("/");
  const end = segments.indexOf("**");
  const folders = segments.slice(0, end === -1 ? segments.length - 1 : end);
  return folders.reduce<string[]>(
    (paths, segment) =>
      paths.flatMap((path) => {
        const child = (name: string) => (path === "" ? name : `${path}/${name}`);
        const full = path === "" ? root : join(root, path);
        if (!isPattern(segment)) {
          const next = join(full, segment);
          return existsSync(next) && statSync(next).isDirectory() ? [child(segment)] : [];
        }
        if (!existsSync(full)) return [];
        const pattern = new Bun.Glob(segment);
        return readdirSync(full, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && pattern.match(entry.name))
          .map((entry) => child(entry.name));
      }),
    [""],
  );
}

/**
 * The files on disk in the folders the globs start in, also those git ignores: for a check that runs where git is
 * missing, say in a container that mounts only the work tree
 */
export function diskFiles(include: string[], root = "."): string[] {
  return [
    ...new Set(include.flatMap((glob) => startFolders(root, glob)).flatMap((folder) => walk(root, folder))),
  ];
}

/**
 * Lines of a list file without comments (`#`) and blank lines. An absent file is an empty list, unless it is
 * required: then the check aborts instead of taking every old file or page as new.
 */
export function readList(path: string, required = false): string[] {
  if (!existsSync(path)) {
    if (required) throw new Error(`${path} not found`);
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function writeList(path: string, header: string, lines: string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const comment = header
    .split("\n")
    .map((line) => `# ${line}`.trimEnd())
    .join("\n");
  writeFileSync(path, `${comment}\n${lines.map((line) => `${line}\n`).join("")}`);
}
