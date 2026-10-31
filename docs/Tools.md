# Projects and tools

## Start in Studio

Open `Plain.html` or double-click `Start Plain.cmd`. Studio is an offline application in one HTML file. It needs no account, server, or installation. `Manual.html` is this handbook; keep it beside Studio for the handbook link.

- Select an example to explore an idea, or choose New project.
- Use + to add a source/data file, and select its tab to edit it.
- Set Start from to the application's entry file. Run program always starts there.
- Format indents the active source file. Check project parses all source files and checks import paths and cycles; it does not prove types or runtime values are correct.
- Run tests discovers `.test.plain` files; if none exist, it checks the active source file for top-level tests.
- Output shows printed lines and errors. Values shows the final top-level values from the run. Project files shows source/data files, including files created by your program.
- Rename changes the file's name; update any import paths that refer to it. Removing a non-entry file offers Undo removal until you replace the output. Choose a different entry before removing the existing entry.
- Each edited/imported project is saved in this browser when storage is available. The Saved projects menu reopens projects. Example switching keeps edited projects. Browser storage is a convenience; Export ZIP makes a portable backup.
- Open file adds a text file without replacing an existing file of the same name. Save file saves the active file, preserving its actual filename and extension.

Ctrl+Enter runs the project. Ctrl+Shift+Enter runs tests. Ctrl+S saves the active file. Ctrl+Shift+S exports a ZIP. Escape or Stop cancels execution, including waiting for input or HTTP. Enter continues your indentation; Tab retains normal keyboard navigation.

## Move between Studio and terminal

Export ZIP includes source files, data, folders, and a `plain.json` manifest. Extract it, then run its folder with the terminal tools. Import ZIP opens the same project in Studio. ZIPs made by the OS with one enclosing project folder are supported when they contain `plain.json`. Studio handles text project files; it is not a binary asset editor.

The included task-manager project is a complete console application. It adds tasks, marks tasks complete, reads/writes JSON, uses a module, and includes tests. Its Studio data lives in the saved project and exported ZIP; terminal data lives in the project's actual files.

## Terminal commands

The terminal tools require Node.js 18 or newer. No npm packages need to be installed. Open a terminal in the Plain product folder. On Windows, `Plain.cmd` is a command wrapper; with no arguments, it opens Studio. The portable commands below work wherever Node.js is installed.

```text
node plain.cjs new my-app
node plain.cjs run my-app
node plain.cjs check my-app
node plain.cjs test my-app
node plain.cjs build my-app -o my-app/dist/app.cjs
node my-app/dist/app.cjs
```

| Command | Result |
| --- | --- |
| `plain run [file or folder]` | Run the selected program, defaulting to the current project |
| `plain file.plain` | Short form of run |
| `plain check [file or folder]` | Parse the entry and all its static imports, including those in inactive branches |
| `plain --check file.plain` | Compatible short form of check |
| `plain format file.plain` | Print formatted source |
| `plain format file.plain --write` | Save formatted source |
| `plain test [file or folder]` | Run a file or recursively discover `.test.plain` files |
| `plain new new-folder` | Create a module-based project with tests; an existing target folder is not overwritten |
| `plain build [file or folder] -o app.cjs` | Bundle all static Plain source modules into one runnable Node.js file |
| `plain repl` | Start a persistent interactive session |
| `plain library` | List the standard-library calls and argument counts |
| `plain --version` | Print the language version |
| `plain --help` | Show help |

`plain` above means `node plain.cjs` or the Windows wrapper. Syntax/runtime failures return exit code 1. A successful command returns 0. A test suite with failures returns 1. No discovered tests is a failure in the terminal. Test discovery skips `node_modules`, `.git`, `dist`, and `.plain` directories and does not follow directory links.

Run options are `--allow-net`, `--root folder`, `--max-steps number`, and `--max-output number`. After `--`, remaining arguments become the text list `system.args`.

```text
node plain.cjs run my-app --max-steps 2000000 -- one two
```

When you select a project folder, `plain.json` chooses its `main` file; without a manifest it uses `main.plain`. When you select a source file, the nearest ancestor containing `plain.json` becomes the project root. Without one, its containing folder is the root. `--root` overrides that boundary, and the entry must remain inside it.

## Builds

The build command is a **source bundler**, not a machine-code compiler. A bundled `.cjs` contains the parser, runtime, standard library, Node host adapter, and all imported Plain source. It runs with Node.js 18+ without the original `.plain` source files or npm dependencies. Builds refuse to overwrite a source file.

Data files are separate. Put required data beside the built application, or distribute a project ZIP containing the application and data. The bundled application's directory becomes its file root. Its command-line `--allow-net` enables HTTP; other command-line values become `system.args`.

## REPL

`plain repl` requires an interactive terminal. Variables and actions persist between entries. Close a block with `end` to run it. Use `say expression` to see a value. `.reset` clears values and cached modules; `.help` shows session help; `.exit` leaves. A failed entry keeps assignments already performed in that session.

## Editor support

The product includes a VS Code language extension folder with `.plain` file recognition, syntax colouring, comments, bracket matching, and indentation rules. Its README explains the local installation. Studio also works independently of an external editor.

## Building the Plain product itself

```text
node --test
node build.cjs
```

The first command checks the language, standard library, projects, filesystem boundaries, HTTP integration, bundled applications, ZIP round trips, and Studio event behaviour. Studio tests use an in-memory DOM; they are not visual browser tests. The second command builds the offline Studio, example catalogue, generated library reference, and standalone HTML handbook. All runtime dependencies are included; the ZIP library's notices are in `vendor`.
