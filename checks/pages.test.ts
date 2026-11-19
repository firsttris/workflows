import { describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveConfig } from "./config.ts";
import { type Language, MESSAGES } from "./messages.ts";
import { missingPages, OPEN, pagesOf, parseExceptions, pathsIn, runPages, staleExceptions } from "./pages.ts";

/** A path with an expression, as text in the source of a spec */
// biome-ignore lint/suspicious/noTemplateCurlyInString: the expression is text of the spec here, no placeholder
const ID_PATH = "/invoices/${id}";

const routeTree = `
export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/invoices': typeof InvoicesRoute
  '/invoices/$id': typeof InvoicesIdRoute
  '/invoices/new': typeof InvoicesNewRoute
  '/reports/': typeof ReportsIndexRoute
  '/documents/$': typeof DocumentsSplatRoute
  '/api/health': typeof ApiHealthRoute
}
export interface FileRoutesByTo {
  '/other': typeof OtherRoute
}`;

describe("pagesOf", () => {
  it("reads the full paths, without the trailing slash and the ignored ones", () => {
    expect(pagesOf(routeTree, ["^/api/"])).toEqual([
      "/",
      "/invoices",
      "/invoices/$id",
      "/invoices/new",
      "/reports",
      "/documents/$",
    ]);
  });
});

describe("pagesOf with several ignored paths", () => {
  it("leaves out each of them and keeps the index route without its slash", () => {
    const tree = `
export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/login/hilfe': typeof LoginHelpRoute
  '/.well-known/oauth-authorization-server': typeof WellKnownRoute
  '/einladung/$token': typeof InviteRoute
  '/rechnungen/': typeof InvoicesIndexRoute
}`;
    const ignore = ["^/api/", "^/\\.well-known/", "^/login$", "^/setup$", "^/einladung/"];
    expect(pagesOf(tree, ignore)).toEqual(["/", "/login/hilfe", "/rechnungen"]);
  });
});

describe("pathsIn", () => {
  it("finds strings, template strings and path patterns, without the query", () => {
    const spec = `goto("/invoices?year=2026"); goto(\`${ID_PATH}\`); firstLink(page, /^\\/reports\\/[0-9]+$/);`;
    expect(pathsIn(spec)).toEqual(["/invoices", ID_PATH, "/reports/[0-9]+"]);
  });
});

describe("missingPages", () => {
  const pages = pagesOf(routeTree, ["^/api/"]);

  it("lets a fixed segment win over a parameter", () => {
    expect(
      missingPages(pages, ["/", "/invoices", "/invoices/new", "/reports", "/documents/a/b"], {}),
    ).toEqual(["/invoices/$id", "/documents/$"]);
    expect(missingPages(pages, [ID_PATH], {})).not.toContain("/invoices/$id");
  });

  it("does not take a parameter for several segments", () => {
    expect(missingPages(["/invoices/$id"], ["/invoices/a/b"], {})).toEqual(["/invoices/$id"]);
  });

  it("leaves out the exceptions", () => {
    expect(missingPages(["/a", "/b"], ["/a"], { "/b": "redirects to /a" })).toEqual([]);
  });
});

describe("staleExceptions", () => {
  it("names exceptions of pages that are gone and open ones the spec now reaches", () => {
    const exceptions = { "/gone": OPEN, "/a": OPEN, "/b": "a 404 test only" };
    expect(staleExceptions(["/a", "/b"], ["/a", "/b"], exceptions)).toEqual(["/gone", "/a"]);
  });
});

describe("staleExceptions with a reason of its own", () => {
  it("keeps it although a pattern of the spec reaches the page (a 404 test)", () => {
    const exceptions = { "/reminders/$id": "a 404 test only" };
    expect(staleExceptions(["/reminders/$id"], ["/reminders/[^/]+"], exceptions)).toEqual([]);
  });
});

describe("parseExceptions", () => {
  it("reads spec, page and reason, open without a reason", () => {
    expect(
      parseExceptions(["e2e/a11y.spec.ts /reports redirects to /reports/$year", "e2e/a11y.spec.ts /x"]),
    ).toEqual([
      { spec: "e2e/a11y.spec.ts", page: "/reports", reason: "redirects to /reports/$year" },
      { spec: "e2e/a11y.spec.ts", page: "/x", reason: OPEN },
    ]);
  });
});

