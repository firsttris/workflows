import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { type Config, isScript, matchesAny, readList, selects } from "./config.ts";
import { countLines } from "./file-size.ts";
import { functionLengthHints, type Hint } from "./function-length.ts";

/*
 * Hints on a branch against its base, for rules a script cannot decide for sure: a function new or grown past the
 * limit, an allowlisted large file that grows, code changed without docs, a fix without a test. They never fail;
 * in GitHub Actions they appear as warnings on the check. The branch is compared with the merge base, not with
 * the tip of the base, so that commits of main a branch lags behind do not count.
 *
 * In a pull request the base comes from the event (GITHUB_EVENT_PATH, checkout with fetch-depth: 0); otherwise it
 * is `--base` (default origin/main), without a fetch.
 */

const git = (...args: string[]) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });

/** Content of a file at a commit; null if it does not exist there */
function contentAt(sha: string, file: string): string | null {
  try {
    return git("show", `${sha}:${file}`);
  } catch {
    return null;
  }
}

const isFix = (subject: string) => /^fix(\(.*\))?!?:|^fix\b/i.test(subject);

/** Code without docs, fix without test */
export function changeHints(files: string[], subjects: string[], config: Config["pr"]): string[] {
  const hints: string[] = [];
  const code = files.filter((file) => selects(file, config.code, config.tests));
  if (code.length > 0 && config.docs.length > 0 && !files.some((file) => matchesAny(file, config.docs)))
    hints.push("Code changed, but no docs: does a page describe the changed behaviour?");
  if (subjects.some(isFix) && !files.some((file) => matchesAny(file, config.tests)))
    hints.push("Fix without a changed test: a bug fix starts with a test that fails.");
  return hints;
}

/** Allowlisted large files that grow by `threshold` lines or more */
export function growthHints(
  grown: { file: string; before: number; after: number }[],
  threshold: number,
): string[] {
  return grown
    .filter(({ before, after }) => after - before >= threshold)
    .map(
      ({ file, before, after }) =>
        `${file} grows from ${before} to ${after} lines: can the new part go into a file of its own?`,
    );
}

function baseSha(base: string): string {
  const event = process.env.GITHUB_EVENT_PATH;
  if (event && existsSync(event)) {
    const sha = (JSON.parse(readFileSync(event, "utf8")) as { pull_request?: { base: { sha: string } } })
      .pull_request?.base.sha;
    if (sha) return sha;
  }
  return git("rev-parse", base).trim();
}

/** Prints the hints; never fails */
export function runPr(config: Config, base: string): void {
  const head = git("rev-parse", "HEAD").trim();
  const mergeBase = git("merge-base", baseSha(base), head).trim();
  const range = `${mergeBase}..${head}`;
  const subjects = git("log", "--format=%s", range).split("\n").filter(Boolean);
  const files = git("diff", "--name-only", range).split("\n").filter(Boolean);
  // A renamed file counts under its old name before, else it would be new
  const renamedFrom: Record<string, string> = Object.fromEntries(
    git("diff", "--name-status", "-M", range)
      .split("\n")
      .map((line) => line.split("\t"))
      .filter(([status]) => status?.startsWith("R"))
      .map(([, from, to]) => [to, from]),
  );
  const before = (file: string) => contentAt(mergeBase, renamedFrom[file] ?? file);

  const hints: string[] = [...changeHints(files, subjects, config.pr)];
  if (config.fileSize) {
    const allowed = readList(config.fileSize.allowlist);
    const grown = files
      .filter((file) => allowed.includes(file))
      .flatMap((file) => {
        const old = before(file);
        const now = contentAt(head, file);
        return old === null || now === null
          ? []
          : [{ file, before: countLines(old), after: countLines(now) }];
      });
    hints.push(...growthHints(grown, config.pr.grownLines));
  }
  const functions = config.functions;
  if (functions) {
    const changes = files
      .filter((file) => isScript(file) && selects(file, functions.include, functions.exclude))
      .flatMap((file) => {
        const after = contentAt(head, file);
        return after === null ? [] : [{ file, before: before(file), after }];
      });
    hints.push(
      ...functionLengthHints(changes, functions.max).map(({ file, message }: Hint) => `${file}: ${message}`),
    );
  }

  const inActions = process.env.GITHUB_ACTIONS === "true";
  for (const hint of hints) console.log(inActions ? `::warning title=Checks::${hint}` : `hint: ${hint}`);
  if (hints.length === 0) console.log("checks pr: no hints");
}
