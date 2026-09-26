#!/usr/bin/env node
import { main } from './adapter/commands.js';

process.exit(await main(process.argv.slice(2), process.cwd()));
