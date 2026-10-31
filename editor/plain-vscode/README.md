# Plain editor support

This folder is a local VS Code language extension. It supplies `.plain` file recognition, syntax colouring, comments, brackets, indentation, and folding markers. It has no executable extension code, language server, or debugger.

To install locally on Windows, copy this complete `plain-vscode` folder into your user extension directory as `%USERPROFILE%\.vscode\extensions\plain-local.plain-language-1.0.0`, then restart VS Code. On macOS/Linux the corresponding directory is `~/.vscode/extensions/plain-local.plain-language-1.0.0`. Keep `package.json`, `language-configuration.json`, and the `syntaxes` subfolder together.

Alternatively, open this folder as an extension-development project and use VS Code's extension-development host. Use the Plain CLI in your terminal to run/check/test programs. The standalone Plain Studio remains available without an external editor.
