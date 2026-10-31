(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../plain.js"));
  else root.PlainProject = factory(root.Plain);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Plain) {
  "use strict";
  const MAX_FILES = 100, MAX_BYTES = 5000000, MAX_FILE = 500000;
  function path(name) { return Plain.resolvePath(name); }
  function bytes(text) { return new TextEncoder().encode(text).length; }
  class Project {
    constructor(data = {}) {
      this.name = String(data.name || "My Plain project").slice(0, 100);
      this.files = Object.create(null); this.folders = new Set();
      const files = data.files || { "main.plain": 'say "Hello, world!"\n' };
      for (const [name, value] of Object.entries(files)) {
        if (typeof value !== "string") throw new Error("Project files must contain text.");
        const id = path(name); if (Object.hasOwn(this.files, id)) throw new Error(`Duplicate project path: ${id}`);
        this.files[id] = value;
      }
      this.entry = path(data.entry || (Object.hasOwn(this.files, "main.plain") ? "main.plain" : Object.keys(this.files).find(name => name.endsWith(".plain")) || "main.plain"));
      if (!Object.hasOwn(this.files, this.entry) || !this.entry.endsWith(".plain")) throw new Error("A project needs a .plain entry file.");
      for (const folder of data.folders || []) this.folders.add(path(folder));
      this.active = Object.hasOwn(this.files, data.active) ? data.active : this.entry;
      this.validate();
    }
    validate() {
      const names = Object.keys(this.files);
      if (names.length > MAX_FILES) throw new Error(`A Studio project can contain up to ${MAX_FILES} files.`);
      if (this.folders.size > 1000) throw new Error("A Studio project can contain up to 1,000 folders.");
      for (const folder of this.folders) {
        const parts = folder.split("/"); let prefix = "";
        for (const part of parts) { prefix += (prefix ? "/" : "") + part; if (Object.hasOwn(this.files, prefix)) throw new Error(`"${prefix}" cannot be both a file and a folder.`); }
      }
      let total = 0;
      for (const name of names) {
        const size = bytes(this.files[name]); total += size;
        if (size > MAX_FILE) throw new Error(`"${name}" is too large. Keep each file below 500 KB.`);
        const parts = name.split("/"); parts.pop(); let prefix = "";
        for (const part of parts) { prefix += (prefix ? "/" : "") + part; if (Object.hasOwn(this.files, prefix)) throw new Error(`"${prefix}" cannot be both a file and a folder.`); }
        if (this.folders.has(name)) throw new Error(`"${name}" cannot be both a file and a folder.`);
      }
      if (total > MAX_BYTES) throw new Error("This project exceeds the 5 MB Studio limit.");
    }
    snapshot() { return { name: this.name, entry: this.entry, active: this.active, files: { ...this.files }, folders: [...this.folders] }; }
    copy() { return new Project(this.snapshot()); }
    manifest() { return JSON.stringify({ name: this.name, version: "1.0.0", main: this.entry }, null, 2) + "\n"; }
    read(name) {
      const id = path(name);
      if (id === "plain.json" && !Object.hasOwn(this.files, id)) return this.manifest();
      if (!Object.hasOwn(this.files, id)) throw new Error(`Could not find project file "${id}".`); return this.files[id];
    }
    write(name, value) {
      const id = path(name); if (typeof value !== "string") throw new Error("File contents must be text.");
      if (id === "plain.json") throw new Error("Studio manages plain.json. Change the project name or Start from control instead.");
      const had = Object.hasOwn(this.files, id), previous = this.files[id]; this.files[id] = value;
      try { this.validate(); } catch (error) { if (had) this.files[id] = previous; else delete this.files[id]; throw error; } return null;
    }
    append(name, value) { const id = path(name); return this.write(id, (this.files[id] || "") + value); }
    exists(name) { if (name === "." || name === "") return true; const id = path(name); return id === "plain.json" || Object.hasOwn(this.files, id) || this.folders.has(id) || [...Object.keys(this.files), ...this.folders].some(file => file.startsWith(id + "/")); }
    list(name = ".") {
      const prefix = name === "." || name === "" ? "" : path(name) + "/", names = new Set();
      if (prefix && !this.exists(prefix.slice(0, -1))) throw new Error("That project folder does not exist.");
      if (prefix && Object.hasOwn(this.files, prefix.slice(0, -1))) throw new Error("Choose a folder to list.");
      for (const file of [...Object.keys(this.files), ...this.folders, "plain.json"]) if (file.startsWith(prefix)) { const part = file.slice(prefix.length).split("/")[0]; if (part) names.add(part); }
      return [...names].sort();
    }
    remove(name) {
      const id = path(name); if (!Object.hasOwn(this.files, id)) throw new Error(`Could not find project file "${id}".`);
      if (id === this.entry) throw new Error("The Studio keeps the project entry file. Set a different entry before removing it.");
      delete this.files[id]; if (this.active === id) this.active = this.entry; return null;
    }
    mkdir(name) { const id = path(name); if (Object.hasOwn(this.files, id)) throw new Error("A file already has that name."); this.folders.add(id); try { this.validate(); } catch (error) { this.folders.delete(id); throw error; } return null; }
    rename(oldName, newName) {
      const previous = path(oldName), next = path(newName);
      if (!Object.hasOwn(this.files, previous)) throw new Error("Choose an existing file.");
      if (Object.hasOwn(this.files, next) && next !== previous) throw new Error("A file already has that name.");
      const value = this.files[previous]; delete this.files[previous];
      try { this.write(next, value); } catch (error) { this.files[previous] = value; throw error; }
      if (this.entry === previous) this.entry = next; if (this.active === previous) this.active = next;
    }
    adapters(changed = () => {}) {
      const notify = (method, ...args) => { const result = this[method](...args); changed(); return result; };
      return {
        loadModule: (specifier, from) => { const id = Plain.resolvePath(specifier, from); return { id, source: this.read(id) }; },
        files: {
          read: name => this.read(name), exists: name => this.exists(name), list: name => this.list(name),
          write: (name, value) => notify("write", name, value), append: (name, value) => notify("append", name, value),
          remove: name => notify("remove", name), mkdir: name => notify("mkdir", name)
        },
        platform: "browser"
      };
    }
    async zip(JSZip) {
      const zip = new JSZip(); for (const [name, value] of Object.entries(this.files)) zip.file(name, value);
      zip.file("plain.json", this.manifest());
      for (const folder of this.folders) zip.folder(folder);
      return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    }
    static async fromZip(data, JSZip) {
      if ((data.byteLength ?? data.size ?? 0) > MAX_BYTES) throw new Error("Choose a project ZIP smaller than 5 MB.");
      const zip = await JSZip.loadAsync(data); const entries = Object.values(zip.files).filter(entry => !entry.dir && !entry.name.startsWith("__MACOSX/"));
      if (entries.length > MAX_FILES + 1) throw new Error("This archive contains too many files.");
      const manifest = entries.find(file => file.name === "plain.json") || entries.find(file => /^[^/]+\/plain\.json$/.test(file.name));
      const prefix = manifest ? manifest.name.slice(0, -"plain.json".length) : "";
      const folders = [];
      for (const entry of Object.values(zip.files)) if (entry.dir && entry.name.startsWith(prefix) && !entry.name.startsWith("__MACOSX/")) {
        const name = entry.name.slice(prefix.length).replace(/\/+$/, ""); if (name) folders.push(path(name));
        if (folders.length > 1000) throw new Error("This archive contains too many folders.");
      }
      const files = Object.create(null); let total = 0, config = {};
      for (const entry of entries) {
        if (!entry.name.startsWith(prefix)) continue;
        // JSZip 3.10.1 stores the uncompressed size before any content is inflated.
        const size = entry._data?.uncompressedSize;
        if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE || (total += size) > MAX_BYTES) throw new Error("The expanded ZIP exceeds the Studio file limits.");
        if (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) throw new Error("The ZIP contains an unsafe path.");
        const id = path(entry.name.slice(prefix.length));
        if (Object.hasOwn(files, id)) throw new Error(`Duplicate ZIP entry: ${id}`);
        const text = await entry.async("string");
        if (id === "plain.json") { try { config = JSON.parse(text); } catch { throw new Error("plain.json must contain valid JSON."); } }
        else files[id] = text;
      }
      return new Project({ name: config.name, entry: config.main, files, folders });
    }
  }
  return Object.freeze({ Project, MAX_FILES, MAX_BYTES, MAX_FILE });
});
