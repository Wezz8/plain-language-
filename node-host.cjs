"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
}
async function createHost(Plain, options = {}) {
  const root = await fs.realpath(options.root || process.cwd());
  async function locate(name = ".") {
    if (typeof name !== "string" || name.includes("\0")) throw new Error("Use a text file path.");
    const target = path.resolve(root, name);
    if (!inside(root, target)) throw new Error("That path goes outside the project folder.");
    let existing = target;
    while (true) {
      try { const actual = await fs.realpath(existing); if (!inside(root, actual)) throw new Error("That path follows a link outside the project folder."); break; }
      catch (error) { if (error.code !== "ENOENT") throw error; const parent = path.dirname(existing); if (parent === existing) throw error; existing = parent; }
    }
    return target;
  }
  async function read(name, max = 5000000) {
    const target = await locate(name), stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error(`"${name}" is not a file.`);
    if (stat.size > max) throw new Error(`"${name}" is too large. The file limit is ${max} bytes.`);
    return fs.readFile(target, "utf8");
  }
  const files = {
    read,
    async write(name, value) { await fs.writeFile(await locate(name), value, "utf8"); return null; },
    async append(name, value) { await fs.appendFile(await locate(name), value, "utf8"); return null; },
    async exists(name) { try { await fs.stat(await locate(name)); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } },
    async list(name = ".") { return (await fs.readdir(await locate(name))).sort(); },
    async remove(name) { await fs.unlink(await locate(name)); return null; },
    async mkdir(name) { await fs.mkdir(await locate(name), { recursive: true }); return null; }
  };
  async function loadModule(specifier, from = "main.plain") {
    const id = Plain.resolvePath(specifier, from);
    if (options.modules) {
      if (!Object.prototype.hasOwnProperty.call(options.modules, id)) throw new Error(`The bundled module "${id}" was not found.`);
      return { id, source: options.modules[id] };
    }
    return { id, source: await read(id, 500000) };
  }
  async function request({ method, url, body, headers, signal }) {
    if (!options.allowNet) throw new Error("Network access is off. Run this program with --allow-net to enable it.");
    const address = new URL(url); if (!["http:", "https:"].includes(address.protocol)) throw new Error("Use an http:// or https:// address.");
    const abort = new AbortController(), relay = () => abort.abort(); signal?.addEventListener("abort", relay, { once: true }); if (signal?.aborted) relay();
    const timer = setTimeout(() => abort.abort(), options.timeout || 20000);
    try {
      const response = await (options.fetch || fetch)(address, { method, body: body ?? undefined, headers, signal: abort.signal });
      const reader = response.body?.getReader(); let bytes = 0, text = ""; const decoder = new TextDecoder();
      if (reader) {
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 5000000) { await reader.cancel(); throw new Error("The HTTP response exceeds the 5 MB limit."); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
        finally { reader.releaseLock(); }
      }
      return { status: response.status, ok: response.ok, body: text, headers: Object.fromEntries(response.headers) };
    } catch (error) {
      if (signal?.aborted) throw new Plain.PlainError("Program stopped.", 1, 1, "STOPPED");
      if (abort.signal.aborted) throw new Error("The HTTP request timed out."); throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
  }
  return { root, files, loadModule, ...(options.allowNet ? { request } : {}), platform: process.platform, args: options.args || [] };
}
function terminalIO() {
  let terminal, ended = false; const queue = [], waiters = [];
  if (!process.stdin.isTTY) {
    terminal = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    terminal.on("line", value => { const waiter = waiters.shift(); if (waiter) waiter(value); else queue.push(value); });
    terminal.on("close", () => { ended = true; for (const waiter of waiters.splice(0)) waiter(null); });
  }
  return {
    write: line => console.log(line),
    async read(prompt, { signal } = {}) {
      if (process.stdin.isTTY) { terminal ??= readline.createInterface({ input: process.stdin, output: process.stdout }); return terminal.question(`${prompt} `, { signal }); }
      console.log(prompt); if (queue.length) return queue.shift(); if (ended) return null;
      return new Promise(resolve => waiters.push(resolve));
    },
    close() { terminal?.close(); }
  };
}
function formatError(error) {
  if (error.name !== "PlainError") return error.code === "ENOENT" ? "Could not find that file. Check its name and location." : error.message;
  const heading = `${error.code === "STOPPED" ? "Stopped" : "Plain error"} in ${error.source}:${error.line}:${error.column}: ${error.message}`;
  return heading + error.frames.map(frame => `\n  in ${frame.name}, called at ${frame.source}:${frame.line}`).join("");
}
module.exports = { createHost, terminalIO, formatError, inside };
