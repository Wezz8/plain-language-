# Third-party components

Plain's parser, interpreter, standard library, host tools, and Studio code are provided as source in this project.

The offline Studio includes JSZip 3.10.1 for project ZIP import/export. This bundled distribution also includes pako. Their license notices are retained in the vendored JavaScript and in `vendor/JSZip-LICENSE.md` and `vendor/Pako-LICENSE.txt`. JSZip is used under its MIT option; pako is MIT licensed.

The interpreter and terminal runtime require no npm package installation. The vendored ZIP component is also used by packaging interoperability tests.
