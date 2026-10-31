# Runtime, embedding, and boundaries

## Defined execution model

Plain 1.0 is a tree-walking interpreter written in JavaScript, shared by the browser and Node.js. It has dynamic types, lexical closures, function-local assignment, mutable lists/records, structural equality, and sequential, awaited calls. Each normal run starts fresh. Modules are cached for that run; a persistent session keeps its values and module cache until reset.

This release supports console applications, data transformation, scripts, file-based tools, and HTTP clients. It does not include native machine-code output, native threads, classes/inheritance, a GUI widget framework, direct database drivers, an HTTP server API, a package registry, or a language server. Lists, records, actions, modules, and JSON cover the data/reuse model implemented here. The build command packages this runtime for Node.js.

There is no supported-language claim beyond the behaviour described in the handbook and exercised by the included test suite. New features should be accompanied by changes to the parser, runtime, reference, and relevant tests. Product maturity and suitability for a particular workload need real-world use in addition to automated checks.

## Numbers

Numbers use IEEE-754 double-precision floating-point arithmetic. Finite fractional numbers are supported; NaN and infinity are rejected. Integers are exact up to 9,007,199,254,740,991. For example, `0.1 + 0.2` can show `0.30000000000000004`. `math.round` is useful for display but does not turn floating-point values into an exact decimal type. There is no arbitrary-precision integer or exact decimal type in this release.

## Resource limits

| Resource | Default |
| --- | --- |
| Execution | 1,000,000 steps per run; statements, expression nodes, calls, and loop iterations count |
| Studio output and generated text | 100,000 characters per run/value |
| Terminal output and generated text | 1,000,000 characters by default; adjustable with --max-output |
| Lists | 100,000 items per produced list |
| Nested calls | 128, including active native callback frames |
| Parser nesting | 64 nested blocks/grouped expressions |
| Expression tokens | 512 per logical expression |
| Source file | 500,000 characters in the engine; Studio additionally limits files to 500 KB UTF-8 |
| Structured data nesting | Approximately 128 levels; construction, JSON conversion, and display enforce bounds |
| JSON serialization | Up to 100,000 expanded values and 1,000,000 text characters |
| Value display | Up to 1,000,000 characters |
| Studio project | 100 files, 1,000 folders, and 5 MB of UTF-8 content |
| Studio visible output | First 2,000 lines; use the terminal for longer output |
| Terminal file read / HTTP body | 5 MB |
| Terminal HTTP request | 20 seconds |
| One sleep | 0–600,000 milliseconds |

Calls and callback invocations count execution work; algorithms such as sort and unique also count per-item steps. Large, repeated structures are bounded during display and serialization, rather than expanded without limit. File and HTTP host adapters also bound input size. Limits are practical defaults, not a guarantee of constant memory/time for every possible operation. A failed program can leave file writes or shared session mutations already performed; execution is not transactional.

## Files and network

Studio file operations use the current text project. They do not read arbitrary files from the computer. Import/Open file lets the user select input; Export/Save downloads output. Entry-file deletion is protected in Studio, and Studio manages its plain.json manifest from the project-name and entry controls. Browser storage may be disabled, private, quota-limited, or cleared; portable ZIP backups are the durable format.

The terminal host resolves file paths under the project root and checks existing path components for links outside that root. Absolute paths are accepted only when they resolve within that root. Imports use relative project paths. The host has ordinary operating-system access, so these checks are application boundaries, not a hardened security sandbox against concurrent filesystem manipulation. There is no shell-execution or arbitrary JavaScript API in Plain source.

HTTP is opt-in. Enable Allow HTTP in Studio, or pass `--allow-net` to the terminal. Studio requests are subject to browser CORS rules. The terminal supports ordinary HTTP/HTTPS requests without browser CORS restrictions. Bodies are UTF-8 text; records/lists passed to `http.send` are JSON-encoded. Set a `Content-Type` header when the receiving API requires it. HTTP responses contain `status`, `ok`, `body`, and `headers`. Stop cancels an outstanding request; filesystem operations already in flight may complete.

Dates come from the host clock. `time.now()` and `time.date()` produce UTC ISO output; parsing supplied date text follows JavaScript Date. Random values use a pseudorandom host source, not a cryptographic generator.

## Embed Plain

```js
const Plain = require("./plain.js");

async function example() {
  const result = await Plain.run(
    'set score to 10\nsay score + 5',
    {
      sourceName: "main.plain",
      write: line => console.log(line),
      read: async (question, { numeric, signal }) => "3",
      maxSteps: 1000000
    }
  );
  console.log(result.variables.score);
}
example();
```

`run(source, options)` returns `output`, `variables`, `steps`, `tests`, `passed`, and `failed`. Output values are text lines. Variables contains top-level user names; functions are runtime values, not JSON data. Use `Plain.inspect(value)` for readable output and `Plain.type(value)` for the language type name.

`parse(source, {sourceName})` returns an AST or throws a `PlainError`. It checks syntax without execution. `format(source)` validates and returns consistently indented source. `catalog()` returns built-in function names and minimum/maximum argument counts. `resolvePath(path, from)` resolves a relative project path, rejecting traversal outside the project.

`createSession(options)` exposes asynchronous `run(source, overrides)`, `variables()`, and `reset()`. A session accepts one run at a time. Each invocation has fresh execution/output limits while keeping its scope and module cache. Do not change host-capability policies midway through a persistent session containing mutable application state.

Optional adapters are `files` with read/write/append/exists/list/remove/mkdir methods; `loadModule(specifier, from)` returning `{id, source}`; and `request({method, url, body, headers, signal})` returning a response record. Input adapters return text or `null` to cancel. Adapters can be asynchronous. Provide an AbortSignal as `signal`; callbacks should also honor it to stop their own work. Host errors become readable `HOST_ERROR` failures.

Other options include `maxOutputChars`, `maxItems`, `maxCallDepth`, `args`, `platform`, `test`, and `onTest(result)`. Positive integer limits are required. `now` and `random` can supply deterministic sources for testing. A `PlainError` includes `message`, `code`, `source`, `line`, `column`, and call `frames`. `onTest` receives each completed test result. Failed test checks are returned in the result; fatal errors, cancellation, and limits reject the run.

## Source map

- `plain.js`: tokenizer, parser, interpreter, value semantics, and standard library.
- `node-host.cjs`: project-scoped files, terminal input, HTTP, and error presentation.
- `cli.cjs` / `plain.cjs`: commands and executable entry point.
- `tooling.cjs`: project discovery, import graph, scaffolding, and source bundler.
- `src/project.js`: Studio project model and bounded ZIP import/export.
- `src/studio.js`: Studio controls and run/test/check workflow.
- `src/playground.html` / `src/playground.css`: the preserved Plain visual design and layout.
- `library-info.cjs`: shared library documentation catalogue.
- `build.cjs`: offline product and handbook builder.
- `tests`: unit, regression, host, CLI, packaging, and Studio event tests.
