import { parseSync } from "oxc-parser";

/*
 * A function past 80 lines is split. Biome shows every long function with noExcessiveLinesPerFunction, old ones too;
 * this hint names those a pull request adds or makes longer. The code is read with oxc-parser and counted as Biome 2
 * counts with skipBlankLines (crates/biome_js_analyze/src/lint/complexity/no_excessive_lines_per_function.rs): every
 * token in the body with a line break before it, except `{` and `}`. That is every line of the body that starts with
 * code, without head and parameters, without lines of only a comment or a closing brace, without continuation lines
 * of a template string and without text between JSX elements.
 */

export type Hint = { file: string; message: string };

type Node = { type: string; start: number; end: number; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
/** Wrappers the name passes through to the function: `const f = (() => {}) as T` */
const WRAPPERS = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
]);

/** Name of a key or identifier: `a`, `"a"`, `[a]`; else null */
function keyName(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === "Identifier" || node.type === "PrivateIdentifier") return String(node.name);
  if (node.type === "Literal") return String(node.value);
  if (node.type === "MemberExpression") return keyName(node.property);
  return null;
}

/** The child a node gives its name to: variable, property, method, class, assignment */
function namedChild(node: Node): { key: string; name: string | null } | null {
  switch (node.type) {
    case "VariableDeclarator":
      return { key: "init", name: keyName(node.id) };
    case "MethodDefinition":
    case "Property":
    case "PropertyDefinition":
      return { key: "value", name: keyName(node.key) };
    case "AssignmentExpression":
      return { key: "right", name: keyName(node.left) };
    case "ClassDeclaration":
    case "ClassExpression":
      return { key: "body", name: keyName(node.id) };
    case "ExportDefaultDeclaration":
      return { key: "declaration", name: "default" };
    default:
      return null;
  }
}

type Found = { functions: { path: string[]; body: Node }[]; noToken: [number, number][] };

/**
 * Functions with their name path and body, and the places where a line starts without a new token: in the text
 * of a template string after the backtick and in the text between JSX elements up to and including the next one
 */
function collect(program: Node): Found {
  const found: Found = { functions: [], noToken: [] };
  // Biome skips getters and setters, but not the functions inside them
  const accessors = new Set<unknown>();
  const walk = (value: unknown, path: string[], named: boolean): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, path, false);
      return;
    }
    if (!isNode(value)) return;
    if (WRAPPERS.has(value.type)) {
      walk(value.expression, path, named);
      return;
    }
    if (
      (value.type === "MethodDefinition" || value.type === "Property") &&
      (value.kind === "get" || value.kind === "set")
    )
      accessors.add(value.value);
    if (value.type === "TemplateElement") found.noToken.push([value.start + 1, value.end - 1]);
    if (value.type === "JSXText") found.noToken.push([value.start, value.end]);
    let inner = path;
    if (FUNCTIONS.has(value.type) && isNode(value.body) && !accessors.has(value)) {
      inner = named ? path : [...path, keyName(value.id) ?? "(anonymous)"];
      found.functions.push({ path: inner, body: value.body });
    }
    const child = namedChild(value);
    for (const [key, field] of Object.entries(value)) {
      if (child && key === child.key && child.name !== null) walk(field, [...inner, child.name], true);
      else walk(field, inner, false);
    }
  };
  walk(program, [], false);
  return found;
}

/** For every line the offset of its first token, -1 for none: blank, only a comment, in a template string or JSX text */
function firstTokens(
  code: string,
  comments: { start: number; end: number }[],
  noToken: [number, number][],
): number[] {
  const mark = new Uint8Array(code.length + 1);
  for (const { start, end } of comments) mark.fill(1, start, end);
  for (const [start, end] of noToken) mark.fill(2, start, end + 1);
  const result: number[] = [];
  let lineStart = 0;
  while (lineStart <= code.length) {
    let i = lineStart;
    let first = -1;
    for (;;) {
      while (code[i] === " " || code[i] === "\t" || code[i] === "\r") i++;
      if (i >= code.length || code[i] === "\n" || mark[i] === 2) break;
      if (mark[i] !== 1) {
        first = i;
        break;
      }
      while (mark[i] === 1 && code[i] !== "\n") i++;
      if (code[i] === "\n" && mark[i] === 1) break; // the comment runs into the next line
    }
    result.push(first);
    const next = code.indexOf("\n", lineStart);
    if (next === -1) break;
    lineStart = next + 1;
  }
  return result;
}

