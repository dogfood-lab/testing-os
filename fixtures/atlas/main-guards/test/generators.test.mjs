import { applyAnnotations } from '../scripts/annotate.mjs';
import { rows } from '../scripts/gen-data.mjs';
import { generate } from '../src/corpus.mjs';
import { receipt } from '../tools/fetch.mjs';
import { formatLines } from '../tools/format.mjs';

applyAnnotations('/tmp/library', {});
rows();
generate('/tmp/corpus');
receipt(1);
formatLines([]);
