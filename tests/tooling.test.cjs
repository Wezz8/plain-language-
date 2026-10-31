"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const Plain = require("../plain.js");
const { createHost } = require("../node-host.cjs");
const tools = require("../tooling.cjs");
const { Project } = require("../src/project.js");
const JSZip = require("../vendor/jszip.min.js");
const cli = path.resolve(__dirname, "../plain.cjs");
async function temporary(action) {
  const base = path.resolve(os.tmpdir()), folder = await fs.mkdtemp(path.join(base, "plain-check-"));
  try { return await action(folder); }
  finally {
    // Only remove the exact fresh temporary directory, after checking its parent.
    if (path.dirname(path.resolve(folder)) !== base || !path.basename(folder).startsWith("plain-check-")) throw new Error("Unsafe temporary cleanup target.");
    await fs.rm(folder, { recursive: true, force: true });
  }
}
const command = (args, options = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10000, ...options });

test("CLI scaffolds a real project, checks imports, runs it, and tests it", async () => temporary(async folder => {
  const app = path.join(folder, "my-app");
  const created = command(["new", app]); assert.equal(created.status, 0, created.stderr);
  const run = command(["run", app]); assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /Hello, world!/); assert.match(run.stdout, /Double 3 is 6/);
  const check = command(["check", app]); assert.equal(check.status, 0, check.stderr); assert.match(check.stdout, /2 source file/);
  const tested = command(["test", app]); assert.equal(tested.status, 0, tested.stderr); assert.match(tested.stdout, /2 passed, 0 failed/);
  assert.equal(command(["new", app]).status, 1); assert.match(await fs.readFile(path.join(app, "main.plain"), "utf8"), /helpers/);
}));
test("bundled programs run with source modules removed", async () => temporary(async folder => {
  const app = await tools.newProject(path.join(folder, "app")), entry = await tools.projectEntry(app);
  const output = path.join(folder, "app.cjs"), built = await tools.build(entry, output);
  assert.equal(built.modules, 2); await fs.unlink(path.join(app, "helpers.plain"));
  const result = spawnSync(process.execPath, [output], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Double 3 is 6/);
  await assert.rejects(tools.graph(await tools.projectEntry(app)), /ENOENT/);
}));
test("build refuses to overwrite source", async () => temporary(async folder => {
  const app = await tools.newProject(path.join(folder, "app")), entry = await tools.projectEntry(app);
  await assert.rejects(tools.build(entry, entry.entry), /does not overwrite/);
  assert.match(await fs.readFile(entry.entry, "utf8"), /helpers/);
}));
test("CLI failing tests and invalid arguments return failure exit codes", async () => temporary(async folder => {
  const file = path.join(folder, "bad.test.plain"); await fs.writeFile(file, 'test "bad"\ncheck false, "Not correct"\nend');
  const result = command(["test", file]); assert.equal(result.status, 1); assert.match(result.stdout, /0 passed, 1 failed/); assert.match(result.stderr, /Not correct/);
  assert.equal(command(["run", file, "--max-steps", "0"]).status, 1);
  assert.equal(command(["run", file, "--unknown"]).status, 1);
  assert.equal(command(["test", path.join(folder, "missing")]).status, 1);
}));
test("CLI formatting and program arguments work", async () => temporary(async folder => {
  const file = path.join(folder, "main.plain"); await fs.writeFile(file, 'if true\nsay system.args\nend');
  const format = command(["format", file, "--write"]); assert.equal(format.status, 0, format.stderr);
  assert.match(await fs.readFile(file, "utf8"), /\n  say/);
  const result = command(["run", file, "--", "one", "two"]); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /\["one", "two"\]/);
}));
test("filesystem adapter reads, writes, appends, lists, and removes inside its root", async () => temporary(async folder => {
  const host = await createHost(Plain, { root: folder });
  const result = await Plain.run('files.mkdir("data")\nfiles.write("data/note.txt", "Hello")\nfiles.append("data/note.txt", " Plain")\nsay files.read("data/note.txt")\nsay files.exists("data/note.txt"), files.list("data")\nfiles.remove("data/note.txt")\nsay files.exists("data/note.txt")', host);
  assert.deepEqual(result.output, ['Hello Plain', 'true ["note.txt"]', 'false']);
  await assert.rejects(host.files.read("../secret"), /outside/);
  await assert.rejects(host.files.write("../secret", "no"), /outside/);
  await assert.rejects(host.files.remove("data"), /directory|operation|EPERM|EISDIR/i);
}));
test("filesystem adapter rejects symbolic links escaping the project", async t => temporary(async folder => {
  const root = path.join(folder, "root"), external = path.join(folder, "outside"); await fs.mkdir(root); await fs.mkdir(external); await fs.writeFile(path.join(external, "secret.txt"), "secret");
  try { await fs.symlink(external, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error.code === "EPERM") { t.skip("This operating system does not allow creating a test link."); return; } throw error; }
  const host = await createHost(Plain, { root }); await assert.rejects(host.files.read("linked/secret.txt"), /link outside/); await assert.rejects(host.files.write("linked/new.txt", "no"), /link outside/);
}));
test("real HTTP adapter returns data from a local HTTP server", async () => temporary(async folder => {
  const server = http.createServer((request, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ method: request.method, hello: "Plain" })); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/data`, host = await createHost(Plain, { root: folder, allowNet: true });
    const result = await Plain.run(`say http.json("${url}").hello\nsay http.send("POST", "${url}", "hello").status`, host);
    assert.deepEqual(result.output, ["Plain", "200"]);
    const disabled = await createHost(Plain, { root: folder }); await assert.rejects(Plain.run(`http.get("${url}")`, disabled), err => err.code === "CAPABILITY_ERROR");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
test("Studio projects preserve files through ZIP export/import and run their modules", async () => {
  const project = new Project({ name: "Round trip", entry: "main.plain", files: {
    "main.plain": 'use "helpers.plain" as helpers\nfiles.write("result.txt", text(helpers.double(4)))\nsay files.read("result.txt")',
    "helpers.plain": 'make double(value)\ngive value * 2\nend'
  } });
  const zip = await project.zip(JSZip), restored = await Project.fromZip(zip, JSZip);
  assert.equal(restored.name, "Round trip"); assert.deepEqual(Object.keys(restored.files).sort(), ["helpers.plain", "main.plain"]);
  const result = await Plain.run(restored.read(restored.entry), { ...restored.adapters(), sourceName: restored.entry });
  assert.deepEqual(result.output, ["8"]); assert.equal(restored.read("result.txt"), "8");
});
test("ZIP projects work in the terminal after extraction", async () => temporary(async folder => {
  const project = new Project({ files: { "main.plain": 'say "From Studio"' } });
  const zip = await JSZip.loadAsync(await project.zip(JSZip));
  for (const entry of Object.values(zip.files)) if (!entry.dir) await fs.writeFile(path.join(folder, entry.name), await entry.async("nodebuffer"));
  const result = command(["run", folder]); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /From Studio/);
}));
test("project file mutations, positions, and folder listings remain consistent", () => {
  const project = new Project(); project.mkdir("data"); project.write("data/items.txt", "one"); project.append("data/items.txt", " two");
  assert.equal(project.read("data/items.txt"), "one two"); assert.deepEqual(project.list("data"), ["items.txt"]); assert.equal(project.exists("."), true);
  project.rename("data/items.txt", "data/notes.txt"); assert.equal(project.exists("data/items.txt"), false); project.remove("data/notes.txt"); assert.deepEqual(project.list("data"), []);
  assert.throws(() => project.remove(project.entry), /entry file/);
  assert.throws(() => project.write("../outside.txt", "no"), Plain.PlainError);
  assert.throws(() => project.write("main.plain/data.txt", "no"), /both a file and a folder/);
});
test("project validation rejects oversized files and invalid entry files", () => {
  assert.throws(() => new Project({ files: { "main.plain": "a".repeat(500001) } }), /too large/);
  assert.throws(() => new Project({ files: { "note.txt": "hello" } }), /entry/);
  assert.throws(() => new Project({ files: { "main.plain": 3 } }), /must contain text/);
});
test("empty nested folders survive ZIP round trips and behave like folders", async () => {
  const project = new Project(); project.mkdir("reports/empty");
  assert.equal(project.exists("reports"), true); assert.deepEqual(project.list("reports"), ["empty"]);
  assert.throws(() => project.mkdir("main.plain/sub"), /both a file and a folder/);
  const restored = await Project.fromZip(await project.zip(JSZip), JSZip);
  assert.deepEqual(restored.list("reports"), ["empty"]);
  assert.throws(() => restored.write("plain.json", "{}"), /manages plain.json/);
});
test("ZIP imports reject traversal and inflated file sizes before reading contents", async () => {
  const traversal = new JSZip(); traversal.file("../secret.plain", "say 1"); traversal.file("main.plain", "say 1");
  await assert.rejects(Project.fromZip(await traversal.generateAsync({ type: "uint8array" }), JSZip), /unsafe path/);
  const large = new JSZip(); large.file("main.plain", "x".repeat(500001));
  await assert.rejects(Project.fromZip(await large.generateAsync({ type: "uint8array", compression: "DEFLATE" }), JSZip), /expanded ZIP/);
});
test("all shipped project examples run and their tests pass", async () => temporary(async folder => {
  const root = path.resolve(__dirname, "../projects");
  for (const name of await fs.readdir(root)) {
    const target = path.join(folder, name); await fs.cp(path.join(root, name), target, { recursive: true });
    const result = command(["run", target], { input: name === "tasks" ? "add\nTest task\ndone\n1\nquit\n" : undefined });
    assert.equal(result.status, 0, name + ": " + result.stderr);
    if (["modules", "tasks", "tests"].includes(name)) { const tested = command(["test", target]); assert.equal(tested.status, 0, name + ": " + tested.stderr); assert.match(tested.stdout, /0 failed/); }
    if (name === "tasks") { const data = JSON.parse(await fs.readFile(path.join(target, "tasks.json"), "utf8")); assert.equal(data[0].done, true); assert.equal(data.at(-1).title, "Test task"); }
  }
}));
