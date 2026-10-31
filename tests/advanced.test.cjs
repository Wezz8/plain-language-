"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Plain = require("../plain.js");
const out = async (source, options) => (await Plain.run(source, options)).output;
const error = (source, code, options) => assert.rejects(Plain.run(source, options), err => err instanceof Plain.PlainError && err.code === code);

test("functions return values and recurse", async () => {
  assert.deepEqual(await out('make factorial(amount)\nif amount is at most 1\ngive 1\nend\ngive amount * factorial(amount - 1)\nend\nsay factorial(6)'), ["720"]);
});
test("function-local assignment does not overwrite outer names", async () => {
  assert.deepEqual(await out('set score to 5\nmake change()\nset score to 10\ngive score\nend\nsay change(), score'), ["10 5"]);
});
test("lexical closures and higher-order functions", async () => {
  assert.deepEqual(await out('make multiplier(factor)\nmake apply(value)\ngive value * factor\nend\ngive apply\nend\nset twice to multiplier(2)\nsay list.map([1, 2, 3], twice)'), ["[2, 4, 6]"]);
});
test("functions without give return nothing", async () => assert.deepEqual(await out('make empty()\nend\nsay empty()'), ["nothing"]));
test("function argument counts and recursion limits have readable errors", async () => {
  await error('make one(value)\ngive value\nend\nsay one()', "ARGUMENT_ERROR");
  await error('make again()\ngive again()\nend\nagain()', "LIMIT", { maxCallDepth: 12 });
});
test("error locations and function call frames include source names", async () => {
  await assert.rejects(Plain.run('make crash()\ngive 1 / 0\nend\ncrash()', { sourceName: "sample.plain" }), err => {
    assert.equal(err.line, 2); assert.equal(err.source, "sample.plain"); assert.equal(err.frames[0].name, "crash"); assert.equal(err.frames[0].line, 4); return true;
  });
});
test("lists and records, nested assignment, removal, and one-based positions", async () => {
  assert.deepEqual(await out('set person to {name: "Ada", scores: [10, 20]}\nset person.scores[1] to 30\nadd 40 to person.scores\nremove person.scores[2]\nset person.active to true\nsay person.name, person.scores, person.active\nremove person.name\nsay has(person, "name")'), ["Ada [30, 40] true", "false"]);
});
test("Unicode text positions count characters", async () => assert.deepEqual(await out('say length("A😀B"), "A😀B"[2], text.slice("A😀B", 2, 3)'), ["3 😀 😀B"]));
test("list concatenation, structural equality, and deep copies", async () => {
  assert.deepEqual(await out('set original to [{name: "Ada"}]\nset other to copy(original)\nset other[1].name to "Sam"\nsay original[1].name\nsay [1, 2] + [3]\nsay {a: [1, 2]} is {a: [1, 2]}\nsay nothing is false'), ["Ada", "[1, 2, 3]", "true", "false"]);
});
test("aliases share mutable records intentionally", async () => assert.deepEqual(await out('set first to {count: 1}\nset second to first\nset second.count to 2\nsay first.count'), ["2"]));
test("prototype-like fields stay ordinary data", async () => {
  assert.deepEqual(await out('set data to {"__proto__": {safe: true}, constructor: 3}\nsay data["__proto__"].safe, data.constructor\nsay json.write(data)'), ['true 3', '{"__proto__":{"safe":true},"constructor":3}']);
});
test("multiline data, trailing commas, comments, and keyword text", async () => {
  assert.deepEqual(await out('set data to {\n  "a to b": [\n    "go to school", # a comment\n    "two",\n  ],\n}\nset data["a to b"][2] to "new"\nadd "want to learn" to data["a to b"]\nsay data["a to b"]'), ['["go to school", "new", "want to learn"]']);
});
test("for positions, snapshot iteration, skip, stop, and while", async () => {
  assert.deepEqual(await out('set items to [1, 2, 3]\nfor item at position in items\nif item is 2\nskip\nend\nsay position, item\nadd 4 to items\nend\nset count to 0\nwhile true\nset count to count + 1\nif count is 2\nstop\nend\nend\nsay count'), ["1 1", "3 3", "2"]);
});
test("else-if selects exactly one branch", async () => assert.deepEqual(await out('set n to 2\nif n is 1\nsay "one"\nelse if n is 2\nsay "two"\nelse if n is 3\nsay "three"\nelse\nsay "other"\nend'), ["two"]));
test("remainder works and zero is rejected", async () => { assert.deepEqual(await out('say 7 % 3'), ["1"]); await error('say 7 % 0', "NUMBER_ERROR"); });
test("try, catch, fail, and finally", async () => {
  assert.deepEqual(await out('try\nfail "Oops"\ncatch issue\nsay issue.message, issue.code\nfinally\nsay "Always"\nend'), ["Oops USER_ERROR", "Always"]);
});
test("finally executes on function return and loop stop", async () => {
  assert.deepEqual(await out('make answer()\ntry\ngive 42\nfinally\nsay "leaving"\nend\nend\nsay answer()\nrepeat 5 times\ntry\nstop\nfinally\nsay "stopping"\nend\nend'), ["leaving", "42", "stopping"]);
});
test("resource limits cannot be swallowed by catch", async () => error('try\nwhile true\nend\ncatch issue\nsay "caught"\nend', "LIMIT", { maxSteps: 30 }));
test("checks and test blocks record passing and failing tests", async () => {
  const source = 'test "good"\ncheck 2 + 2 is 4\nend\ntest "bad"\ncheck false, "Expected this to pass"\nend';
  assert.equal((await Plain.run(source)).tests.length, 0);
  const result = await Plain.run(source, { test: true });
  assert.equal(result.passed, 1); assert.equal(result.failed, 1); assert.equal(result.tests[1].error.message, "Expected this to pass");
});
test("test-local names do not leak between cases", async () => {
  const result = await Plain.run('set value to 1\ntest "first"\nset value to 99\ncheck value is 99\nend\ntest "second"\ncheck value is 1\nend', { test: true });
  assert.equal(result.passed, 2); assert.equal(result.variables.value, 1);
});
test("modules cache execution, keep private scope, and export functions", async () => {
  let loads = 0;
  const result = await Plain.run('use "tools.plain" as tools\nuse "tools.plain" as same\nsay tools.double(4), same.base', {
    loadModule: () => { loads++; return { id: "tools.plain", source: 'say "loaded"\nset base to 3\nmake double(value)\ngive value * 2\nend' }; }
  });
  assert.deepEqual(result.output, ["loaded", "8 3"]); assert.equal(loads, 2); assert.equal(result.variables.base, undefined);
});
test("cyclic imports and unavailable module loading are clear errors", async () => {
  await error('use "tools.plain" as tools', "MODULE_ERROR");
  await error('use "tools.plain" as tools', "MODULE_CYCLE", { loadModule: () => ({ id: "tools.plain", source: 'use "tools.plain" as tools' }) });
});
test("built-in namespaces and module export names are read-only", async () => {
  await error('set math.pi to 3', "READ_ONLY");
  await error('use "one.plain" as one\nset one.value to 5', "READ_ONLY", { loadModule: () => ({ id: "one.plain", source: 'set value to 1' }) });
});
test("sessions keep variables, functions, and built-ins across runs", async () => {
  const session = Plain.createSession(); await session.run('set amount to 4\nmake twice(value)\ngive value * 2\nend');
  assert.deepEqual((await session.run('say twice(amount), length(range(3))')).output, ["8 3"]);
  session.reset(); await assert.rejects(session.run('say amount'), err => err.code === "UNKNOWN_NAME");
});
test("format preserves program behaviour and is idempotent", async () => {
  const source = 'make value()\nif true\ngive [\n1,\n2\n]\nelse\ngive []\nend\nend\nsay value()';
  const formatted = Plain.format(source); assert.equal(Plain.format(formatted), formatted); assert.deepEqual(await out(formatted), await out(source)); assert.match(formatted, /\n    give/);
});
test("path resolution stays inside a project", () => {
  assert.equal(Plain.resolvePath("../helpers.plain", "tests/main.test.plain"), "helpers.plain");
  assert.equal(Plain.resolvePath(".\\data.txt"), "data.txt");
  for (const value of ["../secret", "/absolute", "C:\\secret", "", "http://site"]) assert.throws(() => Plain.resolvePath(value), err => err.code === "PATH_ERROR");
});
for (const [expression, expected] of [
  ['type(nothing)', 'nothing'], ['type([1])', 'list'], ['type({a: 1})', 'record'], ['type(length)', 'function'],
  ['number(" -3.5 ")', '-3.5'], ['text(42)', '42'], ['length({a: 1, b: 2})', '2'],
  ['range(4)', '[1, 2, 3, 4]'], ['range(0)', '[]'], ['range(5, 1, -2)', '[5, 3, 1]'], ['range(3, 1)', '[3, 2, 1]'], ['range(1, 3, -1)', '[]'],
  ['keys({b: 1, a: 2})', '["b", "a"]'], ['values({a: 2, b: 3})', '[2, 3]'], ['get({a: 2}, "z", 7)', '7'], ['get({}, "z")', 'nothing'],
  ['has([1, {a: 2}], {a: 2})', 'true'], ['has("hello", "ell")', 'true'],
  ['text.upper("Hello")', 'HELLO'], ['text.lower("Hello")', 'hello'], ['text.trim(" hi ")', 'hi'],
  ['text.contains("hello", "ell")', 'true'], ['text.starts("hello", "he")', 'true'], ['text.ends("hello", "lo")', 'true'],
  ['text.split("a,b,c", ",")', '["a", "b", "c"]'], ['text.split("😀A", "")', '["😀", "A"]'], ['text.lines("a\\nb")', '["a", "b"]'],
  ['text.replace("a-b-a", "a", "x")', 'x-b-x'], ['text.repeat("ha", 3)', 'hahaha'],
  ['list.first([])', 'nothing'], ['list.last([1, 2])', '2'], ['list.slice([1,2,3], 2, 3)', '[2, 3]'], ['list.slice([], 1)', '[]'],
  ['list.join([1, 2], " + ")', '1 + 2'], ['list.reverse([1,2])', '[2, 1]'], ['list.sum([1, 2, 3])', '6'], ['list.unique([1,2,1])', '[1, 2]'],
  ['list.sort([3,1,2])', '[1, 2, 3]'], ['list.sort(["b", "a"])', '["a", "b"]'], ['math.abs(-3)', '3'], ['math.floor(3.9)', '3'],
  ['math.ceil(3.1)', '4'], ['math.sqrt(16)', '4'], ['math.round(3.14159, 2)', '3.14'], ['math.power(2, 8)', '256'],
  ['math.min([3,1,2])', '1'], ['math.max(3, 5)', '5'], ['math.clamp(20, 0, 10)', '10'],
  ['math.sin(0)', '0'], ['math.cos(0)', '1'], ['math.tan(0)', '0'], ['math.log(1)', '0'],
  ['json.read("{\\"score\\":4}").score', '4'], ['json.write({name: "Ada", missing: nothing})', '{"name":"Ada","missing":null}'],
  ['time.date("2026-10-31T12:30:00Z")', '2026-10-31'], ['system.version', '1.0.0']
]) test(`library: ${expression}`, async () => assert.deepEqual(await out("say " + expression), [expected]));

