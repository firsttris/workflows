import { describe, expect, it } from "bun:test";
import { resolveConfig } from "./config.ts";
import { changeHints, growthHints } from "./pr.ts";

const { pr } = resolveConfig({ fileSize: { include: ["src/**/*.{ts,tsx}"] } });

describe("changeHints", () => {
  it("points out code without docs and a fix without a test", () => {
    expect(changeHints(["src/a.ts"], ["fix(mail): keep the draft"], pr)).toEqual([
      "Code changed, but no docs: does a page describe the changed behaviour?",
      "Fix without a changed test: a bug fix starts with a test that fails.",
    ]);
  });

  it("stays quiet with docs and a test, and for tests alone", () => {
    expect(changeHints(["src/a.ts", "src/a.test.ts", "docs/mail.md"], ["Fix the draft"], pr)).toEqual([]);
    expect(changeHints(["src/a.test.ts"], ["test: more cases"], pr)).toEqual([]);
    expect(changeHints(["src/a.ts", "docs/a.md"], ["Fixpunkt: new export"], pr)).toEqual([]);
  });
});

describe("growthHints", () => {
  it("names allowlisted files that grow by the threshold or more", () => {
    const grown = [
      { file: "src/big.ts", before: 900, after: 920 },
      { file: "src/other.ts", before: 500, after: 519 },
    ];
    expect(growthHints(grown, 20)).toEqual([
      "src/big.ts grows from 900 to 920 lines: can the new part go into a file of its own?",
    ]);
  });
});

describe("resolveConfig", () => {
  it("fills in the defaults and gives functions the globs of fileSize", () => {
    const config = resolveConfig({ fileSize: { include: ["src/**"] } });
    expect(config.fileSize?.max).toBe(400);
    expect(config.fileSize?.allowlist).toBe(".checks/large-files.txt");
    expect(config.functions).toMatchObject({ max: 80, include: ["src/**"] });
    expect(config.pages).toBeUndefined();
    expect(config.i18n).toBeUndefined();
  });
});
