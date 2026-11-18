import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSync } from "oxc-parser";
import { type I18nConfig, projectFiles, readList, selects, writeList } from "./config.ts";

/*
 * Keeps the interface translated (Paraglide with an inlang project, as in Schreibzeug): every locale carries the
 * messages of the base locale with the same placeholders, every message is used, and no text a person reads is
 * written in the code. Text in the code is found by its shape: JSX text, the attributes and object fields that
 * hold labels, and string literals with German letters or words. A literal that only looks like text (a file
 * name, a value a server reads) gets an `i18n-ignore` comment on its line or the line before. Files that had
 * texts before the check are on the allowlist with their count, which may only go down.
 */

export type Messages = Record<string, unknown>;
export type Finding = { file: string; line: number; text: string };

/** The attributes and object fields whose string is read by a person */
const TEXT_NAMES = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "alt",
  "title",
  "placeholder",
  "label",
  "hint",
  "description",
  "tooltip",
  "message",
  "notice",
]);

/** Letters only German has, German quotes, and words found in nearly every German sentence */
const GERMAN =
  /[äöüÄÖÜß„“]|\b(und|oder|nicht|der|die|das|den|dem|ein|eine|einen|mit|für|von|zum|zur|ist|sind|wird|kann|noch|Datei|Dateien|Ordner|Seite|Fehler|Neu|Öffnen|Speichern|Löschen|Abbrechen|Schließen)\b/;

const HAS_WORD = /\p{L}{2,}/u;
const IGNORE = "i18n-ignore";

/** The keys of a messages file without its "$schema" */
export const messageKeys = (messages: Messages): string[] =>
  Object.keys(messages).filter((key) => key !== "$schema");

const textOf = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value ?? ""));

/** The `{name}` placeholders of a message, sorted; for a message with variants, those of all variants */
export const placeholders = (message: unknown): string[] =>
  [...new Set([...textOf(message).matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ""))].sort();

const isEmpty = (value: unknown) => textOf(value).trim() === "" || textOf(value) === '""';

/** Messages one locale has and the other lacks, empty ones, and ones whose placeholders differ */
export function compareLocales(base: Messages, other: Messages, otherName: string): string[] {
  const problems: string[] = [];
  for (const key of messageKeys(base)) {
    const value = other[key];
    if (value === undefined) problems.push(`${key}: missing in ${otherName}`);
    else if (isEmpty(value)) problems.push(`${key}: empty in ${otherName}`);
    else if (placeholders(value).join() !== placeholders(base[key]).join())
      problems.push(`${key}: other placeholders in ${otherName}`);
  }
  for (const key of messageKeys(other)) if (!(key in base)) problems.push(`${key}: only in ${otherName}`);
  for (const key of messageKeys(base)) if (isEmpty(base[key])) problems.push(`${key}: empty`);
  return problems;
}

/**
 * The keys the sources name: `m.key()`, `m["key"]()`, and a key written out anywhere else (a type field, a
 * lookup table), since a key like `offline_title` hardly occurs by chance. Keys built at run time, such as
 * `server_${code}`, are counted as used through `dynamicPrefixes`.
 */
export function unusedKeys(keys: string[], sources: string[], dynamicPrefixes: string[]): string[] {
  const words = new Set(sources.flatMap((source) => source.match(/[\p{L}\w$]+/gu) ?? []));
  return keys.filter((key) => !words.has(key) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix)));
}

