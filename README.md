# Plain 1.0

**Readable code. Real programs.** A programming language, offline Studio, standard library, and project toolchain.

**Open `Plain.html` or double-click `Start Plain.cmd`.** Studio needs no installation. Open `Manual.html` for the complete handbook.

```plain
make double(amount)
  give amount * 2
end

set scores to [10, 20, 30]
for score in scores
  say "Double", score, "is", double(score)
end
```

## What is included

- Functions, recursion, lexical closures, and higher-order calls.
- Numbers, text, booleans, nothing, lists, records, fields, and 1-based positions.
- Conditions, else-if, fixed-count loops, foreach, while, stop, and skip.
- List/record mutation, deep copies, structural equality, and UTF-8 text files.
- Modules with independent scopes, relative imports, caching, and cycle checks.
- Error handling, finally blocks, readable errors, call frames, and assertions.
- Built-in tests with terminal exit codes and Studio results.
- 67 standard-library functions for data, text, lists, maths, JSON, dates, randomness, files, and HTTP.
- Studio projects, multiple source/data files, saved projects, ZIP import/export, a value inspector, source formatting, and project checking.
- Terminal commands for running, checking, formatting, testing, scaffolding, bundling, and persistent REPL sessions.
- Ten example projects, including a task manager that saves actual JSON data.
- A VS Code language extension folder for `.plain` files.

## Start small

```plain
set name to "Ada"
say "Hello,", name

if name is "Ada"
  say "Welcome back."
end
```

The basic commands stay simple: `set`, `say`, `ask`, `if`, and `repeat`. Learn `make`, lists, records, and modules when your program needs them. Blocks use one consistent closing word: `end`.

In Studio, try **A task manager**. Enter `add`, `done`, `list`, or `quit`. Your changes are saved in the project. **Run tests** checks the same task module. **Export ZIP** gives you the complete runnable project and its data.

## Run from a terminal

Node.js 18 or newer is required for terminal tools. No npm packages need to be installed. Open a terminal in this folder:

```text
node plain.cjs examples/hello.plain
node plain.cjs run projects/modules
node plain.cjs test projects/modules
node plain.cjs new my-app
node plain.cjs run my-app
node plain.cjs build my-app -o my-app/dist/app.cjs
node my-app/dist/app.cjs
```

On Windows, `Plain.cmd` wraps these commands: `Plain.cmd run projects/modules`. With no arguments it opens Studio. It uses an installed Node.js or the bundled Codex runtime when that runtime is present.

Use `--allow-net` when a terminal program needs HTTP. Studio has an **Allow HTTP** checkbox and follows browser CORS rules. Files stay inside the project boundary. Imported modules use paths relative to their source file; `files` operations use paths relative to the project root.

## Documentation

- `Manual.html`: standalone, searchable-with-your-browser handbook.
- `docs/Language.md`: every command, expression, value, and scoping rule.
- `docs/Standard-library.md`: every library function and its behaviour; generated from `library-info.cjs`.
- `docs/Tools.md`: Studio, projects, terminal commands, builds, tests, and the REPL.
- `docs/Runtime.md`: execution model, limits, embedding API, and current boundaries.

## Develop Plain

```text
node --test
node build.cjs
```

Tests cover the original syntax plus functions, collections, modules, errors, the standard library, actual filesystem/HTTP host integration, terminal commands, standalone program bundles, ZIP interoperability, and Studio event behaviour. Studio event tests use an in-memory DOM; visual rendering has not been verified in this environment.

The build command creates `Plain.html`, `Manual.html`, the example catalogue, and the generated library reference. The parser/interpreter itself has no external dependencies. ZIP support is vendored with its third-party license notices.

## Release scope

Plain 1.0 is a working general-purpose interpreter and toolchain for console applications, data processing, file tools, and HTTP clients. Bundled programs require Node.js; `build` packages source and runtime rather than producing native machine code. The release has no native threads, GUI framework, database drivers, package registry, or language server. These are explicit boundaries, not hidden placeholders.

Numbers use ordinary floating-point arithmetic; `0.1 + 0.2` can display a rounding difference. Runtime limits bound runaway code and data expansion. No language can establish universal superiority from a feature list or a test suite; use the included programs and documentation to judge Plain for your work.
