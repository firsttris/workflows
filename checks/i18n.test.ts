import { describe, expect, it } from "bun:test";
import {
  compareLocales,
  findTexts,
  overAllowance,
  parseAllowlist,
  placeholders,
  unusedKeys,
} from "./i18n.ts";

describe("compareLocales", () => {
  it("names missing, extra, empty and mismatched messages", () => {
    const de = { $schema: "x", a: "Datei {name}", b: "Ordner", c: "" };
    const en = { a: "File {title}", d: "Extra", c: "x" };
    expect(compareLocales(de, en, "en")).toEqual([
      "a: other placeholders in en",
      "b: missing in en",
      "d: only in en",
      "c: empty",
    ]);
  });

  it("reads the placeholders of messages with variants", () => {
    expect(
      placeholders([{ match: { "count=one": "{count} file", "count=*": "{count} files of {owner}" } }]),
    ).toEqual(["count", "owner"]);
  });
});

describe("unusedKeys", () => {
  it("counts m.key(), m['key'](), a key written out and keys with a dynamic prefix as used", () => {
    const sources = [`m.save(); m["open_file"](); type T = { offline_title: string };`];
    const keys = ["save", "open_file", "offline_title", "server_auth_csrf", "left_over"];
    expect(unusedKeys(keys, sources, ["server_"])).toEqual(["left_over"]);
  });
});

describe("findTexts", () => {
  const find = (source: string) => findTexts("x.tsx", source).map(({ text }) => text);

  it("finds JSX text, labels and German literals", () => {
    expect(find(`const a = <p title="Hallo Welt">Ein Text</p>;`)).toEqual(["Hallo Welt", "Ein Text"]);
    expect(find(`const items = [{ label: "Copy" }];`)).toEqual(["Copy"]);
    expect(find(`notice("Gespeichert, aber nicht hochgeladen");`)).toEqual([
      "Gespeichert, aber nicht hochgeladen",
    ]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source code of a template string as text
    expect(find("const t = `Datei ${name} fehlt`;")).toEqual(["Datei fehlt"]);
  });

  it("leaves messages, code values, imports and marked literals alone", () => {
    expect(find(`const a = <p className="flex gap-2" title={m.title()}>{m.text()}</p>;`)).toEqual([]);
    expect(find(`const style = "Heading 1";`)).toEqual([]);
    expect(find(`import x from "./die-datei";`)).toEqual([]);
    expect(find(`// i18n-ignore: the engine reads it\nconst caption = "Gesamtergebnis für alle";`)).toEqual(
      [],
    );
  });

  it("gives the line of each text", () => {
    expect(findTexts("x.tsx", `const a = 1;\n\nconst b = <p>Hello there</p>;`)).toEqual([
      { file: "x.tsx", line: 3, text: "Hello there" },
    ]);
  });
});

describe("overAllowance", () => {
  const finding = (file: string, line: number) => ({ file, line, text: "x" });

  it("reports the texts of files with more than the allowlist grants", () => {
    const findings = [finding("a.tsx", 1), finding("a.tsx", 2), finding("b.tsx", 1), finding("c.tsx", 1)];
    const allowed = parseAllowlist(["2 a.tsx", "0 b.tsx"]);
    expect(overAllowance(findings, allowed)).toEqual([finding("b.tsx", 1), finding("c.tsx", 1)]);
  });
});
