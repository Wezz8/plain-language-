// UI event tests use an in-memory DOM. They do not claim visual browser coverage.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Plain = require("../plain.js");
const PlainProject = require("../src/project.js");
const JSZip = require("../vendor/jszip.min.js");
const folder = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(folder, "src/playground.html"), "utf8");
const app = fs.readFileSync(path.join(folder, "src/studio.js"), "utf8");
const examples = JSON.parse(fs.readFileSync(path.join(folder, "src/studio-examples.json"), "utf8"));

function setup(options = {}) {
  let document;
  class Element extends EventTarget {
    constructor(tag = "div") {
      super(); this.tagName = tag; this.children = []; this.value = ""; this.hidden = false; this.disabled = false; this.checked = false;
      this.dataset = {}; this.style = {}; this.attributes = {}; this._text = ""; this.scrollTop = 0; this.scrollHeight = 100; this.selectionStart = 0; this.selectionEnd = 0;
    }
    get childElementCount() { return this.children.length; }
    append(...items) { for (const child of items) { if (child.tagName === "fragment") this.children.push(...child.children); else this.children.push(child); } }
    replaceChildren(...items) { this.children = []; this._text = ""; this.append(...items); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    querySelector(selector) { if (selector === '[value="draft"]') return this.draftOption; throw Error("Unsupported test selector " + selector); }
    focus() { document.activeElement = this; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
    click() { if (!this.disabled) this.dispatchEvent(new Event("click", { cancelable: true })); }
    remove() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const ids = {};
  for (const match of template.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const element = ids[match[3]] = new Element(match[1]); element.hidden = /\bhidden(?:\s|$)/.test(match[2]);
  }
  ids.example.value = "hello"; ids.example.draftOption = new Element("option");
  document = new EventTarget(); document.getElementById = id => { assert.ok(ids[id], "Unknown element " + id); return ids[id]; };
  document.createElement = tag => new Element(tag); document.createDocumentFragment = () => new Element("fragment"); document.body = new Element("body");
  const storage = options.storage || new Map(); let download;
  const context = {
    document, Plain, PlainProject, JSZip, AbortController, Blob, TextEncoder, TextDecoder,
    PLAIN_EXAMPLES: examples, PLAIN_LIBRARY_HELP: require("../library-info.cjs"),
    clearTimeout, setTimeout: (callback, delay, ...args) => setTimeout(callback, Math.min(delay, 10), ...args),
    fetch: options.fetch || (() => { throw new Error("Unexpected network request"); }),
    URL: { createObjectURL: blob => { download = blob; return "blob:unit-test"; }, revokeObjectURL() {} },
    localStorage: {
      getItem(key) { if (options.storageFails) throw Error("Storage disabled"); return storage.get(key) ?? null; },
      setItem(key, value) { if (options.storageFails) throw Error("Storage disabled"); storage.set(key, value); }
    }
  };
  if (options.bundle) {
    delete context.Plain; delete context.PlainProject; delete context.JSZip;
    const isolated = vm.createContext(context);
    vm.runInContext("globalThis.self = globalThis; globalThis.window = globalThis;", isolated);
    const html = fs.readFileSync(path.join(folder, "Plain.html"), "utf8");
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1], isolated);
  } else vm.runInNewContext(app, context);
  return { ids, document, storage, download: () => download };
}
function event(element, type, fields = {}) { const value = new Event(type, { cancelable: true }); for (const [key, data] of Object.entries(fields)) Object.defineProperty(value, key, { value: data }); element.dispatchEvent(value); }
async function until(condition) { const deadline = Date.now() + 4000; while (!condition()) { if (Date.now() > deadline) throw Error("Timed out waiting for Studio state"); await new Promise(resolve => setTimeout(resolve, 1)); } }
async function run(ui, testMode = false) { ui.ids[testMode ? "test" : "run"].click(); await until(() => !ui.ids.run.disabled); }
function edit(ui, source) { ui.ids.editor.value = source; event(ui.ids.editor, "input"); }
function choose(ui, name) { ui.ids.example.value = name; event(ui.ids.example, "change"); }

test("Studio runs examples and exposes values", async () => {
  const ui = setup(); await run(ui); assert.match(ui.ids.console.textContent, /Hello, Ada!/);
  choose(ui, "functions"); await run(ui); assert.match(ui.ids.console.textContent, /Double 12 is 24/);
  ui.ids["view-values"].click(); assert.equal(ui.ids["values-panel"].hidden, false); assert.match(ui.ids["values-panel"].textContent, /double/);
});
test("Studio saves projects and restores them after reopening", async () => {
  const ui = setup(); edit(ui, 'set score to 42\nsay score');
  const restored = setup({ storage: ui.storage }); assert.equal(restored.ids.editor.value, 'set score to 42\nsay score');
  choose(restored, "counting"); choose(restored, "draft"); assert.match(restored.ids.editor.value, /score to 42/);
});
test("Studio input validates numbers and runs with the answer", async () => {
  const ui = setup(); choose(ui, "conversation"); ui.ids.run.click(); await until(() => !ui.ids["input-form"].hidden);
  ui.ids.answer.value = "Sam"; event(ui.ids["input-form"], "submit"); await until(() => ui.ids.question.textContent.includes("stars"));
  ui.ids.answer.value = "abc"; event(ui.ids["input-form"], "submit"); assert.match(ui.ids["input-error"].textContent, /Please enter a number/);
  ui.ids.answer.value = "2"; event(ui.ids["input-form"], "submit"); await until(() => !ui.ids.run.disabled);
  assert.match(ui.ids.console.textContent, /Hello, Sam!/); assert.equal(ui.ids.console.children.filter(line => line.textContent === "*").length, 2);
});
test("Studio stops input and loops, then runs again", async () => {
  const ui = setup(); choose(ui, "conversation"); ui.ids.run.click(); await until(() => !ui.ids["input-form"].hidden); ui.ids.stop.click(); await until(() => !ui.ids.run.disabled);
  assert.equal(ui.ids["input-form"].hidden, true); assert.equal(ui.ids.status.textContent, "Stopped");
  edit(ui, 'while true\nend'); ui.ids.run.click(); ui.ids.stop.click(); await until(() => !ui.ids.run.disabled); assert.equal(ui.ids.status.textContent, "Stopped");
  edit(ui, 'say "Again"'); await run(ui); assert.match(ui.ids.console.textContent, /Again/);
});
test("Studio errors navigate to the actual line", async () => {
  const ui = setup(); edit(ui, 'say "first"\nsay 1 / 0'); await run(ui);
  assert.match(ui.ids.console.textContent, /:2: You cannot divide by zero/);
  ui.ids.console.children.find(child => child.tagName === "button").click();
  assert.equal(ui.document.activeElement, ui.ids.editor); assert.equal(ui.ids.editor.value.slice(ui.ids.editor.selectionStart, ui.ids.editor.selectionEnd), "say 1 / 0");
});
test("Studio adds, renames, opens and removes a project file", async () => {
  const ui = setup(); ui.ids["new-file"].click(); assert.equal(ui.ids["file-dialog"].open, true);
  ui.ids["file-path"].value = "helpers.plain"; event(ui.ids["file-dialog-form"], "submit");
  assert.equal(ui.ids.filename.textContent, "helpers.plain"); edit(ui, 'make double(value)\ngive value * 2\nend');
  ui.ids["rename-file"].click(); ui.ids["file-path"].value = "tools.plain"; event(ui.ids["file-dialog-form"], "submit"); assert.equal(ui.ids.filename.textContent, "tools.plain");
  ui.ids["delete-file"].click(); assert.match(ui.ids.console.textContent, /Removed tools.plain/);
  ui.ids.console.children.find(child => child.tagName === "button").click(); assert.equal(ui.ids.filename.textContent, "tools.plain");
});
test("Studio runs modules, checks the project, and runs real language tests", async () => {
  const ui = setup(); choose(ui, "modules"); ui.ids.check.click(); assert.match(ui.ids.console.textContent, /3 source file/);
  await run(ui); assert.match(ui.ids.console.textContent, /Double 4 is 8/);
  await run(ui, true); assert.match(ui.ids.console.textContent, /3 passed, 0 failed/); assert.equal(ui.ids.status.textContent, "All tests passed");
});
test("Studio does not run an interactive program when no tests exist", async () => {
  const ui = setup(); choose(ui, "conversation"); await run(ui, true); assert.equal(ui.ids["input-form"].hidden, true); assert.match(ui.ids.console.textContent, /No tests found/);
});
test("Studio task manager saves real project data", async () => {
  const ui = setup(); choose(ui, "tasks"); ui.ids.run.click(); await until(() => !ui.ids["input-form"].hidden);
  ui.ids.answer.value = "add"; event(ui.ids["input-form"], "submit"); await until(() => ui.ids.question.textContent.includes("need to do"));
  ui.ids.answer.value = "A saved task"; event(ui.ids["input-form"], "submit"); await until(() => ui.ids.question.textContent.includes("like to do") && !ui.ids["input-form"].hidden);
  ui.ids.answer.value = "quit"; event(ui.ids["input-form"], "submit"); await until(() => !ui.ids.run.disabled);
  ui.ids["file-tabs"].children.find(child => child.textContent === "tasks.json").click(); assert.match(ui.ids.editor.value, /A saved task/);
});
test("Studio export and import preserve a runnable complete project", async () => {
  const ui = setup(); choose(ui, "modules"); ui.ids["export-project"].click(); await until(() => !!ui.download());
  const bytes = await ui.download().arrayBuffer(); const restored = setup();
  restored.ids["zip-input"].files = [{ size: bytes.byteLength, arrayBuffer: async () => bytes }]; event(restored.ids["zip-input"], "change");
  await until(() => restored.ids.status.textContent === "Project imported"); await run(restored); assert.match(restored.ids.console.textContent, /Double 4 is 8/);
});
test("Studio formats code, searches the library, and displays text safely", async () => {
  const ui = setup(); edit(ui, 'if true\nsay "<img src=x onerror=alert(1)>"\nend'); ui.ids.format.click(); assert.match(ui.ids.editor.value, /\n  say/);
  await run(ui); assert.equal(ui.ids.console.children[0].tagName, "div"); assert.equal(ui.ids.console.children[0].textContent, "<img src=x onerror=alert(1)>");
  ui.ids["library-search"].value = "list.map"; event(ui.ids["library-search"], "input"); assert.equal(ui.ids["library-list"].children.length, 1); assert.match(ui.ids["library-list"].textContent, /action\(item\)/);
});
test("Studio works when browser storage is disabled", async () => {
  const ui = setup({ storageFails: true }); edit(ui, 'say "Works"'); await run(ui); assert.match(ui.ids.console.textContent, /Works/); assert.match(ui.ids["project-status"].textContent, /Export ZIP/);
});
test("the actual generated HTML scripts boot and run in browser-global mode", async () => {
  const ui = setup({ bundle: true }); await run(ui); assert.match(ui.ids.console.textContent, /Hello, Ada!/);
  choose(ui, "modules"); await run(ui); assert.match(ui.ids.console.textContent, /Double 4 is 8/);
  ui.ids["export-project"].click(); await until(() => !!ui.download() || ui.ids.status.textContent === "Something to fix");
  assert.ok(ui.download(), ui.ids.console.textContent);
  assert.ok((await ui.download().arrayBuffer()).byteLength > 0);
});
