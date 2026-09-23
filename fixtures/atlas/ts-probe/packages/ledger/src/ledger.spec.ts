import { createEngine } from '@probe/core';
import { settle } from './index.js';

settle(createEngine(1).seed);
