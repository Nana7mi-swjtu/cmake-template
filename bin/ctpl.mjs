#!/usr/bin/env node
import { main } from '../src/cli/main.mjs';

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((err) => {
    process.exitCode = err && err.exitCode ? err.exitCode : 1;
  });
