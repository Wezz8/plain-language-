#!/usr/bin/env node
"use strict";
require("./cli.cjs").main().catch(error => {
  console.error(require("./node-host.cjs").formatError(error));
  process.exitCode = 1;
});
