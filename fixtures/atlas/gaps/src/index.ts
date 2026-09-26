import { core } from './core';
import { parse } from './parse';
import { format } from './format';
import { a } from '../lib/a';

export function main(text: string): string {
  return format(core(parse(text)), a());
}
