import { Store, openDb } from './store.js';

function main() {
  const store = new Store();
  store.save();
  const db = openDb();
  db.query();
}

main();