type Node = { type: string; start: number; end: number; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

const children = (node: Node): Node[] =>
  Object.values(node).flatMap((value) =>
    Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : [],
  );

const nameOf = (node: unknown): string | undefined => {
  if (!isNode(node)) return undefined;
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return node.name as string;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return undefined;
};

/** A string's text, if the node is a string literal or a template string (its fixed parts) */
const stringOf = (node: unknown): string | undefined => {
  if (!isNode(node)) return undefined;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral")
    return (node.quasis as Node[])
      .map((quasi) => (quasi.value as { cooked: string | null }).cooked ?? "")
      .join(" ");
  if (node.type === "JSXExpressionContainer") return stringOf(node.expression);
  return undefined;
};

/** What in one source file reads like interface text written in the code */
export function findTexts(file: string, source: string): Finding[] {
  const lines = source.split("\n");
  const lineStarts = [0, ...[...source.matchAll(/\n/g)].map((match) => (match.index ?? 0) + 1)];
  const lineOf = (offset: number) => lineStarts.filter((start) => start <= offset).length;
  const ignored = (line: number) =>
    (lines[line - 1] ?? "").includes(IGNORE) || (lines[line - 2] ?? "").includes(IGNORE);
  const { program } = parseSync(file, source);
  const findings: Finding[] = [];
  const report = (node: Node, text: string) => {
    const line = lineOf(node.start);
    if (!ignored(line)) findings.push({ file, line, text: text.trim().replace(/\s+/g, " ").slice(0, 80) });
  };
  const labelled = new Set<Node>();
  const label = (node: Node, name: unknown, value: unknown) => {
    const text = stringOf(value);
    if (!TEXT_NAMES.has(nameOf(name) ?? "") || !text || !HAS_WORD.test(text) || !isNode(value)) return;
    report(node, text);
    labelled.add(value);
  };
  const visit = (node: Node) => {
    if (node.type === "ImportDeclaration") return;
    if (node.type === "JSXText") {
      if (HAS_WORD.test(node.value as string)) report(node, node.value as string);
    } else if (node.type === "JSXAttribute") label(node, node.name, node.value);
    else if (node.type === "Property") label(node, node.key, node.value);
    else if ((node.type === "Literal" || node.type === "TemplateLiteral") && !labelled.has(node)) {
      const text = stringOf(node);
      if (text && GERMAN.test(text)) report(node, text);
    }
    for (const child of children(node)) {
      if (labelled.has(node)) labelled.add(child);
      visit(child);
    }
  };
  visit(program as unknown as Node);
  return findings;
}

type Settings = {
  baseLocale: string;
  locales: string[];
  "plugin.inlang.messageFormat"?: { pathPattern?: string };
};

function loadMessages(project: string): { base: string; locales: Record<string, Messages> } {
  const settings = JSON.parse(readFileSync(join(project, "settings.json"), "utf8")) as Settings;
  const pattern = settings["plugin.inlang.messageFormat"]?.pathPattern ?? "./messages/{locale}.json";
  const pathOf = (locale: string) => join(dirname(project), pattern.replace("{locale}", locale));
  const locales = Object.fromEntries(
    settings.locales.map((locale) => [locale, JSON.parse(readFileSync(pathOf(locale), "utf8")) as Messages]),
  );
  return { base: settings.baseLocale, locales };
}

/** Allowlist lines `<count> <file>`: how many texts a file had before the check */
export function parseAllowlist(lines: string[]): Record<string, number> {
  return Object.fromEntries(
    lines.map((line) => {
      const [count = "0", ...file] = line.split(/\s+/);
      return [file.join(" "), Number(count)];
    }),
  );
}

/** Files with more texts than the allowlist grants them */
export function overAllowance(findings: Finding[], allowed: Record<string, number>): Finding[] {
  const byFile = Map.groupBy(findings, (finding) => finding.file);
  return [...byFile].flatMap(([file, found]) => (found.length > (allowed[file] ?? 0) ? found : []));
}

const header = `Files with interface texts in the code from before the check, with their count (checks i18n,
firsttris/workflows). The count may only go down; \`checks i18n --clean\` lowers it.`;

/** Prints the reports; true if there is an error */
export function runI18n(config: I18nConfig, mode: "check" | "init" | "clean"): boolean {
  const { base, locales } = loadMessages(config.project);
  const files = projectFiles().filter((file) => selects(file, config.include, config.exclude));
  const sources = files.map((file) => readFileSync(file, "utf8"));
  const findings = files.flatMap((file, i) => findTexts(file, sources[i] ?? ""));
  const allowed = parseAllowlist(readList(config.allowlist));
  if (mode !== "check") {
    const counts = Map.groupBy(findings, (finding) => finding.file);
    const entries = [...counts]
      .filter(([file]) => mode === "init" || file in allowed)
      .map(
        ([file, found]) =>
          [file, Math.min(found.length, mode === "init" ? Infinity : (allowed[file] ?? 0))] as const,
      )
      .sort(([a], [b]) => a.localeCompare(b));
    writeList(
      config.allowlist,
      header,
      entries.map(([file, count]) => `${count} ${file}`),
    );
    console.log(`${config.allowlist}: ${entries.length} file(s)`);
    return false;
  }
  const baseMessages = locales[base] ?? {};
  const problems = [
    ...Object.entries(locales)
      .filter(([locale]) => locale !== base)
      .flatMap(([locale, messages]) => compareLocales(baseMessages, messages, locale)),
    ...unusedKeys(messageKeys(baseMessages), sources, config.dynamicPrefixes).map(
      (key) => `${key}: not used in the code`,
    ),
    ...overAllowance(findings, allowed).map(
      ({ file, line, text }) => `${file}:${line}  text in the code: ${text}`,
    ),
  ];
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) console.error(`\ni18n: ${problems.length} report(s)`);
  return problems.length > 0;
}
