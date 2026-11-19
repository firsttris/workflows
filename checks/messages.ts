import { basename } from "node:path";

/*
 * The texts file-size and pages print, per language (`"language"` in checks.json, default `en`). A project that
 * worded its own check before takes up the package without a change in what its lint prints. `undefined` prints
 * nothing. Also the few corner cases where v1 of the package (`en`) and Haben's former scripts (`de`) behaved
 * differently, so that both keep their output byte for byte.
 */

export type Language = "en" | "de";

export type Messages = {
  fileSize: {
    /**
     * An allowlisted file within the limit, removable: v1 asked `lines <= max`, Haben's script `!(lines > max)`;
     * they differ for an entry naming a property of Object.prototype (`toString`)
     */
    withinLimit: (lines: unknown, max: number) => boolean;
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
    /** A key of `FileRoutesByFullPath`, the path in group 1: v1 took both quotes, Haben's script single ones */
    routeKey: RegExp;
    /** Read the exceptions before the route tree, as Haben's script imported ausnahmen.ts first */
    exceptionsFirst: boolean;
    /** `--init` tells a stale exception by the word "stale" in its report, as v1 did */
    staleByWord: boolean;
    missing: (spec: string, page: string) => string;
    stale: (exceptions: string, page: string, spec: string) => string;
    /** A line for a spec that pages.specs does not list; undefined: such a line is never read, as in v1 */
    unknownSpec: ((exceptions: string, spec: string) => string) | undefined;
    summary: (reports: number) => string;
    written: (exceptions: string, lines: number) => string | undefined;
  };
};

/** The name of a spec file without folder and extensions: `e2e/pages.spec.ts` gives `pages` */
const specName = (spec: string) => basename(spec).split(".")[0] ?? spec;

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

const en: Messages = {
  fileSize: {
    withinLimit: (lines, max) => ((lines ?? 0) as number) <= max,
    note: "note: ",
    removable: (lines) =>
      `${lines === undefined ? "deleted" : `${lines} lines`}: \`checks file-size --clean\` takes it off the allowlist.`,
    tooLarge: (lines, max) =>
      `${lines} lines, more than ${max}: put the new part into a file of its own. If it is a renamed file of the allowlist, rename it there too.`,
    summary: (errors, max) => `\nfile size: ${errors} file(s) over ${max} lines`,
    written: (allowlist, files) => `${allowlist}: ${files} file(s)`,
  },
  pages: {
    routeKey: /^\s*['"]([^'"]+)['"]:/gm,
    exceptionsFirst: false,
    staleByWord: true,
    missing: (spec, page) => `${spec}: page ${page} is missing`,
    stale: (exceptions, page, spec) => `${exceptions}: the exception ${page} for ${spec} is stale and can go`,
    unknownSpec: undefined,
    summary: (reports) => `\npages: ${reports} report(s)`,
    written: (exceptions, lines) => `${exceptions}: ${lines} exception(s)`,
  },
};

/** The wording of Haben's checks from before the package (scripts/dateigroesse, scripts/seitenabdeckung) */
const de: Messages = {
  fileSize: {
    withinLimit: (lines, max) => !(((lines ?? 0) as number) > max),
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
    routeKey: /^\s*'([^']+)':/gm,
    exceptionsFirst: true,
    staleByWord: false,
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
