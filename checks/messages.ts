import { basename } from "node:path";

/*
 * The texts file-size and pages print, per language (`"language"` in checks.json, default `en`). A project that
 * worded its own check before takes up the package without a change in what its lint prints. `undefined` prints
 * nothing.
 */

export type Language = "en" | "de";

export type Messages = {
  fileSize: {
    /** Put before the file of a hint on stdout */
    note: string;
    /** After the file: it can leave the allowlist; `lines` is undefined for a deleted file */
    removable: (lines: number | undefined, allowlist: string) => string;
    /** After the file, on stderr: past the limit and not on the allowlist */
    tooLarge: (lines: number, max: number, allowlist: string) => string;
    summary: (errors: number, max: number, allowlist: string) => string;
    written: (allowlist: string, files: number) => string | undefined;
  };
  pages: {
    missing: (spec: string, page: string) => string;
    stale: (exceptions: string, page: string, spec: string) => string;
    unknownSpec: (exceptions: string, spec: string) => string;
    summary: (reports: number) => string;
    written: (exceptions: string, lines: number) => string | undefined;
  };
};

/** The name of a spec file without folder and extensions: `e2e/pages.spec.ts` gives `pages` */
const specName = (spec: string) => basename(spec).split(".")[0] ?? spec;

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

const en: Messages = {
  fileSize: {
    note: "note: ",
    removable: (lines) =>
      `${lines === undefined ? "deleted" : `${lines} lines`}: \`checks file-size --clean\` takes it off the allowlist.`,
    tooLarge: (lines, max) =>
      `${lines} lines, more than ${max}: put the new part into a file of its own. If it is a renamed file of the allowlist, rename it there too.`,
    summary: (errors, max) => `\nfile size: ${errors} file(s) over ${max} lines`,
    written: (allowlist, files) => `${allowlist}: ${files} file(s)`,
  },
  pages: {
    missing: (spec, page) => `${spec}: page ${page} is missing`,
    stale: (exceptions, page, spec) => `${exceptions}: the exception ${page} for ${spec} is stale and can go`,
    unknownSpec: (exceptions, spec) =>
      `${exceptions}: ${spec} is not one of the specs in checks.json (pages.specs)`,
    summary: (reports) => `\npages: ${reports} report(s)`,
    written: (exceptions, lines) => `${exceptions}: ${lines} exception(s)`,
  },
};

/** The wording of Haben's checks from before the package (scripts/dateigroesse, scripts/seitenabdeckung) */
const de: Messages = {
  fileSize: {
    note: "Hinweis: ",
    removable: (lines, allowlist) =>
      `${lines === undefined ? "gelöscht" : `${lines} Zeilen`}: kann mit \`bun checks file-size --clean\` aus ${allowlist}.`,
    tooLarge: (lines, max, allowlist) =>
      `${lines} Zeilen, mehr als ${max} und nicht in ${allowlist}: Neues in eine eigene Datei legen. Ist es eine umbenannte alte Datei, den Pfad in ${allowlist} mit ändern.`,
    summary: (errors, max, allowlist) =>
      `\nDateigröße: ${errors} ${plural(errors, "Datei", "Dateien")} über ${max} Zeilen, nicht in ${allowlist}`,
    written: () => undefined,
  },
  pages: {
    missing: (spec, page) => `${spec}: Seite ${page} fehlt`,
    stale: (exceptions, page, spec) =>
      `${exceptions}: Ausnahme ${page} für ${specName(spec)} ist veraltet und kann weg`,
    unknownSpec: (exceptions, spec) =>
      `${exceptions}: ${spec} ist keine Spec-Datei aus checks.json (pages.specs)`,
    summary: (reports) => `\nSeitenabdeckung: ${reports} ${plural(reports, "Meldung", "Meldungen")}`,
    written: () => undefined,
  },
};

export const MESSAGES: Record<Language, Messages> = { en, de };
