"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const Plain = require("./plain.js");
const { createHost, terminalIO, formatError } = require("./node-host.cjs");
const tools = require("./tooling.cjs");

const HELP = `Plain ${Plain.VERSION} — readable code, real programs.

  plain run [file or project]   Run a program (default: current project)
  plain check [file or project] Check syntax and all imported modules
  plain format file [--write]   Print formatted code, or save it
  plain test [file or folder]   Run .test.plain files (default: current folder)
  plain new folder             Create a project with a module and tests
  plain build [file or project] -o app.cjs
                               Package all source modules in one Node.js file
  plain repl                   Start an interactive, persistent session
  plain library                List standard-library functions
  plain --version              Show the installed language version

Run options:
  --allow-net                  Enable HTTP requests
  --root folder                Set the project-file boundary
  --max-steps number           Execution limit (default: 1,000,000)
  --max-output number          Output/text limit (default: 1,000,000 characters)
  -- arg1 arg2                 Values available in system.args

Examples:
  node plain.cjs examples/hello.plain
  node plain.cjs new my-app
  node plain.cjs run my-app
  node plain.cjs test my-app

Open Plain.html for the offline Studio. Node.js 18+ is required for terminal tools.`;

function argumentsFor(args) {
  const aliases = { "--help": "help", "-h": "help", "--version": "version", "--check": "check" };
  let command = aliases[args[0]] || args[0] || "help";
  const known = ["run", "check", "format", "test", "new", "build", "repl", "help", "version", "library"];
  const rest = known.includes(command) ? args.slice(1) : args.slice();
  if (!known.includes(command)) command = "run";
  const positional = [], options = { args: [] };
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (item === "--") { options.args = rest.slice(i + 1); break; }
    if (item === "--allow-net") options.allowNet = true;
    else if (item === "--write") options.write = true;
    else if (["--root", "--max-steps", "--max-output", "-o", "--output"].includes(item)) {
      const value = rest[++i]; if (value === undefined) throw new Error(`${item} needs a value.`);
      if (item === "--root") options.root = value;
      else if (item === "-o" || item === "--output") options.output = value;
      else { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${item} needs a positive whole number.`); options[item === "--max-steps" ? "maxSteps" : "maxOutputChars"] = number; }
    } else if (item.startsWith("-")) throw new Error(`Unknown option: ${item}`);
    else positional.push(item);
  }
  if (positional.length > 1) throw new Error("Choose one file or project. Put program arguments after --.");
  return { command, input: positional[0], options };
}
function limits(options) { return { maxSteps: options.maxSteps || 1000000, maxOutputChars: options.maxOutputChars || 1000000 }; }
async function execute(input, options, test = false) {
  const entry = await tools.projectEntry(input || ".", options.root);
  const host = await createHost(Plain, { root: entry.root, allowNet: options.allowNet, args: options.args });
  const io = terminalIO(), controller = new AbortController(), stop = () => controller.abort(); process.on("SIGINT", stop);
  try {
    return await Plain.run(entry.source, {
      ...host, ...io, ...limits(options), sourceName: entry.id, signal: controller.signal, test,
      onTest: result => { console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.name}`); if (!result.passed) console.error(formatError(result.error)); }
    });
  } finally { io.close(); process.off("SIGINT", stop); }
}
async function repl(options) {
  if (!process.stdin.isTTY) throw new Error("The REPL needs an interactive terminal. To pipe input, run a .plain file.");
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  const host = await createHost(Plain, { root: options.root || process.cwd(), allowNet: options.allowNet });
  const session = Plain.createSession({ ...host, ...limits(options), sourceName: "session.plain", write: line => console.log(line), read: question => terminal.question(question + " ") });
  console.log(`Plain ${Plain.VERSION}. Try: say "Hello". Type .help for session commands.`);
  let buffer = "";
  try {
    while (true) {
      const line = await terminal.question(buffer ? "... " : "plain> ");
      if (!buffer && line === ".exit") break;
      if (!buffer && line === ".reset") { session.reset(); console.log("Session cleared."); continue; }
      if (!buffer && line === ".help") { console.log(".exit — leave; .reset — clear variables. Close each block with end. Use say to see a value."); continue; }
      buffer += line + "\n";
      try { Plain.parse(buffer); }
      catch (error) {
        if (/needs an "end"|to close this expression/.test(error.message)) continue;
        console.error(formatError(error)); buffer = ""; continue;
      }
      try { await session.run(buffer); } catch (error) { console.error(formatError(error)); } buffer = "";
    }
  } finally { terminal.close(); }
}
async function main(args = process.argv.slice(2)) {
  const { command, input, options } = argumentsFor(args);
  if (command === "help") { console.log(HELP); return; }
  if (command === "version") { console.log(Plain.VERSION); return; }
  if (command === "library") { for (const item of Plain.catalog()) console.log(`${item.name}  (${item.min === item.max ? item.min : `${item.min}–${item.max}`} arguments)`); return; }
  if (command === "new") { if (!input) throw new Error("Use: plain new my-app"); const root = await tools.newProject(input); console.log(`Created ${root}\nRun: node plain.cjs run "${input}"\nTest: node plain.cjs test "${input}"`); return; }
  if (command === "repl") return repl(options);
  if (command === "format") {
    if (!input) throw new Error("Use: plain format file.plain [--write]");
    const source = await fs.readFile(input, "utf8"), formatted = Plain.format(source);
    if (options.write) { await fs.writeFile(input, formatted, "utf8"); console.log(`Formatted ${input}`); } else process.stdout.write(formatted); return;
  }
  if (command === "test") {
    const files = await tools.testFiles(input || "."); if (!files.length) throw new Error("No .test.plain files found. Use: test \"a description\" ... end");
    let passed = 0, failed = 0;
    for (const file of files) { const result = await execute(file, options, true); passed += result.passed; failed += result.failed; }
    console.log(`\n${passed} passed, ${failed} failed.`); if (!passed && !failed) throw new Error("The selected files do not contain any test blocks."); if (failed) process.exitCode = 1; return;
  }
  if (command === "check" || command === "build") {
    const entry = await tools.projectEntry(input || ".", options.root);
    if (command === "check") { const graph = await tools.graph(entry); console.log(`Syntax looks good. ${Object.keys(graph).length} source file(s) checked.`); }
    else { const result = await tools.build(entry, options.output || path.join(entry.root, "dist", path.basename(entry.entry, ".plain") + ".cjs")); console.log(`Built ${result.output}\n${result.modules} source module(s), ${result.bytes.toLocaleString("en-US")} bytes. Run with Node.js 18+.`); }
    return;
  }
  await execute(input, options);
}
module.exports = { main, argumentsFor, HELP };
