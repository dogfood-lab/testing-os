import { writeFileSync } from 'node:fs';
import { fetchLogo } from '../lib/fetch.mjs';

writeFileSync('logos/org.svg', fetchLogo());
