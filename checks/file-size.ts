import { readFileSync } from "node:fs";
import { type FileSizeConfig, projectFiles, readList, selects, writeList } from "./config.ts";

/*
 * A file does one thing: past `max` lines (400) it is split. Older files are larger; they are in the
 * allowlist and may keep growing, since they are split only in a pull request of their own (`checks pr`
 * points out when one grows). An error is a file past the limit that is not on the list: a new one or
 * one that grew past it; then the new part goes into a file of its own.
 */

export type Report = { file: string; message: string };

/** Lines as `wc -l` counts them: a newline at the end is no line of its own */
export function countLines(code: string): number {
  if (code === "") return 0;
  return code.split("\n").length - (code.endsWith("\n") ? 1 : 0);
}

/** Errors: files past the limit that are not on the allowlist */
export function unlistedLargeFiles(lines: Record<string, number>, allowed: string[], max: number): Report[] {
  return Object.entries(lines)
    .filter(([file, count]) => count > max && !allowed.includes(file))
    .map(([file, count]) => ({
      file,
      message: `${count} lines, more than ${max}: put the new part into a file of its own. If it is a renamed file of the allowlist, rename it there too.`,
    }));
}

/** Allowlisted files that are gone or back within the limit */
export function removableFiles(lines: Record<string, number>, allowed: string[], max: number): Report[] {
  return allowed
    .filter((file) => (lines[file] ?? 0) <= max)
    .map((file) => ({
      file,
      message: `${file in lines ? `${lines[file]} lines` : "deleted"}: \`checks file-size --clean\` takes it off the allowlist.`,
    }));
}

/** The files of a list that are past the limit, sorted */
export function largeFiles(lines: Record<string, number>, candidates: string[], max: number): string[] {
  return candidates.filter((file) => (lines[file] ?? 0) > max).sort((a, b) => a.localeCompare(b));
}

export function linesOf(config: FileSizeConfig, root = "."): Record<string, number> {
  return Object.fromEntries(
    projectFiles(root)
      .filter((file) => selects(file, config.include, config.exclude))
      .map((file) => [file, countLines(readFileSync(`${root}/${file}`, "utf8"))]),
  );
}

const header = (max: number) =>
  `Files with more than ${max} lines from before the check (checks file-size, firsttris/workflows).
They may grow; split them in a pull request of their own. \`checks file-size --clean\` removes the
ones that are gone or small again.`;

/** Prints the reports; true if there is an error */
export function runFileSize(config: FileSizeConfig, mode: "check" | "init" | "clean"): boolean {
  const lines = linesOf(config);
  const allowed = readList(config.allowlist);
  if (mode !== "check") {
    const candidates = mode === "init" ? [...new Set([...allowed, ...Object.keys(lines)])] : allowed;
    const files = largeFiles(lines, candidates, config.max);
    writeList(config.allowlist, header(config.max), files);
    console.log(`${config.allowlist}: ${files.length} file(s)`);
    return false;
  }
  for (const { file, message } of removableFiles(lines, allowed, config.max))
    console.log(`note: ${file}  ${message}`);
  const errors = unlistedLargeFiles(lines, allowed, config.max);
  for (const { file, message } of errors) console.error(`${file}  ${message}`);
  if (errors.length > 0) console.error(`\nfile size: ${errors.length} file(s) over ${config.max} lines`);
  return errors.length > 0;
}
