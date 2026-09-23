export class Store {
  save() {
    return true;
  }
}

export function openDb() {
  return { query: () => [] };
}
