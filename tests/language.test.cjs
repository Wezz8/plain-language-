"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const Plain = require("../plain.js");
const home = path.resolve(__dirname, "..");
const lines = async (source, options) => (await Plain.run(source, options)).output;
const rejects = (source, pattern, line = 1, options) => assert.rejects(Plain.run(source, options), error => {
  assert.ok(error instanceof Plain.PlainError);
  assert.match(error.message, pattern);
  assert.equal(error.line, line);
  return true;
});

test("hello and reassignment", async () => {
  const result = await Plain.run('set name to "Ada"\nsay "Hello, " + name + "!"\nset name to "Sam"\nsay name');
  assert.deepEqual(result.output, ["Hello, Ada!", "Sam"]);
  assert.equal(result.variables.name, "Sam");
});
test("arithmetic precedence, negatives, parentheses, and decimals", async () => {
  assert.deepEqual(await lines('say 2 + 3 * 4\nsay (2 + 3) * 4\nsay -10 / 2\nsay .5 + 1.5\nsay 1e2\nsay +4'), ["14", "20", "-5", "2", "100", "4"]);
});
test("comments, escaped quotes, and keywords inside strings", async () => {
  assert.deepEqual(await lines('# comment\nsay "a # b" # trailing\nsay "is"\nsay "He said \\"hi\\""\nsay "a\\nb"'), ["a # b", "is", 'He said "hi"', "a\nb"]);
});
test("text joins numbers and booleans", async () => {
  assert.deepEqual(await lines('say "Score: " + 5\nsay 5 + " points"\nsay "Ready: " + true\nsay ""'), ["Score: 5", "5 points", "Ready: true", ""]);
});
for (const [expression, expected] of [
  ["3 is 3", "true"], ['3 is "3"', "false"], ["3 is not 4", "true"],
  ["4 is more than 3", "true"], ["3 is less than 4", "true"],
  ["3 is at least 3", "true"], ["3 is at most 3", "true"],
  ['"hi" is "hi"', "true"], ["true is false", "false"],
  ["true or false and false", "true"], ["not 5 is at least 10", "true"],
  ["not (true or false)", "false"], ["true or unknown", "true"], ["false and unknown", "false"]
]) test(`expression: ${expression}`, async () => assert.deepEqual(await lines("say " + expression), [expected]));

test("if, else, nested blocks, and global variables", async () => {
  const source = 'set score to 5\nif score is more than 3\nrepeat 2 times\nif false\nsay "wrong"\nelse\nset score to score + 1\nend\nend\nelse\nsay "wrong"\nend\nsay score';
  assert.deepEqual(await lines(source), ["7"]);
});
test("zero repeats, count evaluated once, and no else", async () => {
  assert.deepEqual(await lines('repeat 0 times\nsay missing\nend\nset count to 3\nrepeat count times\nsay count\nset count to count - 1\nend\nif false\nsay missing\nend'), ["3", "2", "1"]);
});
test("input preserves text and explicitly converts numbers", async () => {
  const answers = ["003", " -2.5 "];
  const questions = [];
  const result = await Plain.run('ask "Type into this box" into name\nask number "How much?" into amount\nsay name\nsay amount * 2', {
    read: (prompt, context) => { questions.push([prompt, context.numeric]); return answers.shift(); }
  });
  assert.deepEqual(result.output, ["003", "-5"]);
  assert.deepEqual(questions, [["Type into this box", false], ["How much?", true]]);
});
test("BOM, CRLF, blank programs, case-sensitive variables", async () => {
  assert.deepEqual(await lines('\uFEFFset Score to 3\r\nsay Score\r\n'), ["3"]);
  assert.deepEqual(await lines("\n# empty\n"), []);
  await rejects("set Score to 3\nsay score", /no value yet/, 2);
});
test("write callback and separate runs", async () => {
  const received = [];
  await Plain.run('set score to 3\nsay score', { write: (value, info) => received.push([value, info.line]) });
  assert.deepEqual(received, [["3", 2]]);
  await rejects("say score", /no value yet/);
});
test("special JavaScript property names are ordinary safe variables", async () => {
  const result = await Plain.run('set constructor to 3\nset toString to 4\nsay constructor + toString');
  assert.deepEqual(result.output, ["7"]);
  assert.equal(result.variables.constructor, 3);
});

for (const [source, pattern, line] of [
  ['print "Hello"', /do not know/, 1], ['set score = 4', /Use: set/, 1],
  ['set if to 4', /Plain word/, 1], ['set 2cats to 4', /Use: set/, 1],
  ['say', /Use: say/, 1], ['say "hi', /Close your text/, 1],
  ["say 'hi'", /double quotes/, 1], ['say "bad\\q"', /invalid escape/, 1],
  ['if true\nsay 1', /needs an "end"/, 1], ['end', /no matching/, 1],
  ['else', /no matching/, 1], ['repeat 2 times\nelse\nend', /belongs inside/, 2],
  ['if true\nelse\nelse\nend', /only once/, 3], ['if true\nend if', /own line/, 2],
  ['repeat 3\nend', /repeat 3 times/, 1], ['if 3 >= 2\nend', /Use words/, 1],
  ['say (2 + 3', /Expected "\)"/, 1], ['say 3 is at nearly 4', /is at least/, 1],
  ['say 3 is less 4', /Expected "than"/, 1], ['say 3 is 3 is 3', /Unexpected/, 1],
  ['say hello world', /Unexpected/, 1], ['say 1e309', /too large/, 1],
  ['if false\nsay 2 +\nend', /Expected a number/, 2], ['say process.exit(1)', /no value yet/, 1]
]) test(`syntax error: ${source.split("\n")[0]}`, async () => rejects(source, pattern, line));

