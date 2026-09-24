import { walk } from './walk.js';

export function Panel() {
  return (
    <section>
      <h2>Recovery & Safety</h2>
      <p>
        Ownership & rights
      </p>
      <p>{walk('.').length} &amp; counting</p>
    </section>
  );
}
