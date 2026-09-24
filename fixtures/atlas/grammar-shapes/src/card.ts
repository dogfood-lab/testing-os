import { readFileSync } from 'node:fs';

export function card(title: string): string {
  let abstract: string;
  abstract =
    readFileSync(title, 'utf8');
  abstract = abstract.trim();
  return `abstract: ${abstract}`;
}

export abstract class Shape {
  abstract area(): number;
}
