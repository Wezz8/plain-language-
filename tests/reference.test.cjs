"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Plain = require("../plain.js");
const info = require("../library-info.cjs");
const home = path.resolve(__dirname, "..");
test("every callable standard-library function is documented", () => {
  const names = Plain.catalog().map(item => item.name).sort(); assert.deepEqual(Object.keys(info).sort(), names);
  for (const item of Object.values(info)) { assert.ok(item.signature.includes("(")); assert.ok(item.description.length > 10); }
});
test("handbook examples are valid Plain source", () => {
  for (const name of ["Language.md", "Tools.md", "Runtime.md"]) {
    const text = fs.readFileSync(path.join(home, "docs", name), "utf8");
    for (const match of text.matchAll(/```plain\n([\s\S]*?)```/g)) Plain.parse(match[1], { sourceName: name });
  }
});
test("VS Code extension paths and regular expressions are valid", () => {
  const directory = path.join(home, "editor/plain-vscode"); const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  assert.deepEqual(manifest.contributes.languages[0].extensions, [".plain"]);
  const grammar = JSON.parse(fs.readFileSync(path.join(directory, manifest.contributes.grammars[0].path), "utf8"));
  for (const item of grammar.patterns) { if (item.match) new RegExp(item.match); if (item.begin) new RegExp(item.begin); if (item.end) new RegExp(item.end); for (const child of item.patterns || []) if (child.match) new RegExp(child.match); }
  const config = JSON.parse(fs.readFileSync(path.join(directory, "language-configuration.json"), "utf8")); for (const value of Object.values(config.indentationRules)) new RegExp(value);
});
test("the source package has a consistent release version", () => {
  assert.equal(require("../package.json").version, Plain.VERSION);
  assert.equal(require("../editor/plain-vscode/package.json").version, Plain.VERSION);
});
