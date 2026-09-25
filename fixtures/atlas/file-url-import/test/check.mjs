import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const simUrl = pathToFileURL(resolve(HERE, '../tools/diagnosis/sim.mjs')).href;

const { simulate } = await import(simUrl);
console.log(simulate(3));
