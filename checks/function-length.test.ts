import { describe, expect, it } from "bun:test";
import { functionLengthHints, functionLengths, grownFunctions } from "./function-length.ts";

/** Function with `lines` lines as Biome counts: as many statements in the body, blank lines between that do not count */
const fn = (name: string, lines: number) =>
  `export function ${name}() {\n${Array.from({ length: lines }, (_, i) => `  const v${i} = ${i};\n`).join("\n")}}\n`;

const FILE = "src/tax.ts";

describe("functionLengths", () => {
  it("counts as Biome only lines of the body that start with code", () => {
    expect(functionLengths(FILE, fn("lang", 81)).get("lang")).toBe(81);
    const code = [
      "export function f(",
      "  a: number,",
      ") {",
      "  // comment",
      "  /* over",
      "     two lines */ const t = `x",
      "  $" + "{a}",
      "  y`;",
      "  if (a) {",
      "    g({",
      "      a,",
      "    });",
      "  } else {",
      "    return (",
      "      <div>",
      "        Text",
      "        <b>{a}</b>",
      "      </div>",
      "    );",
      "  }",
      "}",
    ].join("\n");
    // const t, if, g, a, return, <div>, ); counted again with Biome 2.6.4 and maxLines 1
    expect(functionLengths("x.tsx", code).get("f")).toBe(7);
  });

  it("knows declarations, expressions, arrow functions and methods, named by variable and key", () => {
    const code = [
      "function a() {}",
      "const b = function () {};",
      "const c = (x: number) => x;",
      "const d = (() => 1) as unknown;",
      "class K { m() {}\n  f = () => {}; }",
      "const o = { p() {}, q: () => 1 };",
      "export const s = wrap(async () => {});",
      "declare function t(): void;",
    ].join("\n");
    expect([...functionLengths("x.ts", code).keys()]).toEqual([
      "a",
      "b",
      "c",
      "d",
      "K › m",
      "K › f",
      "o › p",
      "o › q",
      "s › (anonymous)",
    ]);
  });

  it("leaves out getters and setters as Biome does", () => {
    // checked with Biome 2.6.4 and maxLines 1: only m is reported
    const code =
      "class K {\n  get g() {\n    a();\n    b();\n  }\n  set s(v) {\n    a();\n    b();\n  }\n  m() {\n    a();\n    b();\n  }\n}\nconst o = {\n  get h() {\n    a();\n    b();\n  },\n};\n";
    expect([...functionLengths("x.ts", code).keys()]).toEqual(["K › m"]);
  });

  it("keeps equal names apart", () => {
    expect([...functionLengths("x.ts", "const x = [() => {}, () => {}];").keys()]).toEqual([
      "x › (anonymous)",
      "x › (anonymous) #2",
    ]);
  });
});

describe("functionLengthHints", () => {
  const messages = (changes: Parameters<typeof functionLengthHints>[0]) =>
    functionLengthHints(changes, 80).map(({ message }) => message);

  it("reports a new function past 80 lines, also in a new file", () => {
    expect(
      messages([{ file: FILE, before: fn("short", 10), after: fn("short", 10) + fn("added", 81) }]),
    ).toEqual(['function "added" is new with 81 lines, more than 80: split it before the merge']);
    expect(messages([{ file: FILE, before: null, after: fn("added", 90) }])).toHaveLength(1);
  });

  it("reports a function grown past the limit or further, with lines before and after", () => {
    expect(
      messages([{ file: FILE, before: fn("a", 80) + fn("b", 120), after: fn("a", 81) + fn("b", 195) }]),
    ).toEqual([
      'function "a" grows from 80 to 81 lines, past 80: split it before the merge',
      'function "b" grows from 120 to 195 lines (limit 80): put the new part into a function of its own',
    ]);
  });

  /** Callback without a name at the top level, such as `beforeAll(() => {})` */
  const callback = (lines: number) =>
    `on(() => {\n${Array.from({ length: lines }, (_, i) => `  a${i}();\n`).join("")}});\n`;

  it("stays quiet when a function of the same name is inserted before a long one", () => {
    expect(
      messages([
        { file: FILE, before: callback(100) + callback(5), after: callback(3) + callback(100) + callback(5) },
      ]),
    ).toEqual([]);
  });

  it("reports a grown one among functions of the same name with its old length", () => {
    expect(
      messages([{ file: FILE, before: callback(90) + callback(50), after: callback(90) + callback(95) }]),
    ).toEqual(['function "(anonymous) #2" grows from 50 to 95 lines, past 80: split it before the merge']);
    expect(messages([{ file: FILE, before: callback(100), after: callback(50) + callback(90) }])).toEqual([
      'function "(anonymous) #2" is new with 90 lines, more than 80: split it before the merge',
    ]);
  });

  it("stays quiet on unchanged and shrunk long functions and at 80 lines", () => {
    const before = fn("old", 150) + fn("shrinks", 150);
    expect(
      messages([{ file: FILE, before, after: fn("old", 150) + fn("shrinks", 120) + fn("limit", 80) }]),
    ).toEqual([]);
  });
});

describe("grownFunctions", () => {
  const callback = (lines: number) =>
    `on(() => {\n${Array.from({ length: lines }, (_, i) => `  a${i}();\n`).join("")}});\n`;

  it("gives the lengths before and after, for a project that words the hints itself", () => {
    expect(
      grownFunctions(
        [{ file: FILE, before: fn("a", 80) + fn("b", 120), after: fn("a", 81) + fn("b", 195) + fn("c", 90) }],
        80,
      ),
    ).toEqual([
      { file: FILE, name: "a", lines: 81, was: 80 },
      { file: FILE, name: "b", lines: 195, was: 120 },
      { file: FILE, name: "c", lines: 90, was: undefined },
    ]);
  });

  it("names functions without a name as asked, matched as before", () => {
    expect([...functionLengths("x.ts", "const x = [() => {}, () => {}];", "(anonym)").keys()]).toEqual([
      "x › (anonym)",
      "x › (anonym) #2",
    ]);
    expect(
      grownFunctions(
        [{ file: FILE, before: callback(100), after: callback(50) + callback(90) }],
        80,
        "(anonym)",
      ),
    ).toEqual([{ file: FILE, name: "(anonym) #2", lines: 90, was: undefined }]);
    expect(
      grownFunctions(
        [
          {
            file: FILE,
            before: callback(100) + callback(5),
            after: callback(3) + callback(100) + callback(5),
          },
        ],
        80,
        "(anonym)",
      ),
    ).toEqual([]);
  });
});
