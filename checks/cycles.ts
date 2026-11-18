import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { parseSync } from "oxc-parser";
import { type CyclesConfig, projectFiles, readList, selects, writeList } from "./config.ts";

/*
 * No ring between modules: when module A imports from B and B, over any path, from A, neither can be understood,
 * tested or moved without the other. A module is a folder matched by one of the `modules` globs (`server/*`,
 * `src/features/*`); rings between files inside one module are not counted, they are usually harmless. Every
 * import counts, type imports too, since they couple the modules as well. Imports to files outside every module
 * (a shared `lib/`) are not followed. Rings from before the check are on the allowlist as their edges
 * (`<from> -> <to>`); a ring that needs an edge not on it fails.
 */

export type Edge = { from: string; to: string; file: string };

/** The module a file belongs to: the folder matched by the first glob of `modules` that covers it */
export function moduleOf(file: string, modules: string[]): string | undefined {
  const segments = file.split("/");
  for (const glob of modules) {
    const depth = glob.split("/").length;
    if (segments.length <= depth) continue;
    const folder = segments.slice(0, depth).join("/");
    if (new Bun.Glob(glob).match(folder)) return folder;
  }
  return undefined;
}

/** The specifiers a file imports: static imports, re-exports and dynamic imports with a string literal */
export function importsOf(file: string, code: string): string[] {
  const { module } = parseSync(file, code);
  const dynamic = module.dynamicImports
    .map(({ moduleRequest }) => code.slice(moduleRequest.start, moduleRequest.end))
    .flatMap((text) => (/^(["'`])([^"'`$]+)\1$/.exec(text)?.[2] ? [text.slice(1, -1)] : []));
  return [
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap((entry) =>
      entry.entries.flatMap((e) => (e.moduleRequest ? [e.moduleRequest.value] : [])),
    ),
    ...dynamic,
  ];
}

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

/** The project file a specifier points to: relative, or through an alias such as `@/` → `src/` */
export function resolveImport(
  from: string,
  specifier: string,
  aliases: Record<string, string>,
  exists: (path: string) => boolean,
): string | undefined {
  const alias = Object.keys(aliases).find((prefix) => specifier.startsWith(prefix));
  const base = specifier.startsWith(".")
    ? normalize(join(dirname(from), specifier))
    : alias !== undefined
      ? normalize(`${aliases[alias]}${specifier.slice(alias.length)}`)
      : undefined;
  if (base === undefined) return undefined;
  const stem = base.replace(/\.[cm]?js$/, "");
  return [base, ...EXTENSIONS.map((ext) => stem + ext)].find(exists);
}

/** Edges between modules, one per pair, with the first file that makes it */
export function moduleEdges(imports: { file: string; targets: string[] }[], modules: string[]): Edge[] {
  const edges = new Map<string, Edge>();
  for (const { file, targets } of imports) {
    const from = moduleOf(file, modules);
    if (!from) continue;
    for (const target of targets) {
      const to = moduleOf(target, modules);
      if (!to || to === from || edges.has(`${from} -> ${to}`)) continue;
      edges.set(`${from} -> ${to}`, { from, to, file });
    }
  }
  return [...edges.values()];
}

/** The strongly connected components with more than one module (Tarjan), each sorted */
export function rings(edges: Edge[]): string[][] {
  const next = Map.groupBy(edges, (edge) => edge.from);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string) => {
    index.set(node, index.size);
    low.set(node, index.get(node) ?? 0);
    stack.push(node);
    onStack.add(node);
    for (const { to } of next.get(node) ?? []) {
      if (!index.has(to)) {
        visit(to);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(to) ?? 0));
      } else if (onStack.has(to)) low.set(node, Math.min(low.get(node) ?? 0, index.get(to) ?? 0));
    }
    if (low.get(node) !== index.get(node)) return;
    const component: string[] = [];
    for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
      onStack.delete(top);
      component.push(top);
      if (top === node) break;
    }
    if (component.length > 1) found.push(component.sort());
  };
  for (const node of new Set(edges.flatMap((edge) => [edge.from, edge.to])))
    if (!index.has(node)) visit(node);
  return found;
}

/** The edges that lie on a ring: both ends in the same component */
export function ringEdges(edges: Edge[]): Edge[] {
  const componentOf = new Map(
    rings(edges).flatMap((component, i) => component.map((node) => [node, i] as const)),
  );
  return edges.filter(
    ({ from, to }) => componentOf.has(from) && componentOf.get(from) === componentOf.get(to),
  );
}

/** A path of edges from one module to another, for the message (breadth first) */
export function pathBetween(edges: Edge[], start: string, goal: string): string[] {
  const previous = new Map<string, string>([[start, start]]);
  const queue = [start];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    if (node === goal) break;
    for (const { from, to } of edges)
      if (from === node && !previous.has(to)) {
        previous.set(to, node);
        queue.push(to);
      }
  }
  const path = [goal];
  while (path[0] !== start && previous.has(path[0] ?? "")) path.unshift(previous.get(path[0] ?? "") ?? start);
  return path;
}

const key = (edge: { from: string; to: string }) => `${edge.from} -> ${edge.to}`;

const header = `Imports between modules that close a ring, from before the check (checks cycles,
firsttris/workflows). Break them in a pull request of their own; \`checks cycles --clean\` drops
the ones that no longer close a ring. A new one is never added here.`;

export function collectEdges(config: CyclesConfig, root = "."): Edge[] {
  const files = projectFiles(root).filter((file) => selects(file, config.include, config.exclude));
  const known = new Set(projectFiles(root));
  const exists = (path: string) => known.has(path) && existsSync(join(root, path));
  const imports = files.map((file) => ({
    file,
    targets: importsOf(file, readFileSync(join(root, file), "utf8")).flatMap(
      (specifier) => resolveImport(file, specifier, config.aliases, exists) ?? [],
    ),
  }));
  return moduleEdges(imports, config.modules);
}

/** Prints the reports; true if there is an error */
export function runCycles(config: CyclesConfig, mode: "check" | "init" | "clean"): boolean {
  const edges = collectEdges(config);
  const onRing = ringEdges(edges);
  const allowed = new Set(readList(config.allowlist));
  if (mode !== "check") {
    const lines = onRing
      .map(key)
      .filter((line) => mode === "init" || allowed.has(line))
      .sort();
    writeList(config.allowlist, header, lines);
    console.log(`${config.allowlist}: ${lines.length} import(s)`);
    return false;
  }
  const current = new Set(onRing.map(key));
  for (const line of allowed)
    if (!current.has(line)) console.log(`note: ${line} no longer closes a ring: \`checks cycles --clean\``);
  const errors = onRing.filter((edge) => !allowed.has(key(edge)));
  for (const edge of errors) {
    const back = pathBetween(edges, edge.to, edge.from);
    console.error(
      `${edge.file}: ${edge.from} imports ${edge.to}, which leads back: ${[edge.from, ...back].join(" -> ")}. Move the shared part down into a module both can import.`,
    );
  }
  if (errors.length > 0) console.error(`\ncycles: ${errors.length} import(s) closing a ring between modules`);
  return errors.length > 0;
}
