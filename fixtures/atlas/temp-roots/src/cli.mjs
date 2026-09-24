import { Executor, seed } from './executor.mjs';
import { addSong } from './server.mjs';

addSong({ id: 'a' });
new Executor().start([{ id: 'b' }]);
seed([{ id: 'c' }]);
