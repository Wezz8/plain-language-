"use strict";
const fs = require("node:fs");
const path = require("node:path");
const here = __dirname;
const read = file => fs.readFileSync(path.join(here, file), "utf8");
const Plain = require("./plain.js");
const library = require("./library-info.cjs");
const script = code => "<script>\n" + code.replace(/<\/script/gi, "<\\/script") + "\n</script>";
function collect(folder, base = folder, files = {}) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) collect(full, base, files);
    else if (entry.isFile()) files[path.relative(base, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
  }
  return files;
}
const examples = {};
for (const name of fs.readdirSync(path.join(here, "examples"))) if (name.endsWith(".plain")) examples[name.slice(0, -6)] = { name: "Plain · " + name.slice(0, -6), entry: name, files: { [name]: read("examples/" + name) } };
for (const entry of fs.readdirSync(path.join(here, "projects"), { withFileTypes: true })) if (entry.isDirectory()) {
  const files = collect(path.join(here, "projects", entry.name));
  const manifest = files["plain.json"] ? JSON.parse(files["plain.json"]) : {}; delete files["plain.json"];
  examples[entry.name] = { name: manifest.name || "Plain · " + entry.name, entry: manifest.main || "main.plain", files };
}
for (const project of Object.values(examples)) for (const [name, source] of Object.entries(project.files)) if (name.endsWith(".plain")) Plain.parse(source, { sourceName: name });
for (const item of Plain.catalog()) if (!library[item.name]) throw new Error(`Missing library documentation: ${item.name}`);
fs.writeFileSync(path.join(here, "src/studio-examples.json"), JSON.stringify(examples, null, 2) + "\n");
const html = read("src/playground.html")
  .replace("<!--PLAIN_STYLE-->", () => "<style>\n" + read("src/playground.css") + "\n</style>")
  .replace("<!--PLAIN_ZIP-->", () => script(read("vendor/jszip.min.js")))
  .replace("<!--PLAIN_ENGINE-->", () => script(read("plain.js")))
  .replace("<!--PLAIN_PROJECT-->", () => script(read("src/project.js")))
  .replace("<!--PLAIN_APP-->", () => script("globalThis.PLAIN_EXAMPLES = " + JSON.stringify(examples) + ";\nglobalThis.PLAIN_LIBRARY_HELP = " + JSON.stringify(library) + ";\n" + read("src/studio.js")));
fs.writeFileSync(path.join(here, "Plain.html"), html);
const libMarkdown = "# Standard library\n\nAll calls wait for their result. Positions start at 1. Optional arguments are described in each row.\n\n| Call | Behaviour |\n| --- | --- |\n" + Object.values(library).map(item => `| \`${item.signature}\` | ${item.description} |`).join("\n") + "\n\n## Values and constants\n\n`math.pi`, `math.e`, `system.version`, `system.platform`, and `system.args` are read-only library values.\n";
fs.writeFileSync(path.join(here, "docs/Standard-library.md"), libMarkdown);
function escape(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function inline(text) { return escape(text).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); }
function markdown(source) {
  const lines = source.split("\n"), result = []; let code = null, list = false, table = false;
  for (const line of lines) {
    if (line.startsWith("```")) { if (code !== null) { result.push("<pre><code>" + escape(code.join("\n")) + "</code></pre>"); code = null; } else code = []; continue; }
    if (code !== null) { code.push(line); continue; }
    if (!line.startsWith("- ") && list) { result.push("</ul>"); list = false; }
    if (!line.startsWith("|") && table) { result.push("</tbody></table></div>"); table = false; }
    const heading = line.match(/^(#{1,4}) (.*)$/);
    if (heading) result.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (line.startsWith("|")) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      const cells = line.slice(1, -1).split("|").map(item => `<${table ? "td" : "th"}>${inline(item.trim())}</${table ? "td" : "th"}>`).join("");
      if (!table) { result.push('<div class="table-scroll"><table><tbody>'); table = true; } result.push("<tr>" + cells + "</tr>");
    } else if (line.startsWith("- ")) { if (!list) { result.push("<ul>"); list = true; } result.push("<li>" + inline(line.slice(2)) + "</li>"); }
    else if (line.trim()) result.push("<p>" + inline(line) + "</p>");
  }
  if (list) result.push("</ul>"); if (table) result.push("</tbody></table></div>"); return result.join("\n");
}
const sections = [["language", "Language.md"], ["library", "Standard-library.md"], ["tools", "Tools.md"], ["runtime", "Runtime.md"]];
if (sections.every(([, file]) => fs.existsSync(path.join(here, "docs", file)))) {
  const body = sections.map(([id, file]) => `<section id="${id}">${markdown(read("docs/" + file))}</section>`).join("\n");
  const manual = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plain 1.0 handbook</title><style>body{background:#f7f6f2;color:#303a2a;font:15px/1.8 "Segoe UI",Arial,sans-serif;margin:0}main{max-width:1000px;margin:auto;padding:35px 30px 80px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d9dfcf;padding-bottom:20px}header strong{font-size:32px;letter-spacing:-2px}header strong span{color:#d25736}a{color:#a95336;text-decoration:none}nav{display:flex;gap:20px;flex-wrap:wrap;margin:25px 0 35px;font-size:13px}h1{color:#be5437;font-size:36px;letter-spacing:-1px;line-height:1.3;margin-top:55px}h2{font-size:23px;margin-top:35px}h3{font-size:18px}code{font:13px Consolas,monospace;background:#ecefe4;padding:2px 4px;border-radius:3px}pre{background:#eff2e8;padding:20px;border:1px solid #dce3d0;border-radius:8px;overflow:auto;line-height:1.8}pre code{background:none;padding:0}table{border-collapse:collapse;width:100%;font-size:13px;margin:15px 0}td,th{border-bottom:1px solid #dae1ce;padding:12px;text-align:left;vertical-align:top}th{color:#637754}.table-scroll{overflow:auto}section{scroll-margin-top:25px}li{margin-bottom:8px}p{max-width:88ch}</style></head><body><main><header><strong>plain<span>.</span></strong><a href="Plain.html">Open Studio ↗</a></header><nav><a href="#language">The language</a><a href="#library">Standard library</a><a href="#tools">Projects & tools</a><a href="#runtime">Runtime & limits</a></nav>${body}</main></body></html>`;
  fs.writeFileSync(path.join(here, "Manual.html"), manual);
}
console.log(`Built Plain Studio ${Plain.VERSION}: ${Object.keys(examples).length} example projects and ${Plain.catalog().length} library functions. No installation needed.`);
