#!/usr/bin/env node
import { main } from './adapter/commands.js';

process.exit(main(process.argv.slice(2), process.cwd()));
