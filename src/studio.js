"use strict";
(() => {
  const $ = id => document.getElementById(id), { Project } = PlainProject;
  const editor = $("editor"), output = $("console"), selector = $("example");
  const examples = globalThis.PLAIN_EXAMPLES;
  let controller = null, pending = null, errorLine = null, diagnostic = null, lintTimer = null;
  let storageAvailable = true, currentId = null, dialogMode = "new", values = {};
  function load(key) { try { return localStorage.getItem("plain." + key); } catch { storageAvailable = false; return null; } }
  function store(key, value) { try { localStorage.setItem("plain." + key, value); return true; } catch { storageAvailable = false; return false; } }
  let saved = {};
  try { const data = JSON.parse(load("studio.projects") || "{}"); if (data && typeof data === "object" && !Array.isArray(data)) saved = data; } catch {}
  let project = new Project(examples.hello);
  try {
    const id = load("studio.current");
    if (id && Object.hasOwn(saved, id)) { project = new Project(saved[id]); currentId = id; selector.value = "draft"; }
    else {
      const legacy = load("draft");
      if (legacy) { project = new Project({ name: "My first Plain program", files: { "main.plain": legacy } }); currentId = "migrated"; selector.value = "draft"; }
    }
  } catch { currentId = null; selector.value = "hello"; }
  let draft = currentId ? project.snapshot() : null;

  function setStatus(text, state = "ready") { $("status").textContent = text; $("status").dataset.state = state; }
  function append(text, className = "") {
    if (output.childElementCount > 2000) return;
    if (output.childElementCount === 2000) text = "Display paused after 2,000 lines. Print fewer lines, or use the terminal for the full output.";
    const line = document.createElement("div"); line.className = "terminal-line" + (className ? " " + className : ""); line.textContent = text;
    output.append(line); output.scrollTop = output.scrollHeight;
  }
  function showView(view) {
    for (const name of ["output", "values", "files"]) {
      $("view-" + name).setAttribute("aria-pressed", String(view === name));
      $(name === "output" ? "console" : name + "-panel").hidden = name !== view;
    }
    if (view === "files") renderFiles();
  }
  function renderSaved() {
    const select = $("saved-projects"), placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Saved projects";
    select.replaceChildren(placeholder);
    for (const [id, snapshot] of Object.entries(saved)) {
      const option = document.createElement("option"); option.value = id; option.textContent = String(snapshot.name || "Untitled"); select.append(option);
    }
  }
  function persist() {
    if (!currentId) currentId = "project-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    saved[currentId] = project.snapshot(); draft = project.snapshot();
    const okay = store("studio.projects", JSON.stringify(saved)) && store("studio.current", currentId);
    $("project-status").textContent = okay ? "Saved in this browser" : "Export ZIP to keep your work";
    $("draft-status").textContent = okay ? "Draft saved in this browser" : "Save a file to keep your work";
    selector.querySelector('[value="draft"]').disabled = false; selector.value = "draft"; renderSaved();
  }
  function gutter() {
    const fragment = document.createDocumentFragment();
    // Render only the visible gutter plus a small buffer, even for large files.
    const lines = editor.value.split("\n").length, first = Math.max(1, Math.floor(editor.scrollTop / 25) - 3), last = Math.min(lines, first + 45);
    $("line-numbers").style.paddingTop = 22 + (first - 1) * 25 + "px";
    for (let i = first; i <= last; i++) { const span = document.createElement("span"); span.textContent = i; if (i === errorLine) span.className = "error-line"; fragment.append(span); }
    $("line-numbers").replaceChildren(fragment); $("line-numbers").scrollTop = editor.scrollTop;
  }
  function goTo(place) {
    if (place.source && Object.hasOwn(project.files, place.source)) openFile(place.source);
    const lines = editor.value.split("\n"), line = place.line || 1, start = lines.slice(0, line - 1).reduce((n, value) => n + value.length + 1, 0);
    editor.focus(); editor.setSelectionRange(start, start + (lines[line - 1] || "").length); editor.scrollTop = Math.max(0, (line - 3) * 25); gutter();
  }
  function lint() {
    if (!project.active.endsWith(".plain")) { $("diagnostic").hidden = true; return; }
    try { Plain.parse(editor.value, { sourceName: project.active }); diagnostic = null; $("diagnostic").hidden = true; }
    catch (error) { diagnostic = error; $("diagnostic-link").textContent = `Line ${error.line}: ${error.message}`; $("diagnostic").hidden = false; }
  }
  function tabs() {
    const fragment = document.createDocumentFragment(), entries = document.createDocumentFragment();
    for (const name of Object.keys(project.files).sort()) {
      const button = document.createElement("button"); button.type = "button"; button.className = "file-tab"; button.textContent = name;
      button.setAttribute("aria-pressed", String(name === project.active)); button.disabled = !!controller; button.addEventListener("click", () => openFile(name)); fragment.append(button);
      if (name.endsWith(".plain") && !name.endsWith(".test.plain")) { const option = document.createElement("option"); option.value = name; option.textContent = name; entries.append(option); }
    }
    $("file-tabs").replaceChildren(fragment); $("entry").replaceChildren(entries); $("entry").value = project.entry;
    $("delete-file").disabled = !!controller || project.active === project.entry;
  }
  function openFile(name) {
    if (controller) return;
    project.active = name; editor.value = project.read(name); editor.scrollTop = 0; errorLine = null;
    $("filename").textContent = name; tabs(); gutter(); lint(); if (currentId) persist();
  }
  function refresh() {
    $("project-name").value = project.name; $("filename").textContent = project.active;
    editor.value = project.read(project.active); editor.scrollTop = 0;
    tabs(); gutter(); renderFiles(); renderSaved(); lint();
    selector.querySelector('[value="draft"]').disabled = !draft;
    $("project-status").textContent = currentId ? storageAvailable ? "Saved in this browser" : "Export ZIP to keep your work" : "Example · make it yours";
  }
  function edited() {
    try { project.write(project.active, editor.value); persist(); errorLine = null; gutter(); if (!controller) setStatus("Ready when you are"); }
    catch (error) { $("draft-status").textContent = error.message; }
    clearTimeout(lintTimer); lintTimer = setTimeout(lint, 350);
  }
  function renderFiles() {
    const panel = $("files-panel"); panel.replaceChildren();
    for (const name of Object.keys(project.files).sort()) {
      const row = document.createElement("div"); row.className = "project-file-row";
      const button = document.createElement("button"); button.type = "button"; button.textContent = name + (name === project.entry ? " · entry" : ""); button.disabled = !!controller;
      button.addEventListener("click", () => openFile(name));
      const size = document.createElement("span"); size.textContent = new TextEncoder().encode(project.files[name]).length.toLocaleString() + " bytes"; row.append(button, size); panel.append(row);
    }
  }
  function renderValues() {
    const panel = $("values-panel"); panel.replaceChildren();
    if (!Object.keys(values).length) { const p = document.createElement("p"); p.textContent = "No saved values yet. Try: set score to 10"; panel.append(p); return; }
    for (const [name, value] of Object.entries(values)) {
      const row = document.createElement("div"); row.className = "value-card";
      const title = document.createElement("h3"); title.textContent = name; const type = document.createElement("span"); type.textContent = Plain.type(value); title.append(type);
      const pre = document.createElement("pre"); try { pre.textContent = Plain.inspect(value).slice(0, 20000); } catch { pre.textContent = "Large value · inspect a smaller part in your program."; } row.append(title, pre); panel.append(row);
    }
  }
  function finishInput(value, error = null) {
    if (!pending) return; const previous = pending; pending = null; previous.signal.removeEventListener("abort", previous.abort);
    $("input-form").hidden = true; $("answer").value = "";
    if (error) previous.reject(error); else previous.resolve(value);
  }
  function ask(question, { numeric, signal, line }) {
    return new Promise((resolve, reject) => {
      const abort = () => finishInput(null, new Plain.PlainError("Program stopped.", line, 1, "STOPPED"));
      pending = { resolve, reject, abort, signal, numeric }; signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) { abort(); return; }
      $("question").textContent = question; $("answer").inputMode = numeric ? "decimal" : "text"; $("answer").placeholder = numeric ? "Type a number…" : "Type your answer…";
      $("input-error").textContent = ""; $("input-form").hidden = false; showView("output"); setStatus("Waiting for your answer", "waiting"); $("answer").focus();
    });
  }
  $("input-form").addEventListener("submit", event => {
    event.preventDefault(); if (!pending) return; const value = $("answer").value;
    if (pending.numeric && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value)))) { $("input-error").textContent = "Please enter a number, like 12 or 3.5."; return; }
    append($("question").textContent, "question"); append("› " + value, "answer"); finishInput(value); setStatus("Running…", "running");
  });
  async function browserRequest({ url, method, body, headers, signal }) {
    let response;
    try { response = await fetch(url, { method, body: body ?? undefined, headers, signal }); }
    catch (error) { if (signal?.aborted) throw error; throw new Error("The HTTP request failed. Browser requests require the server to allow CORS. Try the terminal runner for other servers."); }
    const reader = response.body?.getReader(); const decoder = new TextDecoder(); let text = "", bytes = 0;
    if (reader) try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 5000000) { await reader.cancel(); throw new Error("This response exceeds the 5 MB limit."); } text += decoder.decode(chunk.value, { stream: true }); }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return { status: response.status, ok: response.ok, body: text, headers: Object.fromEntries(response.headers) };
  }
  function busy(on) {
    for (const id of ["run", "open", "example", "new-file", "rename-file", "format", "check", "test", "new-project", "import-project", "saved-projects", "entry", "project-name", "network-access"]) $(id).disabled = on;
    editor.readOnly = on; $("stop").hidden = !on; tabs(); renderFiles();
  }
  function report(error) {
    const stopped = error.code === "STOPPED"; setStatus(stopped ? "Stopped" : "Something to fix", stopped ? "ready" : "error"); showView("output");
    if (stopped) { append("Program stopped.", "answer"); $("result-info").textContent = "You can edit your program and run it again."; return; }
    errorLine = error.source === project.active ? error.line : null; gutter();
    append(`${error.source || project.active}:${error.line || 1}: ${error.message}`, "error");
    for (const frame of error.frames || []) append(`  in ${frame.name}, called at ${frame.source}:${frame.line}`, "answer");
    if (Object.hasOwn(project.files, error.source || project.active)) {
      const button = document.createElement("button"); button.type = "button"; button.className = "goto-line"; button.textContent = `Go to ${error.source || project.active}, line ${error.line || 1}`;
      button.addEventListener("click", () => goTo(error)); output.append(button);
    }
    $("result-info").textContent = "Fix that line, then try again.";
  }
  async function run(test = false) {
    if (controller) return;
    try { project.write(project.active, editor.value); } catch (error) { report(error); return; }
    controller = new AbortController(); const thisController = controller; busy(true); persist(); output.replaceChildren(); values = {}; renderValues(); showView("output");
    setStatus(test ? "Running tests…" : "Running…", "running"); $("result-info").textContent = "Following your program, one line at a time…";
    const adapters = project.adapters(() => { persist(); tabs(); renderFiles(); });
    try {
      const names = test ? Object.keys(project.files).filter(name => name.endsWith(".test.plain")) : [project.entry];
      if (test && !names.length && project.active.endsWith(".plain")) names.push(project.active);
      if (test && !names.some(name => Plain.parse(project.read(name), { sourceName: name }).some(node => node.kind === "test"))) {
        append('No tests found. Add test "a description" ... end to a .test.plain file.'); setStatus("No tests found"); $("result-info").textContent = "Select the Write & run tests example to get started."; return;
      }
      let passed = 0, failed = 0, outputCount = 0;
      for (const name of names) {
        const result = await Plain.run(project.read(name), {
          ...adapters, sourceName: name, signal: thisController.signal, maxOutputChars: 100000, maxSteps: 1000000, test,
          ...( $("network-access").checked ? { request: browserRequest } : {} ),
          write: text => { outputCount++; append(text); }, read: ask,
          onTest: item => { append(`${item.passed ? "PASS" : "FAIL"}  ${item.name}`, item.passed ? "" : "error"); if (!item.passed) append(`${item.error.source}:${item.error.line}: ${item.error.message}`, "error"); }
        });
        values = result.variables; passed += result.passed; failed += result.failed;
      }
      renderValues();
      if (test) { append(`${passed} passed, ${failed} failed.`); setStatus(failed ? "Tests need attention" : passed ? "All tests passed" : "No tests found", failed ? "error" : "done"); $("result-info").textContent = passed || failed ? `${passed + failed} tests across ${names.length} file(s).` : 'Add test "a description" ... end to a .test.plain file.'; }
      else { setStatus("Finished", "done"); $("result-info").textContent = `${outputCount} line${outputCount === 1 ? "" : "s"} of output. You made that.`; if (!outputCount) append("Done. Add a say command to show a result."); }
    } catch (error) { report(error); }
    finally {
      finishInput(null); controller = null; busy(false); editor.value = project.read(project.active); gutter(); lint(); persist(); $("run").focus({ preventScroll: true });
    }
  }
  function check() {
    if (controller) return; output.replaceChildren(); showView("output");
    try {
      project.write(project.active, editor.value); const seen = new Set(), visiting = new Set();
      function visit(name) {
        if (visiting.has(name)) throw new Error(`Circular module use involving "${name}".`); if (seen.has(name)) return; visiting.add(name);
        const body = Plain.parse(project.read(name), { sourceName: name });
        function walk(value) { if (!value || typeof value !== "object") return; if (value.kind === "use") visit(Plain.resolvePath(value.path, name)); for (const child of Object.values(value)) if (child && typeof child === "object") walk(child); }
        walk(body); visiting.delete(name); seen.add(name);
      }
      for (const name of Object.keys(project.files)) if (name.endsWith(".plain")) visit(name);
      append(`Syntax looks good. ${seen.size} source file(s) checked, including imports.`); setStatus("Project checked", "done"); $("result-info").textContent = "Syntax and module paths checked. Run your tests to check behaviour.";
    } catch (error) { report(error); }
  }
  function download(blob, name) {
    const link = document.createElement("a"), url = URL.createObjectURL(blob); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function safeFilename(name) { return name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "plain-project"; }
  $("save").addEventListener("click", () => download(new Blob([editor.value], { type: "text/plain;charset=utf-8" }), project.active.split("/").at(-1)));
  $("export-project").addEventListener("click", async () => {
    try { project.write(project.active, editor.value); const zip = await project.zip(JSZip); download(new Blob([zip], { type: "application/zip" }), safeFilename(project.name) + ".zip"); }
    catch (error) { report(error); }
  });
  $("import-project").addEventListener("click", () => $("zip-input").click());
  $("zip-input").addEventListener("change", async () => {
    const file = $("zip-input").files[0]; if (!file) return;
    try {
      if (file.size > 5000000) throw new Error("Choose a project ZIP smaller than 5 MB.");
      const imported = await Project.fromZip(await file.arrayBuffer(), JSZip); if (controller) return; project = imported; currentId = null; persist(); refresh(); setStatus("Project imported", "done");
    } catch (error) { report(error); } finally { $("zip-input").value = ""; }
  });
  $("open").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", async () => {
    const file = $("file-input").files[0]; if (!file) return;
    try {
      if (file.size > 500000) throw new Error("Choose a file smaller than 500 KB.");
      const source = (await file.text()).replace(/\r\n|\r/g, "\n"); if (controller) return;
      const name = Plain.resolvePath(file.name); if (Object.hasOwn(project.files, name)) throw new Error("A file already has that name. Rename it before importing another copy.");
      project.write(name, source); project.active = name; if (name.endsWith(".plain") && Object.keys(project.files).filter(name => name.endsWith(".plain")).length === 1) project.entry = name;
      persist(); refresh(); editor.focus();
    } catch (error) { report(error); } finally { $("file-input").value = ""; }
  });
  function fileDialog(mode) {
    if (controller) return; dialogMode = mode; $("file-dialog-title").textContent = mode === "new" ? "Add a file" : "Rename this file";
    $("file-path").value = mode === "new" ? "" : project.active; $("file-dialog-error").textContent = ""; $("file-dialog").showModal(); $("file-path").focus();
  }
  $("new-file").addEventListener("click", () => fileDialog("new")); $("rename-file").addEventListener("click", () => fileDialog("rename"));
  $("file-dialog-cancel").addEventListener("click", () => $("file-dialog").close());
  $("file-dialog-form").addEventListener("submit", event => {
    event.preventDefault();
    try {
      const name = Plain.resolvePath($("file-path").value.trim());
      if (dialogMode === "rename") project.rename(project.active, name);
      else { if (project.exists(name)) throw new Error("A file already has that name."); project.write(name, name.endsWith(".plain") ? '# Your next idea.\n' : ""); project.active = name; }
      $("file-dialog").close(); persist(); refresh(); editor.focus();
    } catch (error) { $("file-dialog-error").textContent = error.message; }
  });
  $("delete-file").addEventListener("click", () => {
    try {
      const owner = project, name = project.active, source = project.read(name); project.remove(name); persist(); refresh(); output.replaceChildren(); showView("output"); append(`Removed ${name}.`);
      const undo = document.createElement("button"); undo.type = "button"; undo.className = "undo-button"; undo.textContent = "Undo removal";
      undo.addEventListener("click", () => { try { if (project !== owner) throw new Error("Reopen the original project to restore that file."); if (project.exists(name)) throw new Error("That name is already in use."); project.write(name, source); project.active = name; persist(); refresh(); undo.remove(); append(`Restored ${name}.`); } catch (error) { report(error); } }); output.append(undo);
    } catch (error) { report(error); }
  });
  $("new-project").addEventListener("click", () => { project = new Project(); currentId = null; persist(); refresh(); output.replaceChildren(); append("Your new project is ready. Start with a small idea."); setStatus("New project"); });
  $("project-name").addEventListener("change", () => { project.name = $("project-name").value.trim().slice(0, 100) || "My Plain project"; persist(); });
  $("entry").addEventListener("change", () => { project.entry = $("entry").value; persist(); tabs(); });
  $("saved-projects").addEventListener("change", () => { const id = $("saved-projects").value; if (!id || !Object.hasOwn(saved, id)) return; try { project = new Project(saved[id]); currentId = id; draft = project.snapshot(); selector.value = "draft"; refresh(); store("studio.current", id); setStatus("Project opened"); } catch (error) { report(error); } });
  selector.addEventListener("change", () => {
    try {
      if (selector.value === "draft") { if (!draft) return; project = new Project(draft); currentId = load("studio.current"); }
      else { project = new Project(examples[selector.value]); currentId = null; }
      errorLine = null; refresh(); setStatus("Ready when you are");
    } catch (error) { report(error); }
  });
  editor.addEventListener("input", edited); editor.addEventListener("scroll", gutter);
  editor.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || editor.readOnly) return;
    const start = editor.selectionStart, before = editor.value.slice(0, start), line = before.slice(before.lastIndexOf("\n") + 1), spaces = line.match(/^\s*/)[0];
    const indent = spaces + (/^\s*(if|repeat|while|for|make|try|test|else|catch|finally)\b/.test(line) ? "  " : "");
    if (indent) { event.preventDefault(); editor.setRangeText("\n" + indent, start, editor.selectionEnd, "end"); edited(); }
  });
  $("diagnostic-link").addEventListener("click", () => diagnostic && goTo(diagnostic));
  $("run").addEventListener("click", () => run(false)); $("test").addEventListener("click", () => run(true)); $("check").addEventListener("click", check);
  $("format").addEventListener("click", () => { try { if (!project.active.endsWith(".plain")) throw new Error("Choose a .plain source file to format."); editor.value = Plain.format(editor.value); edited(); lint(); setStatus("Formatted", "done"); } catch (error) { report(error); } });
  $("stop").addEventListener("click", () => controller?.abort());
  for (const name of ["output", "values", "files"]) $("view-" + name).addEventListener("click", () => showView(name));
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !pending) { event.preventDefault(); run(event.shiftKey); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); $(event.shiftKey ? "export-project" : "save").click(); }
    if (event.key === "Escape" && controller) controller.abort();
  });
  function renderLibrary() {
    const query = $("library-search").value.toLowerCase().trim(), panel = $("library-list"); panel.replaceChildren();
    for (const item of Plain.catalog()) {
      const info = globalThis.PLAIN_LIBRARY_HELP?.[item.name] || { signature: item.name + "(…)", description: `${item.min === item.max ? item.min : `${item.min} to ${item.max}`} arguments.` };
      if (query && !(item.name + " " + info.description).toLowerCase().includes(query)) continue;
      const div = document.createElement("div"); div.className = "library-item"; const code = document.createElement("code"); code.textContent = info.signature; const p = document.createElement("p"); p.textContent = info.description; div.append(code, p); panel.append(div);
    }
  }
  $("library-search").addEventListener("input", renderLibrary);
  refresh(); renderLibrary(); if (currentId) persist();
})();
