"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const Plain = require("./plain.js");
const { createHost, inside } = require("./node-host.cjs");

async function projectEntry(input = ".", explicitRoot) {
  const target = path.resolve(input), stat = await fs.stat(target);
  let entry = target, root = explicitRoot ? path.resolve(explicitRoot) : null;
  if (stat.isDirectory()) {
    let config = {}; try { config = JSON.parse(await fs.readFile(path.join(target, "plain.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    entry = path.resolve(target, config.main || "main.plain"); root ??= target;
  } else if (!root) {
    let candidate = path.dirname(entry);
    while (true) {
      try { await fs.access(path.join(candidate, "plain.json")); root = candidate; break; }
      catch {} const parent = path.dirname(candidate); if (parent === candidate) break; candidate = parent;
    }
    root ??= path.dirname(entry);
  }
  root = await fs.realpath(root);
  entry = await fs.realpath(entry);
  if (!inside(root, entry)) throw new Error("The entry file must be inside the project root.");
  const host = await createHost(Plain, { root });
  const id = path.relative(root, entry).split(path.sep).join("/");
  return { root, entry, id, source: await host.files.read(id) };
}
function imports(body, result = []) {
  if (!body || typeof body !== "object") return result;
  if (body.kind === "use") result.push(body);
  for (const value of Object.values(body)) if (value && typeof value === "object") imports(value, result);
  return result;
}
async function graph(entry) {
  const host = await createHost(Plain, { root: entry.root }), modules = Object.create(null), loading = new Set();
  async function visit(id, source) {
    if (loading.has(id)) throw new Error(`Circular module use involving "${id}".`);
    if (Object.hasOwn(modules, id)) return;
    loading.add(id); const body = Plain.parse(source, { sourceName: id });
    for (const node of imports(body)) { const module = await host.loadModule(node.path, id); await visit(module.id, module.source); }
    modules[id] = source; loading.delete(id);
  }
  await visit(entry.id, entry.source); return modules;
}
async function build(entry, output) {
  const modules = await graph(entry);
  const engine = await fs.readFile(path.join(__dirname, "plain.js"), "utf8"), host = await fs.readFile(path.join(__dirname, "node-host.cjs"), "utf8");
  const wrap = source => `(function(){ const module = {exports:{}};\n${source}\nreturn module.exports; })()`;
  const code = `#!/usr/bin/env node\n"use strict";\n// Built by Plain ${Plain.VERSION}. Run with Node.js 18 or newer.\nconst Plain = ${wrap(engine)};\nconst hostTools = ${wrap(host)};\nconst modules = ${JSON.stringify(modules)};\nconst entry = ${JSON.stringify(entry.id)};\n(async () => {\n  const controller = new AbortController();\n  process.on("SIGINT", () => controller.abort());\n  const io = hostTools.terminalIO();\n  try {\n    const args = process.argv.slice(2);\n    const host = await hostTools.createHost(Plain, { root: __dirname, modules, allowNet: args.includes("--allow-net"), args: args.filter(arg => arg !== "--allow-net") });\n    await Plain.run(modules[entry], { ...host, ...io, sourceName: entry, signal: controller.signal });\n  } finally { io.close(); }\n})().catch(error => { console.error(hostTools.formatError(error)); process.exitCode = 1; });\n`;
  const target = path.resolve(output);
  if (Object.keys(modules).some(id => path.resolve(entry.root, id).toLowerCase() === target.toLowerCase())) throw new Error("Choose a build output that does not overwrite a Plain source file.");
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, code, "utf8");
  return { output: target, modules: Object.keys(modules).length, bytes: Buffer.byteLength(code) };
}
async function newProject(directory) {
  const root = path.resolve(directory);
  try { await fs.access(root); throw new Error("That folder already exists. Choose a new folder to avoid overwriting your work."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  const files = {
    "plain.json": JSON.stringify({ name: path.basename(root), version: "1.0.0", main: "main.plain" }, null, 2) + "\n",
    "main.plain": 'use "helpers.plain" as helpers\n\nsay helpers.greet("world")\n\nfor amount in range(1, 3)\n  say "Double", amount, "is", helpers.double(amount)\nend\n',
    "helpers.plain": 'make greet(name)\n  give "Hello, " + name + "!"\nend\n\nmake double(amount)\n  give amount * 2\nend\n',
    "tests/helpers.test.plain": 'use "../helpers.plain" as helpers\n\ntest "greeting"\n  check helpers.greet("Ada") is "Hello, Ada!"\nend\n\ntest "doubling"\n  check helpers.double(6) is 12\nend\n'
  };
  for (const [name, source] of Object.entries(files)) await fs.writeFile(path.join(root, name), source, "utf8"); return root;
}
async function testFiles(target) {
  const stat = await fs.stat(target); if (stat.isFile()) return [path.resolve(target)];
  const result = [];
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && !["node_modules", ".git", "dist", ".plain"].includes(entry.name)) await walk(path.join(folder, entry.name));
      else if (entry.isFile() && entry.name.endsWith(".test.plain")) result.push(path.join(folder, entry.name));
    }
  }
  await walk(path.resolve(target)); return result.sort();
}
module.exports = { projectEntry, graph, build, newProject, testFiles };