test("collection callbacks filter, find, reduce, every, some and sort by key", async () => {
  const source = 'make even(value)\ngive value % 2 is 0\nend\nmake plus(a, b)\ngive a + b\nend\nmake byScore(person)\ngive person.score\nend\nsay list.filter(range(5), even)\nsay list.find(range(5), even)\nsay list.some(range(5), even), list.every([2,4], even)\nsay list.reduce(range(4), 0, plus)\nsay list.sort([{score: 4}, {score: 1}], byScore)';
  assert.deepEqual(await out(source), ['[2, 4]', '2', 'true true', '10', '[{score: 1}, {score: 4}]']);
});
test("clock, randomness, args, and platform adapters are deterministic", async () => {
  assert.deepEqual(await out('say time.stamp(), time.now(), time.date()\nsay random.number(), random.integer(1, 6), random.pick(["a", "b"])\nsay system.args, system.platform', { now: () => 0, random: () => 0.5, args: ["one"], platform: "test" }), ['0 1970-01-01T00:00:00.000Z 1970-01-01', '0.5 4 b', '["one"] test']);
});
test("file and HTTP adapters receive language data and return records", async () => {
  const disk = new Map(); const requests = [];
  const result = await Plain.run('files.write("note.txt", "Hello")\nsay files.read("note.txt")\nset response to http.get("https://example.invalid")\nsay response.status, response.body\nsay http.json("https://example.invalid").ok', {
    files: { write: (name, value) => disk.set(name, value) && null, read: name => disk.get(name) },
    request: request => { requests.push(request); return { status: 200, ok: true, body: '{"ok":true}', headers: {} }; }
  });
  assert.deepEqual(result.output, ['Hello', '200 {"ok":true}', 'true']); assert.equal(requests[0].method, "GET");
});
test("asynchronous sleep can be cancelled", async () => {
  const controller = new AbortController(); const promise = Plain.run('time.sleep(10000)', { signal: controller.signal });
  setTimeout(() => controller.abort(), 5); await assert.rejects(promise, err => err.code === "STOPPED");
});
for (const [source, code] of [
  ['say [1][0]', 'NUMBER_ERROR'], ['say [1][2]', 'INDEX_ERROR'], ['say {a: 1}.b', 'FIELD_ERROR'],
  ['set values to []\nadd values to values', 'CYCLE'], ['set data to {}\nset data.self to data', 'CYCLE'],
  ['say math.sqrt(-1)', 'NUMBER_ERROR'], ['say number("")', 'NUMBER_ERROR'], ['say range(1, 4, 0)', 'NUMBER_ERROR'],
  ['say list.sort([1, "a"])', 'TYPE_ERROR'], ['say text.replace("abc", "", "x")', 'ARGUMENT_ERROR'],
  ['say json.read("bad")', 'JSON_ERROR'], ['say json.write(length)', 'TYPE_ERROR'], ['say files.read("note")', 'CAPABILITY_ERROR'],
  ['say http.get("ftp://test")', 'ARGUMENT_ERROR'], ['say http.get("https://example.invalid")', 'CAPABILITY_ERROR'],
  ['say time.date("bad")', 'DATE_ERROR'], ['say random.integer(5, 1)', 'ARGUMENT_ERROR'], ['say random.pick([])', 'ARGUMENT_ERROR'],
  ['say list.slice([1], 1, 3)', 'INDEX_ERROR'], ['say math.min([])', 'ARGUMENT_ERROR']
]) test(`error code ${code}: ${source.split("\n")[0]}`, async () => error(source, code));
test("collection and data-depth limits remain bounded", async () => {
  await error('say range(10)', 'LIMIT', { maxItems: 5 });
  await error('say text.repeat("abc", 100)', 'LIMIT', { maxOutputChars: 20 });
  await error('set data to nothing\nrepeat 200 times\nset data to [data]\nend', 'LIMIT');
  await error('say json.read("[[1,2,3]]")', 'LIMIT', { maxItems: 2 });
});
test("display and JSON serialization bound expanded shared data", async () => {
  const source = 'set value to [0]\nrepeat 24 times\nset value to [value, value]\nend\n';
  await error(source + 'say value', 'LIMIT');
  await error(source + 'say json.write(value)', 'LIMIT');
});
test("joining empty strings preserves separators", async () => assert.deepEqual(await out('say list.join(["", "a", ""], ",")'), [',a,']));
test("nested tests are rejected before execution", () => assert.throws(() => Plain.parse('make bad()\ntest "nested"\nend\nend'), /top level/));
for (const source of ['give 1', 'stop', 'skip', 'make bad(a, a)\nend', 'set item to {name: 1, name: 2}', 'for x at x in []\nend', 'try\nsay 1\nend', 'use name as helper', 'make missing\nend', 'remove name']) {
  test(`reject malformed program: ${source.split("\n")[0]}`, () => assert.throws(() => Plain.parse(source), Plain.PlainError));
}