for (const [source, pattern, line] of [
  ['say unknown', /no value yet/, 1], ['say 1 / 0', /divide by zero/, 1],
  ['say "2" - 1', /needs numbers/, 1], ['say true + 1', /needs numbers/, 1],
  ['if 1\nsay "hi"\nend', /true or false/, 1], ['say true and 1', /true or false/, 1],
  ['say "b" is more than "a"', /needs numbers/, 1], ['say 1e308 * 1e308', /too large/, 1],
  ['repeat -1 times\nend', /whole number/, 1], ['repeat 2.5 times\nend', /whole number/, 1],
  ['repeat "3" times\nend', /whole number/, 1], ['say "first"\nsay 1 / 0', /divide by zero/, 2],
  ['ask 123 into name', /question must be text/, 1], ['ask "Hi?" into name', /needs input/, 1]
]) test(`runtime error: ${source.split("\n")[0]}`, async () => rejects(source, pattern, line));

for (const answer of ["", "   ", "abc", "Infinity", "0x10", "1,000", "1e309", "--1"]) {
  test(`reject invalid numeric input: ${JSON.stringify(answer)}`, async () => rejects('ask number "Number?" into amount', /not a number/, 1, { read: () => answer }));
}
test("step limit also covers empty loops", async () => rejects("repeat 1000000 times\nend", /step limit/, 1, { maxSteps: 20 }));
test("output and growing text limits", async () => {
  await rejects('repeat 10 times\nsay "hello"\nend', /too much text/, 2, { maxOutputChars: 10 });
  await rejects('set text to "12345"\nset text to text + text', /text is too long/, 2, { maxOutputChars: 8 });
});
test("program, expression and nesting limits produce friendly errors", () => {
  assert.throws(() => Plain.parse(" ".repeat(500001)), /too large/);
  assert.throws(() => Plain.parse("say " + "(".repeat(70) + "1" + ")".repeat(70)), /nested too deeply/);
  assert.throws(() => Plain.parse("repeat 1 times\n".repeat(70) + "end\n".repeat(70)), /Too many blocks/);
  assert.throws(() => Plain.parse("say " + Array(300).fill("1").join(" + ")), /expression is too long/);
});
test("stop a running program and stop while waiting for input", async () => {
  const controller = new AbortController();
  await assert.rejects(Plain.run('repeat 1000 times\nsay "hi"\nend', { signal: controller.signal, write: () => controller.abort() }), error => error.code === "STOPPED");
  const waiting = new AbortController();
  await assert.rejects(Plain.run('ask "Name?" into name', { signal: waiting.signal, read: () => {
    queueMicrotask(() => waiting.abort()); return new Promise(() => {});
  } }), error => error.code === "STOPPED");
});
test("cancelled input is handled", async () => {
  await assert.rejects(Plain.run('ask "Name?" into name', { read: () => null }), error => error.code === "STOPPED");
});
test("all bundled examples parse and run", async () => {
  for (const name of fs.readdirSync(path.join(home, "examples"))) {
    const answers = ["Ada", "3"];
    const result = await Plain.run(fs.readFileSync(path.join(home, "examples", name), "utf8"), { read: () => answers.shift() });
    assert.ok(result.output.length > 0, name);
  }
});
test("CLI runs, checks, and reports a missing file", () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(home, "plain.cjs"), ...args], { cwd: home, encoding: "utf8", timeout: 5000 });
  const hello = run("examples/hello.plain");
  assert.equal(hello.status, 0); assert.match(hello.stdout, /Hello, Ada!/);
  const check = run("--check", "examples/conversation.plain");
  assert.equal(check.status, 0); assert.match(check.stdout, /Syntax looks good/);
  const missing = run("missing.plain");
  assert.equal(missing.status, 1); assert.match(missing.stderr, /Could not find/);
});
test("CLI consumes multiple piped answers without losing input", () => {
  const result = spawnSync(process.execPath, [path.join(home, "plain.cjs"), "examples/conversation.plain"], { cwd: home, encoding: "utf8", input: "Sam\n2\n", timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Hello, Sam!/);
  assert.equal(result.stdout.split("\n").filter(line => line === "*").length, 2);
});
test("standalone playground bundles valid engine and app scripts", () => {
  const result = spawnSync(process.execPath, [path.join(home, "build.cjs")], { cwd: home, encoding: "utf8" });
  assert.equal(result.status, 0);
  const html = fs.readFileSync(path.join(home, "Plain.html"), "utf8");
  assert.ok(!html.includes("<!--PLAIN_"));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 4);
  scripts.forEach((match, index) => new vm.Script(match[1], { filename: `bundle-${index}.js` }));
});
