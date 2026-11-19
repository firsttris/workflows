#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { runCycles } from "./cycles.ts";
import { runFileSize } from "./file-size.ts";
import { runI18n } from "./i18n.ts";
import { MESSAGES } from "./messages.ts";
import { runPages } from "./pages.ts";
import { runPr } from "./pr.ts";

/*
 * checks [all]                    every check configured in checks.json (for `bun run lint`)
 * checks file-size [--init|--clean]
 * checks pages [--init]
 * checks i18n [--init|--clean]
 * checks cycles [--init|--clean]
 * checks pr [--base origin/main]  hints on the branch, never fails
 *
 * --init writes what fails today into the allowlist (only when a project takes up the check),
 * --clean drops what is fixed since.
 */

const USAGE = "usage: checks [all|file-size|pages|i18n|cycles|pr] [--init] [--clean] [--base <ref>]";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    init: { type: "boolean", default: false },
    clean: { type: "boolean", default: false },
    base: { type: "string", default: "origin/main" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const command = positionals[0] ?? "all";
const mode = values.init ? "init" : values.clean ? "clean" : "check";
const config = loadConfig();
const messages = MESSAGES[config.language];

const stop = (message: string): never => {
  console.error(message);
  process.exit(2);
};
const missing = (part: string) => stop(`checks.json has no "${part}"`);

let failed = false;
switch (command) {
  case "all":
    if (mode !== "check") stop("--init and --clean need the name of a check");
    if (config.fileSize) failed = runFileSize(config.fileSize, "check", messages) || failed;
    if (config.pages) failed = runPages(config.pages, "check", messages) || failed;
    if (config.i18n) failed = runI18n(config.i18n, "check") || failed;
    if (config.cycles) failed = runCycles(config.cycles, "check") || failed;
    break;
  case "file-size":
    if (!config.fileSize) missing("fileSize");
    else failed = runFileSize(config.fileSize, mode, messages);
    break;
  case "pages":
    if (!config.pages) missing("pages");
    else failed = runPages(config.pages, mode === "clean" ? "init" : mode, messages);
    break;
  case "i18n":
    if (!config.i18n) missing("i18n");
    else failed = runI18n(config.i18n, mode);
    break;
  case "cycles":
    if (!config.cycles) missing("cycles");
    else failed = runCycles(config.cycles, mode);
    break;
  case "pr":
    runPr(config, values.base);
    break;
  default:
    stop(USAGE);
}
process.exit(failed ? 1 : 0);