/** Runs the check in a folder with a route tree, specs and exceptions, printing into arrays */
function runIn(
  specs: Record<string, string>,
  exceptions: string[],
  language: Language,
  mode: "check" | "init" = "check",
) {
  const root = mkdtempSync(join(tmpdir(), "checks-"));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("src/routeTree.gen.ts", routeTree);
  for (const [spec, text] of Object.entries(specs)) write(spec, text);
  write(".checks/pages.txt", exceptions.map((line) => `${line}\n`).join(""));
  const config = resolveConfig({
    language,
    pages: { routeTree: "src/routeTree.gen.ts", specs: Object.keys(specs), requireList: true },
  });
  const out: string[] = [];
  const err: string[] = [];
  const log = spyOn(console, "log").mockImplementation((line: string) => out.push(line));
  const error = spyOn(console, "error").mockImplementation((line: string) => err.push(line));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const failed = runPages(config.pages ?? (undefined as never), mode, MESSAGES[config.language]);
    return { failed, out, err, list: readFileSync(join(root, ".checks/pages.txt"), "utf8") };
  } finally {
    process.chdir(cwd);
    log.mockRestore();
    error.mockRestore();
  }
}

const ALL = `"/", "/invoices", "/invoices/new", "/invoices/1", "/reports", "/documents/a"`;

describe("runPages with language", () => {
  const specs = { "e2e/pages.spec.ts": `"/", "/invoices", "/reports"`, "e2e/a11y.spec.ts": ALL };
  const exceptions = ["e2e/pages.spec.ts /invoices/new open", "e2e/a11y.spec.ts /gone open"];

  it("prints the English messages by default", () => {
    expect(runIn(specs, exceptions, "en")).toMatchObject({
      failed: true,
      out: [],
      err: [
        "e2e/pages.spec.ts: page /invoices/$id is missing",
        "e2e/pages.spec.ts: page /documents/$ is missing",
        ".checks/pages.txt: the exception /gone for e2e/a11y.spec.ts is stale and can go",
        "\npages: 3 report(s)",
      ],
    });
  });

  it("prints the German messages of Haben's old check with language de, the exceptions file of today", () => {
    expect(runIn(specs, exceptions, "de")).toMatchObject({
      failed: true,
      out: [],
      err: [
        "e2e/pages.spec.ts: Seite /invoices/$id fehlt",
        "e2e/pages.spec.ts: Seite /documents/$ fehlt",
        ".checks/pages.txt: Ausnahme /gone für a11y ist veraltet und kann weg",
        "\nSeitenabdeckung: 3 Meldungen",
      ],
    });
    expect(runIn({ "e2e/a11y.spec.ts": ALL }, ["e2e/a11y.spec.ts /gone open"], "de").err.at(-1)).toBe(
      "\nSeitenabdeckung: 1 Meldung",
    );
  });

  it("writes the exceptions silently with --init in German", () => {
    const result = runIn(specs, exceptions, "de", "init");
    expect(result).toMatchObject({ failed: false, out: [], err: [] });
    expect(result.list).toEndWith(
      "\ne2e/pages.spec.ts /invoices/new open\ne2e/pages.spec.ts /invoices/$id open\ne2e/pages.spec.ts /documents/$ open\n",
    );
  });
});

describe("runPages with an exception for a spec that checks.json does not name", () => {
  const specs = { "e2e/a11y.spec.ts": ALL };
  const exceptions = ["e2e/a11y.spec.ts /reports redirects", "e2e/typo.spec.ts /invoices open"];

  it("fails and names the line, in every mode, and writes nothing", () => {
    for (const mode of ["check", "init"] as const) {
      const result = runIn(specs, exceptions, "en", mode);
      expect(result).toMatchObject({
        failed: true,
        out: [],
        err: [
          ".checks/pages.txt: e2e/typo.spec.ts is not one of the specs in checks.json (pages.specs)",
          "\npages: 1 report(s)",
        ],
      });
      expect(result.list).toBe(`${exceptions.join("\n")}\n`);
    }
    expect(runIn(specs, exceptions, "de").err).toEqual([
      ".checks/pages.txt: e2e/typo.spec.ts ist keine Spec-Datei aus checks.json (pages.specs)",
      "\nSeitenabdeckung: 1 Meldung",
    ]);
  });
});

describe("runPages with requireList", () => {
  const config = (exceptions: string, routeTree = "missing/routeTree.gen.ts") =>
    resolveConfig({ pages: { routeTree, exceptions, requireList: true } }).pages ?? (undefined as never);

  it("aborts when the exceptions file is missing, and writes none", () => {
    const root = mkdtempSync(join(tmpdir(), "checks-"));
    writeFileSync(join(root, "routeTree.gen.ts"), routeTree);
    const exceptions = join(root, ".checks/pages.txt");
    for (const mode of ["check", "init"] as const)
      expect(() => runPages(config(exceptions, join(root, "routeTree.gen.ts")), mode)).toThrow(exceptions);
    expect(existsSync(exceptions)).toBe(false);
  });

  it("reads the route tree before the exceptions, as before requireList: a missing route tree fails first", () => {
    const exceptions = join(mkdtempSync(join(tmpdir(), "checks-")), ".checks/pages.txt");
    expect(() => runPages(config(exceptions), "check")).toThrow("missing/routeTree.gen.ts");
  });
});
