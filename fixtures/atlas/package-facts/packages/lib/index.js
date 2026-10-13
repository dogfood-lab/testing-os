import _ from 'lodash';
import fp from 'lodash/fp';
import { readFile } from 'node:fs';
import { stat } from 'fs/promises';
import EventEmitter from 'events';
import util from '@fx/util';
import own from '@fx/lib/sub.js';
import pad from 'left-pad';
import missing from 'undeclared-pkg';
import content from 'astro:content';

const located = require.resolve('typescript');

export default { _, fp, readFile, stat, EventEmitter, util, own, pad, missing, content, located };
