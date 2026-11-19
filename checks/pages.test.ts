import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "./config.ts";
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

describe("runPages with requireList", () => {
  it("aborts when the exceptions file is missing, before it reads the route tree, and writes none", () => {
    const exceptions = join(mkdtempSync(join(tmpdir(), "checks-")), ".checks/pages.txt");
    const config =
      resolveConfig({ pages: { routeTree: "missing/routeTree.gen.ts", exceptions, requireList: true } })
        .pages ?? (undefined as never);
    for (const mode of ["check", "init"] as const) expect(() => runPages(config, mode)).toThrow(exceptions);
    expect(existsSync(exceptions)).toBe(false);
  });
});
