# Plain 1.0.0

Released 31 October 2026.

Plain now includes a shared language runtime, an offline Studio, a standard library, and command-line project tools. The original Plain logo, colours, and layout are preserved.

## Language

The small starting vocabulary remains `set`, `say`, `ask`, `if`, and `repeat`, with `end` closing every block. Larger programs can use functions, recursion, closures, lists, records, indexed values, modules, error handling, assertions, and built-in tests. The standard library includes 67 functions for text, collections, maths, JSON, dates, randomness, files, and HTTP.

## Working with programs

Studio now supports saved projects, multiple files, imports, data files, ZIP import/export, formatting, project checks, tests, a value inspector, and a searchable library reference. The task-manager project saves its changes to JSON data.

The terminal tools run, check, format, test, scaffold, and bundle projects. An interactive session keeps variables between commands. Bundles include their runtime and source modules and run with Node.js 18 or newer. The included VS Code extension provides syntax highlighting and basic editing support.

`Manual.html` covers the language, every library function, the tools, and the runtime. `docs/Runtime.md` describes the implemented scope and limits.

## Release verification

- All **231 automated tests passed** on Windows with Node.js 24.22.1.
- Coverage includes the interpreter, standard library, error paths, resource limits, modules, real file operations, a local HTTP server, CLI exit codes, program bundles, ZIP interoperability, documentation examples, and Studio events.
- The generated single-file Studio was loaded in a browser-global JavaScript test environment and exercised with modules and ZIP export.
- The Windows launcher returned version `1.0.0` with exit code 0 and rejected a missing source file with exit code 1.
- Studio event checks use an in-memory DOM. Visual browser rendering has not been verified in this environment.

To repeat the automated verification, open a terminal in this folder and run `node --test`. Run `node build.cjs` to regenerate the offline Studio and handbook.
