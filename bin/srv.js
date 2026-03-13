#!/usr/bin/env node

const { run } = require('../src/cli');

run().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