/** Line of an offset, from the starts of all lines */
const lineOf = (lineStarts: number[], offset: number) => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((lineStarts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
};

/**
 * Lines per function as Biome counts them. The name is the path of the enclosing names, such as `check › (anonymous)`
 * for a callback in `check`; a name that occurs again gets `#2`, `#3`, so that base and head can be matched.
 */
export function functionLengths(file: string, code: string): Map<string, number> {
  const { program, comments } = parseSync(file, code);
  const { functions, noToken } = collect(program as unknown as Node);
  const tokens = firstTokens(code, comments, noToken);
  const lineStarts = [0, ...[...code.matchAll(/\n/g)].map((match) => (match.index ?? 0) + 1)];
  const lengths = new Map<string, number>();
  for (const { path, body } of functions) {
    let lines = 0;
    for (let line = lineOf(lineStarts, body.start); line <= lineOf(lineStarts, body.end); line++) {
      const at = tokens[line] ?? -1;
      if (at >= body.start && at < body.end && code[at] !== "{" && code[at] !== "}") lines++;
    }
    const base = path.join(" › ");
    let name = base;
    for (let n = 2; lengths.has(name); n++) name = `${base} #${n}`;
    lengths.set(name, lines);
  }
  return lengths;
}

/**
 * Old length of each function of the head, undefined for new ones. Functions of the same name (`#2`) are not paired
 * by their order, since one inserted before would shift the numbers: first those of equal length (unchanged), then
 * from the shortest on each to the shortest remaining old one that was at least as long, else the longest remaining.
 */
function previousLengths(
  old: Map<string, number>,
  now: Map<string, number>,
): Map<string, number | undefined> {
  const group = (name: string) => name.replace(/ #\d+$/, "");
  const left = new Map<string, number[]>();
  for (const [name, lines] of old) left.set(group(name), [...(left.get(group(name)) ?? []), lines]);
  const result = new Map<string, number | undefined>();
  const open: [string, number][] = [];
  for (const [name, lines] of now) {
    const rest = left.get(group(name)) ?? [];
    const same = rest.indexOf(lines);
    if (same === -1) open.push([name, lines]);
    else {
      rest.splice(same, 1);
      result.set(name, lines);
    }
  }
  for (const [name, lines] of open.sort((a, b) => a[1] - b[1])) {
    const rest = (left.get(group(name)) ?? []).sort((a, b) => a - b);
    const longer = rest.findIndex((was) => was >= lines);
    result.set(name, longer === -1 ? rest.pop() : rest.splice(longer, 1)[0]);
  }
  return result;
}

/**
 * Hints on functions past the limit that are new, were within it before or grew. `before` is null for a new file.
 * When a long function grows, the new part belongs in a function of its own; old long functions the pull request
 * does not lengthen stay quiet, they are split in a pull request of their own.
 */
export function functionLengthHints(
  changes: { file: string; before: string | null; after: string }[],
  max: number,
): Hint[] {
  return changes.flatMap(({ file, before, after }) => {
    const now = functionLengths(file, after);
    const old = previousLengths(before === null ? new Map() : functionLengths(file, before), now);
    return [...now]
      .filter(([name, lines]) => lines > max && lines > (old.get(name) ?? 0))
      .map(([name, lines]): Hint => {
        const was = old.get(name);
        const change =
          was === undefined
            ? `is new with ${lines} lines, more than ${max}: split it before the merge`
            : was <= max
              ? `grows from ${was} to ${lines} lines, past ${max}: split it before the merge`
              : `grows from ${was} to ${lines} lines (limit ${max}): put the new part into a function of its own`;
        return { file, message: `function "${name}" ${change}` };
      });
  });
}
