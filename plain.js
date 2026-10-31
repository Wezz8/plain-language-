/* Plain 1.0 — readable programs, a real parser, and an embeddable runtime. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Plain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "1.0.0";
  const RESERVED = new Set("set to say ask into if else end repeat times true false nothing and or not is more less than at least most make give for in while stop skip add remove use as try catch finally fail check test".split(" "));
  const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = () => Object.create(null);
  class PlainError extends Error {
    constructor(message, line = 1, column = 1, code = "PLAIN_ERROR", source = "program.plain") {
      super(message); this.name = "PlainError"; this.line = line; this.column = column;
      this.code = code; this.source = source; this.frames = [];
    }
  }
  function problem(message, place = {}, code = "PLAIN_ERROR") { throw new PlainError(message, place.line || 1, place.column || 1, code, place.source || "program.plain"); }
  class Flow { constructor(kind, value = null) { this.kind = kind; this.value = value; } }
  class Native { constructor(name, min, max, call, props = null) { Object.assign(this, { name, min, max, call, props }); } }
  class Action { constructor(node, scope) { this.name = node.name; this.node = node; this.scope = scope; } }
  class Scope {
    constructor(parent = null) { this.parent = parent; this.values = new Map(); }
    get(name, place) {
      if (this.values.has(name)) return this.values.get(name);
      if (this.parent) return this.parent.get(name, place);
      problem(`"${name}" has no value yet. Set it first, like: set ${name} to 10`, place, "UNKNOWN_NAME");
    }
    set(name, value) { this.values.set(name, value); return value; }
  }
  function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Native) && !(value instanceof Action); }
  function kind(value) {
    if (value === null) return "nothing";
    if (value instanceof Action || value instanceof Native) return "function";
    if (Array.isArray(value)) return "list";
    if (typeof value === "string") return "text";
    if (isRecord(value)) return "record";
    return typeof value;
  }
  function display(value, seen = new Set(), nested = false, budget = { left: 1000000 }) {
    function part(text) { budget.left -= text.length; if (budget.left < 0) throw new PlainError("This value is too large to display. Print a smaller part of it.", 1, 1, "LIMIT"); return text; }
    if (value === null) return part("nothing");
    if (typeof value === "string") return part(nested ? JSON.stringify(value) : value);
    if (typeof value === "number" || typeof value === "boolean") return part(String(value));
    if (value instanceof Action || value instanceof Native) return part(`<function ${value.name}>`);
    if (seen.has(value)) return part("<cycle>");
    if (seen.size > 128) throw new PlainError("This value is nested too deeply to display.", 1, 1, "LIMIT");
    seen.add(value);
    const pieces = [], keys = Object.keys(value); part("[]");
    for (const key of keys) {
      if (pieces.length) part(", ");
      const prefix = Array.isArray(value) ? "" : part(key + ": ");
      pieces.push(prefix + display(value[key], seen, true, budget));
    }
    const text = (Array.isArray(value) ? "[" : "{") + pieces.join(", ") + (Array.isArray(value) ? "]" : "}");
    seen.delete(value);
    if (text.length > 1000000) throw new PlainError("This value is too large to display. Print a smaller part of it.", 1, 1, "LIMIT");
    return text;
  }
  function equal(a, b, seen = new Map()) {
    if (a === b) return true;
    if (kind(a) !== kind(b) || !["list", "record"].includes(kind(a))) return false;
    if (seen.get(a)?.has(b)) return true;
    if (!seen.has(a)) seen.set(a, new Set()); seen.get(a).add(b);
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(key => own(b, key) && equal(a[key], b[key], seen));
  }
  function clone(value, seen = new Map()) {
    if (!["list", "record"].includes(kind(value))) return value;
    if (seen.has(value)) return seen.get(value);
    const result = Array.isArray(value) ? [] : record(); seen.set(value, result);
    for (const key of Object.keys(value)) result[key] = clone(value[key], seen);
    return result;
  }
  function logicalLines(source, sourceName) {
    const result = [], stack = []; let text = "", first = 1, quoted = false, escaped = false;
    const raw = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
    for (let n = 0; n < raw.length; n++) {
      if (!text) first = n + 1;
      let part = "";
      for (let i = 0; i < raw[n].length; i++) {
        const ch = raw[n][i];
        if (quoted) {
          part += ch;
          if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false;
        } else if (ch === "#") break;
        else {
          part += ch;
          if (ch === '"') quoted = true;
          else if ("([{".includes(ch)) stack.push({ ch, line: n + 1, column: i + 1, source: sourceName });
          else if (")]}".includes(ch)) {
            const opening = stack.pop();
            if (!opening || "([{".indexOf(opening.ch) !== ")]}".indexOf(ch)) problem(`Unexpected "${ch}". Check your brackets.`, { line: n + 1, column: i + 1, source: sourceName });
          }
        }
      }
      if (quoted) problem('Close your text with a double quote ( ").', { line: n + 1, source: sourceName });
      text += (text ? "\n" : "") + part;
      if (!stack.length) { result.push({ raw: text, text: text.trim(), line: first, source: sourceName }); text = ""; }
    }
    if (stack.length) { const last = stack[stack.length - 1]; problem(`Expected "${")]}"["([{".indexOf(last.ch)]}" to close this expression.`, last); }
    return result;
  }
  function expression(text, place, many = false) {
    const tokens = []; let cursor = 0, line = place.line, column = place.column || 1;
    function advance(str) { for (const ch of str) { if (ch === "\n") { line++; column = 1; } else column++; } cursor += str.length; }
    while (cursor < text.length) {
      const ch = text[cursor], loc = { line, column, source: place.source };
      if (/\s/.test(ch)) { advance(ch); continue; }
      if (ch === '"') {
        const start = cursor; advance(ch); let closed = false;
        while (cursor < text.length) {
          if (text[cursor] === "\\") { advance(text.slice(cursor, cursor + 2)); continue; }
          if (text[cursor] === '"') { advance('"'); closed = true; break; } advance(text[cursor]);
        }
        if (!closed) problem('Close your text with a double quote ( ").', loc);
        let value; try { value = JSON.parse(text.slice(start, cursor)); } catch { problem('That text has an invalid escape. Use \\n, \\t, \\" or \\\\.', loc); }
        tokens.push({ type: "literal", value, ...loc });
      } else {
        const rest = text.slice(cursor), number = rest.match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/i), word = rest.match(/^[A-Za-z][A-Za-z0-9_]*/);
        if (number) { const value = Number(number[0]); if (!Number.isFinite(value)) problem("That number is too large.", loc); tokens.push({ type: "literal", value, ...loc }); advance(number[0]); }
        else if (word) { tokens.push({ type: "word", value: word[0], ...loc }); advance(word[0]); }
        else if ("+-*/%()[]{},.:".includes(ch)) { tokens.push({ type: "symbol", value: ch, ...loc }); advance(ch); }
        else if ("=<>!".includes(ch)) problem('Use words to compare: "is", "is not", "is more than", or "is at least".', loc);
        else problem(ch === "'" ? 'Put text inside double quotes, like "Hello".' : `I do not understand "${ch}" here.`, loc);
      }
      if (tokens.length > 512) problem("This expression is too long. Split it into a few set commands.", loc, "LIMIT");
    }
    tokens.push({ type: "end", value: "", line, column, source: place.source }); let position = 0, depth = 0;
    const current = () => tokens[position];
    const at = value => current().type !== "literal" && current().value === value;
    const take = value => at(value) ? tokens[position++] : null;
    const expect = value => { if (!take(value)) problem(`Expected "${value}" here.`, current()); };
    const node = (tag, fields, loc) => ({ kind: tag, ...fields, line: loc.line, column: loc.column, source: loc.source });
    const binary = (left, op, right) => node("binary", { left, op, right }, left);
    function nested(fn) { if (++depth > 64) problem("This expression is nested too deeply. Use a few set commands.", current(), "LIMIT"); const value = fn(); depth--; return value; }
    function separated(close) { const items = []; if (!at(close)) do { if (at(close)) break; items.push(nested(or)); } while (take(",")); expect(close); return items; }
    function primary() {
      const token = current();
      if (token.type === "literal") { position++; return node("literal", { value: token.value }, token); }
      if (take("(")) { const value = nested(or); expect(")"); return value; }
      if (take("[")) return node("list", { items: separated("]") }, token);
      if (take("{")) {
        const entries = [], keys = new Set();
        if (!at("}")) do {
          if (at("}")) break; const key = current();
          if (key.type !== "word" && !(key.type === "literal" && typeof key.value === "string")) problem('A field needs a name, like: {name: "Ada"}', key);
          position++; expect(":"); if (keys.has(key.value)) problem(`The field "${key.value}" appears twice.`, key); keys.add(key.value);
          entries.push([key.value, nested(or)]);
        } while (take(","));
        expect("}"); return node("record", { entries }, token);
      }
      for (const [word, value] of [["true", true], ["false", false], ["nothing", null]]) if (take(word)) return node("literal", { value }, token);
      if (token.type === "word" && !RESERVED.has(token.value)) { position++; return node("variable", { name: token.value }, token); }
      problem('Expected a number, text in double quotes, a list, a record, or a variable name.', token);
    }
    function postfix() {
      let value = primary();
      while (true) {
        if (take("(")) value = node("call", { target: value, args: separated(")") }, value);
        else if (take("[")) { const key = nested(or); expect("]"); value = node("member", { target: value, key }, value); }
        else if (take(".")) { const key = current(); if (key.type !== "word") problem('Use a field name after ".".', key); position++; value = node("member", { target: value, key: node("literal", { value: key.value }, key) }, value); }
        else break;
      } return value;
    }
    function unary() { const token = current(); if (take("-") || take("+")) return node("unary", { op: token.value, value: nested(unary) }, token); return postfix(); }
    function product() { let value = unary(); while (at("*") || at("/") || at("%")) { const op = tokens[position++].value; value = binary(value, op, unary()); } return value; }
    function sum() { let value = product(); while (at("+") || at("-")) { const op = tokens[position++].value; value = binary(value, op, product()); } return value; }
    function comparison() {
      const left = sum(); if (!take("is")) return left; let op = "is";
      if (take("not")) op = "is not";
      else if (take("more")) { expect("than"); op = ">"; }
      else if (take("less")) { expect("than"); op = "<"; }
      else if (take("at")) { if (take("least")) op = ">="; else if (take("most")) op = "<="; else problem('Use "is at least" or "is at most".', current()); }
      return binary(left, op, sum());
    }
    function not() { const token = take("not"); return token ? node("unary", { op: "not", value: nested(not) }, token) : comparison(); }
    function and() { let value = not(); while (take("and")) value = binary(value, "and", not()); return value; }
    function or() { let value = and(); while (take("or")) value = binary(value, "or", and()); return value; }
    const result = many ? [or()] : or(); if (many) while (take(",")) result.push(or());
    if (current().type !== "end") problem(`Unexpected "${current().value}". Check the expression, or put text inside double quotes.`, current()); return result;
  }

  function splitWord(text, word) {
    let quoted = false, escaped = false, depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; }
      else if (ch === '"') quoted = true;
      else if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if (!depth && text.slice(i, i + word.length) === word && /\s/.test(text[i - 1] || "") && /\s/.test(text[i + word.length] || "")) return [text.slice(0, i).trim(), text.slice(i + word.length).trim()];
    }
    return null;
  }
  function parse(source, options = {}) {
    if (typeof source !== "string") throw new TypeError("Plain source must be text."); const sourceName = options.sourceName || "program.plain";
    if (source.length > 500000) problem("This program is too large. Keep it below 500,000 characters.", { source: sourceName }, "LIMIT");
    const lines = logicalLines(source, sourceName); let cursor = 0;
    function name(value, loc) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) problem(`"${value}" is not a variable name. Start names with a letter.`, loc);
      if (RESERVED.has(value)) problem(`"${value}" is a Plain word. Choose a different variable name.`, loc); return value;
    }
    function block(opening = null, stops = [], context = { loops: 0, action: false }, depth = 0) {
      if (depth > 64) problem("Too many blocks inside blocks. Keep nesting below 65 levels.", opening, "LIMIT"); const statements = [];
      while (cursor < lines.length) {
        const entry = lines[cursor++], { text, line, raw } = entry; if (!text) continue; const command = text.split(/\s/)[0];
        if (["end", "else", "catch", "finally"].includes(command)) {
          if (["end", "finally"].includes(command) && text !== command) problem(`Write "${command}" on its own line.`, entry);
          if (!opening) problem(`This "${command}" has no matching block.`, entry);
          if (!stops.includes(command)) problem(`"${command}" belongs inside its matching block, and can appear only once.`, entry);
          return { statements, stop: command, entry };
        }
        function expr(value, many = false) {
          const index = raw.indexOf(value, Math.max(0, raw.indexOf(command) + command.length)), before = raw.slice(0, Math.max(0, index));
          return expression(value, { line: line + (before.match(/\n/g) || []).length, column: before.length - before.lastIndexOf("\n"), source: sourceName }, many);
        }
        const append = (kind, fields = {}) => { const value = { kind, ...fields, line, column: raw.search(/\S/) + 1, source: sourceName }; statements.push(value); return value; };
        let match;
        if (command === "set") {
          const parts = splitWord(text.slice(4), "to"); match = parts && [null, ...parts]; if (!match || !match[1] || !match[2]) problem('Use: set score to 10', entry);
          if (/^[A-Za-z][A-Za-z0-9_]*$/.test(match[1])) name(match[1], entry);
          if (/^\d/.test(match[1])) problem('Use: set score to 10', entry);
          const target = expr(match[1]); if (!["variable", "member"].includes(target.kind)) problem('Set a name or a field, like: set person.name to "Ada"', entry);
          append("set", { target, value: expr(match[2]) });
        } else if (command === "say") {
          match = text.match(/^say\s+(.+)$/s); if (!match) problem('Use: say "Hello"', entry); append("say", { values: expr(match[1], true) });
        } else if (command === "ask") {
          match = text.match(/^ask\s+(number\s+)?(.+?)\s+into\s+([A-Za-z][A-Za-z0-9_]*)$/s); if (!match) problem('Use: ask "What is your name?" into name', entry);
          append("ask", { numeric: !!match[1], prompt: expr(match[2]), name: name(match[3], entry) });
        } else if (command === "if") {
          match = text.match(/^if\s+(.+)$/s); if (!match) problem('Use: if score is at least 10', entry);
          const branches = []; let condition = expr(match[1]), tail = [], done = false;
          while (!done) {
            const body = block(entry, ["else", "end"], context, depth + 1); branches.push({ condition, body: body.statements });
            if (body.stop === "end") done = true;
            else if (body.entry.text === "else") { tail = block(entry, ["end"], context, depth + 1).statements; done = true; }
            else { const next = body.entry.text.match(/^else\s+if\s+(.+)$/s); if (!next) problem('Use "else" or "else if condition".', body.entry); condition = expression(next[1], { line: body.entry.line, source: sourceName, column: body.entry.raw.indexOf(next[1]) + 1 }); }
          } append("if", { branches, tail });
        } else if (["repeat", "while", "for"].includes(command)) {
          const fields = {};
          if (command === "repeat") { match = text.match(/^repeat\s+(.+)\s+times$/s); if (!match) problem('Use: repeat 3 times', entry); fields.count = expr(match[1]); }
          else if (command === "while") { match = text.match(/^while\s+(.+)$/s); if (!match) problem('Use: while count is less than 10', entry); fields.condition = expr(match[1]); }
          else {
            match = text.match(/^for\s+([A-Za-z][A-Za-z0-9_]*)(?:\s+at\s+([A-Za-z][A-Za-z0-9_]*))?\s+in\s+(.+)$/s); if (!match) problem('Use: for item in items', entry);
            fields.name = name(match[1], entry); fields.index = match[2] ? name(match[2], entry) : null; if (fields.index === fields.name) problem("Use different names for the item and its position.", entry); fields.items = expr(match[3]);
          }
          fields.body = block(entry, ["end"], { ...context, loops: context.loops + 1 }, depth + 1).statements; append(command, fields);
        } else if (command === "make") {
          match = text.match(/^make\s+([A-Za-z][A-Za-z0-9_]*)\s*\((.*?)\)$/s); if (!match) problem('Use: make greet(name)', entry);
          const parameters = match[2].trim() ? match[2].split(",").map(value => name(value.trim(), entry)) : []; if (new Set(parameters).size !== parameters.length) problem("Each parameter needs a different name.", entry);
          const body = block(entry, ["end"], { loops: 0, action: true }, depth + 1).statements; append("make", { name: name(match[1], entry), parameters, body });
        } else if (command === "give") {
          if (!context.action) problem('"give" belongs inside a make block.', entry); match = text.match(/^give(?:\s+(.+))?$/s); append("give", { value: match[1] ? expr(match[1]) : { ...entry, kind: "literal", value: null } });
        } else if (command === "stop" || command === "skip") {
          if (text !== command) problem(`Write "${command}" on its own line.`, entry); if (!context.loops) problem(`"${command}" belongs inside a loop.`, entry); append(command);
        } else if (command === "add") {
          const parts = splitWord(text.slice(4), "to"); match = parts && [null, ...parts]; if (!match || !match[1] || !match[2]) problem('Use: add "Milk" to items', entry); append("add", { value: expr(match[1]), target: expr(match[2]) });
        } else if (command === "remove") {
          match = text.match(/^remove\s+(.+)$/s); if (!match) problem('Use: remove items[1]', entry); const target = expr(match[1]); if (target.kind !== "member") problem('Use a position or a field: remove items[1]', entry); append("remove", { target });
        } else if (command === "use") {
          match = text.match(/^use\s+("(?:[^"\\]|\\.)*")\s+as\s+([A-Za-z][A-Za-z0-9_]*)$/s); if (!match) problem('Use: use "helpers.plain" as helpers', entry); append("use", { path: expr(match[1]).value, name: name(match[2], entry) });
        } else if (command === "try") {
          if (text !== "try") problem('Write "try" on its own line.', entry); const body = block(entry, ["catch", "finally", "end"], context, depth + 1);
          let catchName = null, rescue = [], always = [], stop = body.stop;
          if (stop === "catch") {
            match = body.entry.text.match(/^catch\s+([A-Za-z][A-Za-z0-9_]*)$/); if (!match) problem('Use: catch problem', body.entry); catchName = name(match[1], body.entry);
            const caught = block(entry, ["finally", "end"], context, depth + 1); rescue = caught.statements; stop = caught.stop;
          }
          if (stop === "finally") always = block(entry, ["end"], context, depth + 1).statements;
          if (!catchName && body.stop !== "finally") problem('A try block needs "catch problem" or "finally".', entry); append("try", { body: body.statements, catchName, rescue, always });
        } else if (command === "fail" || command === "check") {
          match = text.match(/^(?:fail|check)\s+(.+)$/s); if (!match) problem(command === "fail" ? 'Use: fail "What went wrong"' : 'Use: check total is 10, "Expected 10"', entry);
          const values = expr(match[1], true); if (values.length > (command === "fail" ? 1 : 2)) problem(`Too many values after "${command}".`, entry); append(command, { values });
        } else if (command === "test") {
          if (opening) problem("Put test blocks at the top level of a test file.", entry);
          match = text.match(/^test\s+("(?:[^"\\]|\\.)*")$/s); if (!match) problem('Use: test "adds two numbers"', entry); const title = expr(match[1]).value;
          const body = block(entry, ["end"], { loops: 0, action: false }, depth + 1).statements; append("test", { title, body });
        } else {
          if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.|\[|\s*\()/.test(text)) problem(`I do not know the command "${command}". Use set, say, ask, if, repeat, make, for, while, or a function call.`, entry);
          const value = expression(text, { line, column: raw.search(/\S/) + 1, source: sourceName }); if (value.kind !== "call") problem("Use a command, or call a function with parentheses.", entry); append("call", { value });
        }
      }
      if (opening) problem(`This ${opening.text.split(/\s/)[0]} block needs an "end" on its own line.`, opening); return { statements, stop: null };
    }
    return block().statements;
  }

  function numeric(value, loc) {
    if (typeof value !== "number") problem('This calculation needs numbers. For numeric input, use: ask number "How many?" into count', loc, "TYPE_ERROR"); return value;
  }
  function boolean(value, loc) { if (typeof value !== "boolean") problem('A condition needs true or false. Try: if age is at least 18', loc, "TYPE_ERROR"); return value; }
  function textValue(value, loc) { if (typeof value !== "string") problem(`Expected text, but received ${kind(value)}.`, loc, "TYPE_ERROR"); return value; }
  function listValue(value, loc) { if (!Array.isArray(value)) problem(`Expected a list, but received ${kind(value)}.`, loc, "TYPE_ERROR"); return value; }
  function recordValue(value, loc) { if (!isRecord(value)) problem(`Expected a record, but received ${kind(value)}.`, loc, "TYPE_ERROR"); return value; }
  function finite(value, loc) { if (!Number.isFinite(value)) problem("This calculation produced a number that is too large or outside its valid range.", loc, "NUMBER_ERROR"); return value; }
  function whole(value, loc, minimum = 0) { numeric(value, loc); if (!Number.isSafeInteger(value) || value < minimum) problem(`Expected a whole number, ${minimum} or more.`, loc, "NUMBER_ERROR"); return value; }
  function fromData(value, loc, depth = 0) {
    if (depth > 128) problem("This data is nested too deeply. Keep it below 129 levels.", loc, "LIMIT");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return finite(value, loc);
    if (Array.isArray(value)) return value.map(item => fromData(item, loc, depth + 1));
    if (value && typeof value === "object") { const result = record(); for (const key of Object.keys(value)) result[key] = fromData(value[key], loc, depth + 1); return result; }
    problem("Only text, numbers, booleans, nothing, lists, and records can be stored as data.", loc, "TYPE_ERROR");
  }
  function toData(value, loc, seen = new Set(), depth = 0, budget = { nodes: 100000, characters: 1000000 }) {
    if (--budget.nodes < 0) problem("This data expands into too many values. Store smaller batches.", loc, "LIMIT");
    if (typeof value === "string" && (budget.characters -= value.length) < 0) problem("This data contains too much text. Store smaller batches.", loc, "LIMIT");
    if (depth > 128) problem("This data is nested too deeply.", loc, "LIMIT");
    if (["number", "boolean", "text", "nothing"].includes(kind(value))) return value;
    if (!["list", "record"].includes(kind(value))) problem("JSON cannot store a function. Store its result instead.", loc, "TYPE_ERROR");
    if (seen.has(value)) problem("JSON cannot store data that contains itself.", loc, "CYCLE"); seen.add(value);
    const result = Array.isArray(value) ? [] : record(); for (const key of Object.keys(value)) result[key] = toData(value[key], loc, seen, depth + 1, budget); seen.delete(value); return result;
  }
  function contains(value, target, seen = new Set(), depth = 0) {
    if (value === target) return true;
    if (!["list", "record"].includes(kind(value)) || seen.has(value)) return false;
    if (depth > 128) return true;
    seen.add(value); return Object.keys(value).some(key => contains(value[key], target, seen, depth + 1));
  }
  function indexOf(value, key, loc, allowEnd = false) {
    whole(key, loc, 1); const size = typeof value === "string" ? Array.from(value).length : value.length;
    if (key > size + (allowEnd ? 1 : 0)) problem(`Position ${key} is outside this ${kind(value)}. Positions start at 1; its length is ${size}.`, loc, "INDEX_ERROR"); return key - 1;
  }
  function member(target, key, loc) {
    if (Array.isArray(target)) return target[indexOf(target, key, loc)];
    if (typeof target === "string") return Array.from(target)[indexOf(target, key, loc)];
    const fields = target instanceof Native ? target.props : isRecord(target) ? target : null;
    if (!fields) problem(`A ${kind(target)} does not have fields or positions.`, loc, "TYPE_ERROR");
    textValue(key, loc); if (!own(fields, key)) problem(`This record has no field named "${key}". Use has(record, "${key}") to check first.`, loc, "FIELD_ERROR"); return fields[key];
  }
  class Runtime {
    constructor(options, state) {
      this.options = options; this.state = state; this.output = []; this.tests = []; this.steps = 0; this.chars = 0; this.depth = 0;
      this.limits = { maxSteps: 1000000, maxOutputChars: 100000, maxItems: 100000, maxCallDepth: 128 };
      for (const key of Object.keys(this.limits)) {
        const value = options[key] ?? this.limits[key]; if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} must be a positive integer.`); this.limits[key] = value;
      }
    }
    cancelled(loc) { if (this.options.signal?.aborted) problem("Program stopped.", loc, "STOPPED"); }
    async tick(loc) {
      this.cancelled(loc);
      if (++this.steps > this.limits.maxSteps) problem(`This program reached the ${this.limits.maxSteps.toLocaleString("en-US")}-step limit. Try a smaller repeat count or raise the execution limit.`, loc, "LIMIT");
      if (this.steps % 256 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); this.cancelled(loc); }
    }
    sized(value, loc) {
      if (typeof value === "string" && value.length > this.limits.maxOutputChars) problem("This text is too long. Build smaller pieces of text.", loc, "LIMIT");
      const seen = new Set(), pending = [[value, 0]];
      while (pending.length) {
        const [item, depth] = pending.pop();
        if (!["list", "record"].includes(kind(item)) || seen.has(item)) continue;
        if (depth > 128) problem("This data is nested too deeply.", loc, "LIMIT"); seen.add(item);
        if (Array.isArray(item) && item.length > this.limits.maxItems) problem("This list has too many items. Work with smaller batches.", loc, "LIMIT");
        for (const key of Object.keys(item)) if (item[key] !== null && typeof item[key] === "object") pending.push([item[key], depth + 1]);
      }
      return value;
    }
    render(value, loc) {
      try { return display(value); } catch (error) { if (error instanceof PlainError) { error.line = loc.line; error.column = loc.column; error.source = loc.source; } throw error; }
    }
    async external(callback, loc) {
      this.cancelled(loc); const signal = this.options.signal; let abort;
      try {
        return await new Promise((resolve, reject) => {
          abort = () => reject(new PlainError("Program stopped.", loc.line, loc.column, "STOPPED", loc.source));
          signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) { abort(); return; }
          Promise.resolve().then(callback).then(resolve, reject);
        });
      } catch (error) {
        if (error instanceof PlainError) {
          if (error.source === "program.plain") { error.source = loc.source || error.source; if (error.line === 1) { error.line = loc.line || 1; error.column = loc.column || 1; } } throw error;
        }
        problem(error.message || String(error), loc, error.code === "ABORT_ERR" ? "STOPPED" : "HOST_ERROR");
      } finally { signal?.removeEventListener("abort", abort); }
    }
    async invoke(action, args, loc) {
      await this.tick(loc);
      if (!(action instanceof Native) && !(action instanceof Action)) problem(`A ${kind(action)} is not a function.`, loc, "TYPE_ERROR");
      const min = action instanceof Native ? action.min : action.node.parameters.length, max = action instanceof Native ? action.max : min;
      if (args.length < min || args.length > max) problem(`${action.name} needs ${min === max ? min : `${min} to ${max}`} argument${max === 1 ? "" : "s"}; received ${args.length}.`, loc, "ARGUMENT_ERROR");
      if (++this.depth > this.limits.maxCallDepth) { this.depth--; problem("Too many function calls inside one another. Check the stopping condition in your recursion.", loc, "LIMIT"); }
      try {
        if (action instanceof Native) return this.sized(await action.call(args, this, loc), loc);
        const local = new Scope(action.scope); action.node.parameters.forEach((name, i) => local.set(name, args[i]));
        try { await this.execute(action.node.body, local); return null; }
        catch (flow) { if (flow instanceof Flow && flow.kind === "give") return flow.value; throw flow; }
      } catch (error) {
        if (error instanceof PlainError) { error.frames.push({ name: action.name, line: loc.line, column: loc.column, source: loc.source }); throw error; }
        if (error instanceof Flow) throw error;
        problem(error.message || String(error), loc, "RUNTIME_ERROR");
      } finally { this.depth--; }
    }
    async evaluate(node, scope) {
      await this.tick(node);
      if (node.kind === "literal") return node.value;
      if (node.kind === "variable") return scope.get(node.name, node);
      if (node.kind === "list") { const result = []; for (const item of node.items) { const value = await this.evaluate(item, scope); if (contains(value, result)) problem("This data is nested too deeply.", node, "LIMIT"); result.push(value); } return this.sized(result, node); }
      if (node.kind === "record") { const result = record(); for (const [key, expression] of node.entries) { const value = await this.evaluate(expression, scope); if (contains(value, result)) problem("This data is nested too deeply.", node, "LIMIT"); result[key] = value; } return result; }
      if (node.kind === "member") return member(await this.evaluate(node.target, scope), await this.evaluate(node.key, scope), node);
      if (node.kind === "call") {
        const target = await this.evaluate(node.target, scope), args = [];
        for (const arg of node.args) args.push(await this.evaluate(arg, scope)); return this.invoke(target, args, node);
      }
      if (node.kind === "unary") {
        const value = await this.evaluate(node.value, scope); if (node.op === "not") return !boolean(value, node); return node.op === "-" ? -numeric(value, node) : numeric(value, node);
      }
      const left = await this.evaluate(node.left, scope);
      if (node.op === "and") return boolean(left, node) && boolean(await this.evaluate(node.right, scope), node);
      if (node.op === "or") return boolean(left, node) || boolean(await this.evaluate(node.right, scope), node);
      const right = await this.evaluate(node.right, scope);
      if (node.op === "is") return equal(left, right); if (node.op === "is not") return !equal(left, right);
      if (node.op === "+" && (typeof left === "string" || typeof right === "string")) return this.sized(this.render(left, node) + this.render(right, node), node);
      if (node.op === "+" && Array.isArray(left) && Array.isArray(right)) return this.sized(left.concat(right), node);
      numeric(left, node); numeric(right, node);
      switch (node.op) {
        case "+": return finite(left + right, node); case "-": return finite(left - right, node); case "*": return finite(left * right, node);
        case "/": if (right === 0) problem("You cannot divide by zero.", node, "NUMBER_ERROR"); return finite(left / right, node);
        case "%": if (right === 0) problem("You cannot divide by zero.", node, "NUMBER_ERROR"); return finite(left % right, node);
        case ">": return left > right; case "<": return left < right; case ">=": return left >= right; case "<=": return left <= right;
        default: problem("Unknown operation.", node);
      }
    }
    async assign(target, value, scope, deleting = false) {
      if (target.kind === "variable") { scope.set(target.name, value); return; }
      const object = await this.evaluate(target.target, scope), key = await this.evaluate(target.key, scope);
      if (!Array.isArray(object) && !isRecord(object)) problem("Only lists and records can be changed. Text values are immutable.", target, "TYPE_ERROR");
      if (Object.isFrozen(object)) problem("Built-in libraries and module names are read-only. Copy a record before changing its fields.", target, "READ_ONLY");
      if (!deleting && contains(value, object)) problem("A list or record cannot contain itself or be nested this deeply.", target, "CYCLE");
      if (Array.isArray(object)) { const position = indexOf(object, key, target); if (deleting) object.splice(position, 1); else object[position] = value; }
      else { textValue(key, target); if (deleting) { if (!own(object, key)) problem(`This record has no field named "${key}".`, target, "FIELD_ERROR"); delete object[key]; } else object[key] = value; }
    }
    async loop(body, scope) {
      try { await this.execute(body, scope); return true; }
      catch (flow) { if (flow instanceof Flow && flow.kind === "stop") return false; if (flow instanceof Flow && flow.kind === "skip") return true; throw flow; }
    }
    async import(node) {
      if (!this.options.loadModule) problem('Modules need a project. Add the file to Plain Studio, or use the terminal runner.', node, "MODULE_ERROR");
      const loaded = await this.external(() => this.options.loadModule(node.path, node.source), node);
      if (!loaded || typeof loaded.source !== "string" || typeof loaded.id !== "string") problem("The module loader must return a source and an id.", node, "MODULE_ERROR");
      const cached = this.state.modules.get(loaded.id);
      if (cached === "loading") problem(`Circular module use: "${node.path}" is already being loaded.`, node, "MODULE_CYCLE");
      if (cached) return cached;
      this.state.modules.set(loaded.id, "loading");
      try {
        const body = parse(loaded.source, { sourceName: loaded.id }), local = new Scope(this.state.library);
        await this.execute(body, local, false);
        const exports = record(); for (const [key, value] of local.values) exports[key] = value;
        Object.freeze(exports); this.state.modules.set(loaded.id, exports); return exports;
      } catch (error) { this.state.modules.delete(loaded.id); throw error; }
    }
    async execute(statements, scope, registerTests = true) {
      for (const node of statements) {
        await this.tick(node);
        switch (node.kind) {
          case "set": await this.assign(node.target, await this.evaluate(node.value, scope), scope); break;
          case "say": {
            const values = []; for (const value of node.values) values.push(this.render(await this.evaluate(value, scope), node));
            const value = values.join(" "); this.chars += value.length + 1;
            if (this.chars > this.limits.maxOutputChars) problem("This program printed too much text. Try fewer repetitions or raise the output limit.", node, "LIMIT");
            this.output.push(value); if (this.options.write) await this.external(() => this.options.write(value, { line: node.line, source: node.source }), node); break;
          }
          case "ask": {
            const prompt = await this.evaluate(node.prompt, scope);
            if (typeof prompt !== "string") problem('The question must be text. Try: ask "Your name?" into name', node, "TYPE_ERROR");
            if (!this.options.read) problem("This program needs input. Open Plain.html or run it with plain.cjs.", node, "INPUT_ERROR");
            let value = await this.external(() => this.options.read(prompt, { numeric: node.numeric, line: node.line, signal: this.options.signal }), node);
            this.cancelled(node); if (value === null || value === undefined) problem("Input was cancelled.", node, "STOPPED"); value = this.sized(String(value), node);
            if (node.numeric) { if (!NUMBER.test(value.trim()) || !Number.isFinite(Number(value))) problem("That answer is not a number. Try a number like 12 or 3.5.", node, "NUMBER_ERROR"); value = Number(value); }
            scope.set(node.name, value); break;
          }
          case "if": {
            let branch = node.tail;
            for (const item of node.branches) if (boolean(await this.evaluate(item.condition, scope), item.condition)) { branch = item.body; break; }
            await this.execute(branch, scope, registerTests); break;
          }
          case "repeat": {
            const count = await this.evaluate(node.count, scope);
            if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) problem("A repeat count must be a whole number, zero or more. Try: repeat 3 times", node, "NUMBER_ERROR");
            for (let i = 0; i < count; i++) { await this.tick(node); if (!await this.loop(node.body, scope)) break; } break;
          }
          case "while": while (boolean(await this.evaluate(node.condition, scope), node)) { await this.tick(node); if (!await this.loop(node.body, scope)) break; } break;
          case "for": {
            let values = await this.evaluate(node.items, scope);
            if (typeof values === "string") values = Array.from(values); else values = listValue(values, node).slice();
            for (let i = 0; i < values.length; i++) { await this.tick(node); scope.set(node.name, values[i]); if (node.index) scope.set(node.index, i + 1); if (!await this.loop(node.body, scope)) break; } break;
          }
          case "make": scope.set(node.name, new Action(node, scope)); break;
          case "give": throw new Flow("give", await this.evaluate(node.value, scope));
          case "stop": case "skip": throw new Flow(node.kind);
          case "call": await this.evaluate(node.value, scope); break;
          case "add": {
            const value = await this.evaluate(node.value, scope), target = listValue(await this.evaluate(node.target, scope), node);
            if (Object.isFrozen(target)) problem("This list is read-only.", node, "READ_ONLY");
            if (contains(value, target)) problem("A list or record cannot contain itself or be nested this deeply.", node, "CYCLE");
            if (target.length >= this.limits.maxItems) problem("This list has too many items.", node, "LIMIT"); target.push(value); break;
          }
          case "remove": await this.assign(node.target, null, scope, true); break;
          case "use": scope.set(node.name, await this.import(node)); break;
          case "fail": problem(textValue(await this.evaluate(node.values[0], scope), node), node, "USER_ERROR"); break;
          case "check": {
            if (!boolean(await this.evaluate(node.values[0], scope), node)) problem(node.values[1] ? textValue(await this.evaluate(node.values[1], scope), node) : "This check did not pass.", node, "CHECK_FAILED"); break;
          }
          case "try": {
            try { await this.execute(node.body, scope, registerTests); }
            catch (error) {
              if (!(error instanceof PlainError) || ["STOPPED", "LIMIT"].includes(error.code) || !node.catchName) throw error;
              scope.set(node.catchName, Object.assign(record(), { message: error.message, line: error.line, column: error.column, source: error.source, code: error.code }));
              await this.execute(node.rescue, scope, registerTests);
            } finally { if (!this.options.signal?.aborted && this.steps <= this.limits.maxSteps) await this.execute(node.always, scope, registerTests); }
            break;
          }
          case "test": if (registerTests && this.options.test) this.tests.push({ node, scope }); break;
        }
      }
    }
  }

  function createLibrary(options = {}) {
    const globals = new Scope(), spaces = new Map();
    function namespace(name) { const value = record(); spaces.set(name, value); globals.set(name, value); return value; }
    function define(target, name, min, max, call) {
      const fn = new Native(target instanceof Scope ? name : `${[...spaces].find(([, value]) => value === target)?.[0] || "text"}.${name}`, min, max, call);
      if (target instanceof Scope) target.set(name, fn); else target[name] = fn; return fn;
    }
    const top = (name, min, max, call) => define(globals, name, min, max, call);
    function length(value, loc) {
      if (typeof value === "string") return Array.from(value).length;
      if (Array.isArray(value)) return value.length;
      if (isRecord(value)) return Object.keys(value).length;
      problem(`A ${kind(value)} does not have a length.`, loc, "TYPE_ERROR");
    }
    function slice(value, start, end, loc) {
      const items = typeof value === "string" ? Array.from(value) : listValue(value, loc);
      const from = indexOf(items, start, loc, true), to = end === undefined ? items.length : whole(end, loc);
      if (to > items.length) problem("The end position is outside this value.", loc, "INDEX_ERROR");
      const result = items.slice(from, Math.max(from, to)); return typeof value === "string" ? result.join("") : result;
    }
    top("length", 1, 1, ([value], r, p) => length(value, p));
    top("type", 1, 1, ([value]) => kind(value));
    top("copy", 1, 1, ([value]) => clone(value));
    top("number", 1, 1, ([value], r, p) => {
      if (typeof value === "number") return value;
      if (typeof value !== "string" || !NUMBER.test(value.trim()) || !Number.isFinite(Number(value))) problem('That value is not a number. Try number("12.5").', p, "NUMBER_ERROR"); return Number(value);
    });
    top("range", 1, 3, (args, r, p) => {
      let [start, end, step] = args;
      if (args.length === 1) { whole(start, p); if (start === 0) return []; end = start; start = 1; }
      for (const value of [start, end]) { numeric(value, p); if (!Number.isSafeInteger(value)) problem("range needs whole-number limits.", p, "NUMBER_ERROR"); }
      step ??= start <= end ? 1 : -1; numeric(step, p); if (!Number.isSafeInteger(step) || step === 0) problem("A range step must be a whole number other than zero.", p, "NUMBER_ERROR");
      const count = Math.max(0, Math.floor((end - start) / step) + 1); if (count > r.limits.maxItems) problem("This range has too many items. Use a while loop or a smaller range.", p, "LIMIT");
      return Array.from({ length: count }, (_, i) => start + i * step);
    });
    top("keys", 1, 1, ([value], r, p) => Object.keys(recordValue(value, p)));
    top("values", 1, 1, ([value], r, p) => Object.values(recordValue(value, p)));
    top("has", 2, 2, ([value, key], r, p) => {
      if (Array.isArray(value)) return value.some(item => equal(item, key));
      if (typeof value === "string") return value.includes(textValue(key, p));
      return own(recordValue(value, p), textValue(key, p));
    });
    top("get", 2, 3, ([value, key, fallback = null], r, p) => own(recordValue(value, p), textValue(key, p)) ? value[key] : fallback);

    const text = namespace("text");
    const textFunction = new Native("text", 1, 1, ([value], r, p) => r.render(value, p), text); globals.set("text", textFunction);
    for (const [name, fn] of [["upper", value => value.toUpperCase()], ["lower", value => value.toLowerCase()], ["trim", value => value.trim()]]) define(text, name, 1, 1, ([value], r, p) => fn(textValue(value, p)));
    define(text, "contains", 2, 2, ([value, part], r, p) => textValue(value, p).includes(textValue(part, p)));
    define(text, "starts", 2, 2, ([value, part], r, p) => textValue(value, p).startsWith(textValue(part, p)));
    define(text, "ends", 2, 2, ([value, part], r, p) => textValue(value, p).endsWith(textValue(part, p)));
    define(text, "split", 2, 2, ([value, separator], r, p) => textValue(separator, p) === "" ? Array.from(textValue(value, p)) : textValue(value, p).split(separator));
    define(text, "lines", 1, 1, ([value], r, p) => textValue(value, p).split(/\r\n|\n|\r/));
    define(text, "slice", 2, 3, ([value, start, end], r, p) => slice(textValue(value, p), start, end, p));
    define(text, "replace", 3, 3, ([value, find, replacement], r, p) => {
      textValue(value, p); textValue(find, p); textValue(replacement, p);
      if (!find) problem("The text to replace cannot be empty.", p, "ARGUMENT_ERROR");
      const pieces = value.split(find), size = value.length + (replacement.length - find.length) * (pieces.length - 1);
      if (size > r.limits.maxOutputChars) problem("This text is too long.", p, "LIMIT"); return pieces.join(replacement);
    });
    define(text, "repeat", 2, 2, ([value, count], r, p) => { textValue(value, p); whole(count, p); if (value.length * count > r.limits.maxOutputChars) problem("This text is too long.", p, "LIMIT"); return value.repeat(count); });

    const list = namespace("list");
    define(list, "first", 1, 1, ([value], r, p) => listValue(value, p)[0] ?? null);
    define(list, "last", 1, 1, ([value], r, p) => listValue(value, p).at(-1) ?? null);
    define(list, "slice", 2, 3, ([value, start, end], r, p) => slice(listValue(value, p), start, end, p));
    define(list, "join", 1, 2, ([value, separator = ", "], r, p) => {
      textValue(separator, p); let result = "", first = true;
      for (const item of listValue(value, p)) { const piece = r.render(item, p); result += (first ? "" : separator) + piece; first = false; r.sized(result, p); } return result;
    });
    define(list, "reverse", 1, 1, ([value], r, p) => listValue(value, p).slice().reverse());
    define(list, "sum", 1, 1, ([value], r, p) => finite(listValue(value, p).reduce((sum, item) => sum + numeric(item, p), 0), p));
    define(list, "unique", 1, 1, async ([value], r, p) => {
      const result = []; for (const item of listValue(value, p)) { await r.tick(p); let found = false; for (const other of result) { await r.tick(p); if (equal(item, other)) { found = true; break; } } if (!found) result.push(item); } return result;
    });
    for (const mode of ["map", "filter", "find", "some", "every"]) define(list, mode, 2, 2, async ([value, action], r, p) => {
      const result = []; for (const item of listValue(value, p).slice()) {
        const answer = await r.invoke(action, [item], p);
        if (mode === "map") result.push(answer);
        else { const yes = boolean(answer, p); if (mode === "filter" && yes) result.push(item); if (mode === "find" && yes) return item; if (mode === "some" && yes) return true; if (mode === "every" && !yes) return false; }
      }
      return mode === "find" ? null : mode === "some" ? false : mode === "every" ? true : result;
    });
    define(list, "reduce", 3, 3, async ([value, initial, action], r, p) => { let result = initial; for (const item of listValue(value, p).slice()) result = await r.invoke(action, [result, item], p); return result; });
    define(list, "sort", 1, 2, async ([value, by], r, p) => {
      const rows = []; for (const item of listValue(value, p)) { await r.tick(p); rows.push({ item, key: by ? await r.invoke(by, [item], p) : item }); }
      if (rows.some(row => !["text", "number"].includes(kind(row.key)) || kind(row.key) !== kind(rows[0].key))) problem("Sorting needs all numbers, all text, or a function that returns one of those types.", p, "TYPE_ERROR");
      return rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(row => row.item);
    });

    const math = namespace("math"); math.pi = Math.PI; math.e = Math.E;
    for (const name of ["abs", "floor", "ceil", "sqrt", "sin", "cos", "tan", "log"]) define(math, name, 1, 1, ([value], r, p) => finite(Math[name](numeric(value, p)), p));
    define(math, "round", 1, 2, ([value, places = 0], r, p) => { numeric(value, p); whole(places, p); if (places > 15) problem("Round to between 0 and 15 decimal places.", p, "ARGUMENT_ERROR"); return finite(Math.round(value * 10 ** places) / 10 ** places, p); });
    define(math, "power", 2, 2, ([a, b], r, p) => finite(numeric(a, p) ** numeric(b, p), p));
    for (const mode of ["min", "max"]) define(math, mode, 1, 2, (args, r, p) => {
      const items = args.length === 1 ? listValue(args[0], p) : args; if (!items.length) problem(`${mode} needs at least one number.`, p, "ARGUMENT_ERROR");
      return items.reduce((a, b) => Math[mode](a, numeric(b, p)), numeric(items[0], p));
    });
    define(math, "clamp", 3, 3, ([value, low, high], r, p) => { numeric(value, p); numeric(low, p); numeric(high, p); if (low > high) problem("The lower limit must not exceed the upper limit.", p, "ARGUMENT_ERROR"); return Math.min(high, Math.max(low, value)); });

    const json = namespace("json");
    define(json, "read", 1, 1, ([value], r, p) => { textValue(value, p); try { return fromData(JSON.parse(value), p); } catch (error) { if (error instanceof PlainError) throw error; problem("This text is not valid JSON. Check its quotes, commas, and brackets.", p, "JSON_ERROR"); } });
    define(json, "write", 1, 2, ([value, pretty = false], r, p) => JSON.stringify(toData(value, p), null, boolean(pretty, p) ? 2 : 0));
    const time = namespace("time");
    define(time, "now", 0, 0, (args, r) => new Date((r.options.now || Date.now)()).toISOString());
    define(time, "stamp", 0, 0, (args, r) => (r.options.now || Date.now)());
    define(time, "date", 0, 1, ([value], r, p) => {
      const date = value === undefined ? new Date((r.options.now || Date.now)()) : new Date(textValue(value, p));
      if (!Number.isFinite(date.getTime())) problem("Use an ISO date, like 2026-10-31 or 2026-10-31T12:00:00Z.", p, "DATE_ERROR"); return date.toISOString().slice(0, 10);
    });
    define(time, "sleep", 1, 1, async ([milliseconds], r, p) => {
      numeric(milliseconds, p); if (milliseconds < 0 || milliseconds > 600000) problem("Sleep takes 0 to 600,000 milliseconds.", p, "ARGUMENT_ERROR");
      await r.external(() => new Promise(resolve => {
        const signal = r.options.signal; const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
        signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
      }), p); return null;
    });
    const random = namespace("random");
    const unit = (r, p) => { const value = (r.options.random || Math.random)(); if (typeof value !== "number" || value < 0 || value >= 1) problem("The random source must return a number from 0 up to, but not including, 1.", p); return value; };
    define(random, "number", 0, 0, (args, r, p) => unit(r, p));
    define(random, "integer", 2, 2, ([low, high], r, p) => {
      numeric(low, p); numeric(high, p); if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || high < low || !Number.isSafeInteger(high - low + 1)) problem("Use a valid whole-number lower and upper limit.", p, "ARGUMENT_ERROR"); return low + Math.floor(unit(r, p) * (high - low + 1));
    });
    define(random, "pick", 1, 1, ([value], r, p) => { listValue(value, p); if (!value.length) problem("Cannot pick from an empty list.", p, "ARGUMENT_ERROR"); return value[Math.floor(unit(r, p) * value.length)]; });

    const files = namespace("files");
    for (const [name, min, max] of [["read", 1, 1], ["write", 2, 2], ["append", 2, 2], ["exists", 1, 1], ["list", 0, 1], ["remove", 1, 1], ["mkdir", 1, 1]]) define(files, name, min, max, async (args, r, p) => {
      if (!r.options.files?.[name]) problem(`files.${name} needs project-file access. Use Plain Studio or the terminal runner.`, p, "CAPABILITY_ERROR");
      for (const arg of args) textValue(arg, p);
      const answer = await r.external(() => r.options.files[name](...args), p); return answer === undefined ? null : fromData(answer, p);
    });
    const http = namespace("http");
    async function request(method, url, body, headers, r, p) {
      textValue(url, p); if (!/^https?:\/\//i.test(url)) problem("HTTP addresses must start with http:// or https://.", p, "ARGUMENT_ERROR");
      if (!r.options.request) problem("HTTP access is unavailable here. In the terminal, add --allow-net when you intend to use the network.", p, "CAPABILITY_ERROR");
      const answer = await r.external(() => r.options.request({ method, url, body: body === null ? null : typeof body === "string" ? body : JSON.stringify(toData(body, p)), headers: toData(headers, p), signal: r.options.signal }), p);
      return fromData(answer, p);
    }
    define(http, "get", 1, 1, ([url], r, p) => request("GET", url, null, record(), r, p));
    define(http, "send", 2, 4, ([method, url, body = null, headers = record()], r, p) => request(textValue(method, p).toUpperCase(), url, body, recordValue(headers, p), r, p));
    define(http, "json", 1, 1, async ([url], r, p) => {
      const response = await request("GET", url, null, Object.assign(record(), { Accept: "application/json" }), r, p);
      if (!response.ok) problem(`The HTTP server returned status ${response.status}.`, p, "HTTP_ERROR");
      try { return fromData(JSON.parse(response.body), p); } catch (error) { if (error instanceof PlainError) throw error; problem("The HTTP response is not valid JSON.", p, "JSON_ERROR"); }
    });
    const system = namespace("system"); system.version = VERSION; system.platform = options.platform || "embedded"; system.args = Object.freeze((options.args || []).map(String));
    for (const value of spaces.values()) Object.freeze(value);
    return globals;
  }

  async function runInternal(source, options, state) {
    const body = parse(source, { sourceName: options.sourceName });
    const r = new Runtime(options, state); r.cancelled({ source: options.sourceName });
    await r.execute(body, state.root);
    const tests = [];
    for (const { node, scope } of r.tests) {
      const before = r.steps;
      try { await r.execute(node.body, new Scope(scope), false); tests.push({ name: node.title, source: node.source, line: node.line, passed: true }); }
      catch (error) {
        if (!(error instanceof PlainError) || ["STOPPED", "LIMIT"].includes(error.code)) throw error;
        tests.push({ name: node.title, source: node.source, line: node.line, passed: false, error });
      }
      if (options.onTest) await options.onTest(tests.at(-1));
      if (r.steps === before) await r.tick(node);
    }
    return { output: r.output, variables: Object.fromEntries(state.root.values), steps: r.steps, tests, passed: tests.filter(item => item.passed).length, failed: tests.filter(item => !item.passed).length };
  }
  function newState(options) { const library = createLibrary(options); return { library, root: new Scope(library), modules: new Map() }; }
  async function run(source, options = {}) { return runInternal(source, options, newState(options)); }
  function createSession(options = {}) {
    let state = newState(options), busy = false;
    return Object.freeze({
      async run(source, overrides = {}) {
        if (busy) throw new Error("This Plain session is already running a program."); busy = true;
        try { return await runInternal(source, { ...options, ...overrides }, state); } finally { busy = false; }
      },
      reset() { if (busy) throw new Error("Stop the program before resetting its session."); state = newState(options); },
      variables() { return Object.fromEntries(state.root.values); }
    });
  }
  function format(source) {
    parse(source); const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/), result = []; let depth = 0, brackets = 0;
    for (const line of lines) {
      const text = line.trim(); if (!text) { result.push(""); continue; }
      const branch = /^(end|else|catch|finally)(?:\s|$)/.test(text) && !brackets;
      if (branch) depth = Math.max(0, depth - 1);
      const closes = text.match(/^[\])}]+/)?.[0].length || 0;
      result.push("  ".repeat(Math.max(0, depth + brackets - closes)) + text);
      if (!brackets && /^(if|repeat|while|for|make|try|test|else|catch|finally)(?:\s|$)/.test(text)) depth++;
      let quoted = false, escaped = false;
      for (const ch of text) {
        if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; }
        else if (ch === '"') quoted = true; else if (ch === "#") break; else if ("([{".includes(ch)) brackets++; else if (")]}".includes(ch)) brackets--;
      }
    }
    return result.join("\n").replace(/\s+$/, "") + "\n";
  }
  function catalog() {
    const library = createLibrary(), result = [];
    for (const [name, value] of library.values) {
      if (value instanceof Native) result.push({ name, min: value.min, max: value.max });
      const fields = value instanceof Native ? value.props : isRecord(value) ? value : null;
      if (fields) for (const [field, entry] of Object.entries(fields)) if (entry instanceof Native) result.push({ name: `${name}.${field}`, min: entry.min, max: entry.max });
    }
    return result;
  }
  function resolvePath(path, from = "main.plain") {
    if (typeof path !== "string" || !path || /[\x00-\x1f:]/.test(path) || /^[\\/]/.test(path)) throw new PlainError("Use a relative project path, like data/notes.txt.", 1, 1, "PATH_ERROR");
    const parts = from.replace(/\\/g, "/").split("/").slice(0, -1);
    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") { if (!parts.length) throw new PlainError("That path goes outside the project folder.", 1, 1, "PATH_ERROR"); parts.pop(); }
      else parts.push(part);
    }
    if (!parts.length) throw new PlainError("Choose a file or folder inside the project.", 1, 1, "PATH_ERROR"); return parts.join("/");
  }
  return Object.freeze({ VERSION, PlainError, parse, run, createSession, format, inspect: display, type: kind, catalog, resolvePath });
});
