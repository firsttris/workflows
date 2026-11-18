import { describe, expect, it } from "bun:test";
import {
  type Edge,
  importsOf,
  moduleEdges,
  moduleOf,
  pathBetween,
  resolveImport,
  ringEdges,
  rings,
} from "./cycles.ts";

const edge = (from: string, to: string): Edge => ({ from, to, file: `${from}/x.ts` });

describe("moduleOf", () => {
  it("takes the folder of the first matching glob, and nothing for files outside", () => {
    const modules = ["server/*", "src/features/*"];
    expect(moduleOf("server/mail/send.ts", modules)).toBe("server/mail");
    expect(moduleOf("src/features/mail/list/row.tsx", modules)).toBe("src/features/mail");
    expect(moduleOf("server/app.ts", modules)).toBeUndefined();
    expect(moduleOf("src/lib/date.ts", modules)).toBeUndefined();
  });
});

describe("importsOf", () => {
  it("finds imports, type imports, re-exports and dynamic imports with a literal", () => {
    const code = `import a from "./a"; import type { T } from "./t"; export * from "../b"; export { d } from "@/d";
      const c = import("./c"); const e = import(name);`;
    expect(importsOf("x.ts", code).sort()).toEqual(["../b", "./a", "./c", "./t", "@/d"]);
  });
});

describe("resolveImport", () => {
  const files = new Set(["server/mail/send.ts", "server/db/index.ts", "src/lib/date.tsx"]);
  const exists = (path: string) => files.has(path);

  it("resolves relative paths, index files, .js endings and aliases", () => {
    expect(resolveImport("server/http/app.ts", "../mail/send", {}, exists)).toBe("server/mail/send.ts");
    expect(resolveImport("server/http/app.ts", "../mail/send.js", {}, exists)).toBe("server/mail/send.ts");
    expect(resolveImport("server/http/app.ts", "../db", {}, exists)).toBe("server/db/index.ts");
    expect(resolveImport("src/a.ts", "@/lib/date", { "@/": "src/" }, exists)).toBe("src/lib/date.tsx");
  });

  it("leaves packages and unknown files alone", () => {
    expect(resolveImport("src/a.ts", "react", {}, exists)).toBeUndefined();
    expect(resolveImport("src/a.ts", "./gone", {}, exists)).toBeUndefined();
  });
});

describe("moduleEdges", () => {
  it("makes one edge per pair of modules, without edges inside a module or to files outside", () => {
    const imports = [
      {
        file: "server/a/x.ts",
        targets: ["server/b/y.ts", "server/b/z.ts", "server/a/w.ts", "server/app.ts"],
      },
      { file: "server/b/y.ts", targets: ["server/a/x.ts"] },
    ];
    expect(moduleEdges(imports, ["server/*"])).toEqual([
      { from: "server/a", to: "server/b", file: "server/a/x.ts" },
      { from: "server/b", to: "server/a", file: "server/b/y.ts" },
    ]);
  });
});

describe("rings", () => {
  it("finds rings of two and more modules, and no ring in a chain", () => {
    const edges = [
      edge("a", "b"),
      edge("b", "a"),
      edge("c", "d"),
      edge("d", "e"),
      edge("e", "c"),
      edge("e", "f"),
    ];
    expect(
      rings(edges)
        .map((ring) => ring.join())
        .sort(),
    ).toEqual(["a,b", "c,d,e"]);
    expect(rings([edge("a", "b"), edge("b", "c")])).toEqual([]);
  });

  it("keeps only the edges on a ring", () => {
    const edges = [edge("a", "b"), edge("b", "a"), edge("b", "c")];
    expect(ringEdges(edges).map(({ from, to }) => `${from} -> ${to}`)).toEqual(["a -> b", "b -> a"]);
  });
});

describe("pathBetween", () => {
  it("finds the shortest way back", () => {
    const edges = [edge("b", "c"), edge("c", "a"), edge("b", "a")];
    expect(pathBetween(edges, "b", "a")).toEqual(["b", "a"]);
    expect(pathBetween([edge("b", "c"), edge("c", "a")], "b", "a")).toEqual(["b", "c", "a"]);
  });
});
