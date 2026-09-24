import { card } from './card.js';

export function Lock({ builtIn }: { builtIn: boolean }) {
  return <span title={card('lock')}>{builtIn && <b>&#128274;</b>}</span>;
}
