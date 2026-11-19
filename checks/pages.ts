import { readFileSync } from "node:fs";
import { type PagesConfig, readList, writeList } from "./config.ts";

/*
 * Every page of the app is opened by the given spec files (say the one that runs axe on every page), so a new
 * page is not forgotten there. The pages come from the route tree TanStack Router generates, the paths from the
 * text of the specs. That is a text comparison: it sees whether a path is in the file, not whether a test really
 * loads the page; a call that only expects a 404 counts as well. Pages a spec leaves out on purpose are in the
 * exceptions file with a reason; the reason `open` marks a gap from before the check, which goes away once the
 * spec opens the page.
 */

export const OPEN = "open";

/** The pages of `FileRoutesByFullPath` in routeTree.gen.ts, index routes without the trailing slash */
export function pagesOf(routeTree: string, ignore: string[]): string[] {
  const block = routeTree.match(/export interface FileRoutesByFullPath \{([^}]*)\}/)?.[1] ?? "";
  const paths = [...block.matchAll(/^\s*['"]([^'"]+)['"]:/gm)].map(([, path = ""]) =>
    path === "/" ? path : path.replace(/\/$/, ""),
  );
  const ignored = ignore.map((source) => new RegExp(source));
  return [...new Set(paths)].filter((path) => !ignored.some((re) => re.test(path)));
}

/**
 * Paths a spec file calls: strings and template strings starting with "/", without the query, and regular
 * expressions such as `/^\/invoices\/[0-9a-f-]{36}$/` taken as a path.
 */
export function pathsIn(spec: string): string[] {
  const literals = [...spec.matchAll(/["'`](\/(?:\$\{[^}]*\}|[^"'`\s$])*)["'`]/g)].map(
    ([, path = ""]) => path,
  );
  const patterns = [...spec.matchAll(/\/\^((?:\\\/[^/\s]*)+)\$\//g)].map(([, source = ""]) =>
    source.replaceAll("\\/", "/"),
  );
  return [...literals, ...patterns].map((path) => path.split("?")[0] ?? path);
}

/** A parameter such as `$id` (or the splat `$`) matches any segment, also `${year}` or `[0-9a-f-]{36}` */
function matcherOf(page: string): RegExp {
  const segments = page
    .split("/")
    .map((segment) => (segment.startsWith("$") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp(`^${segments.join("/")}$`);
}

/** 0 for a fixed segment, 1 for a parameter */
const rankOf = (page: string) => page.split("/").map((segment) => (segment.startsWith("$") ? 1 : 0));

function compareRanks(a: number[], b: number[]): number {
  const index = a.findIndex((rank, i) => rank !== b[i]);
  return index === -1 ? 0 : (a[index] ?? 0) - (b[index] ?? 0);
}

/** The page the router picks for a path: a fixed segment goes before a parameter (`/users/new` is not `/users/$id`) */
function pageFor(pages: string[], path: string): string | undefined {
  return pages
    .filter((page) => matcherOf(page).test(path))
    .sort((a, b) => compareRanks(rankOf(a), rankOf(b)))[0];
}

const isCovered = (page: string, pages: string[], paths: string[]) =>
  paths.some((path) => pageFor(pages, path) === page);

/** Pages no path of the spec reaches and that are not excepted */
export function missingPages(pages: string[], paths: string[], exceptions: Record<string, string>): string[] {
  return pages.filter((page) => !(page in exceptions) && !isCovered(page, pages, paths));
}

/** Exceptions to drop: pages that are gone, and open gaps the spec now reaches */
export function staleExceptions(
  pages: string[],
  paths: string[],
  exceptions: Record<string, string>,
): string[] {
  return Object.entries(exceptions)
    .filter(([page, reason]) => !pages.includes(page) || (reason === OPEN && isCovered(page, pages, paths)))
    .map(([page]) => page);
}

export type Exception = { spec: string; page: string; reason: string };

/** A line of the exceptions file: `<spec> <page> <reason …>` */
export function parseExceptions(lines: string[]): Exception[] {
  return lines.map((line) => {
    const [spec = "", page = "", ...reason] = line.split(/\s+/);
    return { spec, page, reason: reason.join(" ") || OPEN };
  });
}

const forSpec = (exceptions: Exception[], spec: string) =>
  Object.fromEntries(exceptions.filter((e) => e.spec === spec).map((e) => [e.page, e.reason]));

const header = `Pages a spec file does not open, one per line: <spec> <page> <reason> (checks pages,
firsttris/workflows). The reason "open" marks a gap from before the check; open the page in the
spec and delete the line. A new page goes into the spec, not here.`;

/** Prints the reports; true if there is an error. `init` writes today's gaps as open */
export function runPages(config: PagesConfig, mode: "check" | "init"): boolean {
  const exceptions = parseExceptions(readList(config.exceptions, config.requireList));
  const pages = pagesOf(readFileSync(config.routeTree, "utf8"), config.ignore);
  const reports = config.specs.flatMap((spec) => {
    const paths = pathsIn(readFileSync(spec, "utf8"));
    const own = forSpec(exceptions, spec);
    return [
      ...missingPages(pages, paths, own).map((page) => ({
        spec,
        page,
        message: `${spec}: page ${page} is missing`,
      })),
      ...staleExceptions(pages, paths, own).map((page) => ({
        spec,
        page,
        message: `${config.exceptions}: the exception ${page} for ${spec} is stale and can go`,
      })),
    ];
  });
  if (mode === "init") {
    const stale = new Set(
      reports.filter((r) => r.message.includes("stale")).map((r) => `${r.spec} ${r.page}`),
    );
    const kept = exceptions.filter((e) => !stale.has(`${e.spec} ${e.page}`));
    const added = reports
      .filter((r) => !r.message.includes("stale"))
      .map((r) => ({ spec: r.spec, page: r.page, reason: OPEN }));
    const all = [...kept, ...added].map((e) => `${e.spec} ${e.page} ${e.reason}`);
    writeList(config.exceptions, header, all);
    console.log(`${config.exceptions}: ${all.length} exception(s)`);
    return false;
  }
  for (const { message } of reports) console.error(message);
  if (reports.length > 0) console.error(`\npages: ${reports.length} report(s)`);
  return reports.length > 0;
}
