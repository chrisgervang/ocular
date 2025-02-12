#!/usr/bin/env node

import {execShellCommand} from '../src/utils/shell.js';
import {join} from 'path';

const scriptDir = new URL(import.meta.url).pathname;
// Runs the bash script and forward the arguments, exiting with the same code
execShellCommand(join(scriptDir, '../test.sh'), process.argv.slice(2));
