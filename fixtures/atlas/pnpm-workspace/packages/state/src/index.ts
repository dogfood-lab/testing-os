import { shape } from '@ws/domain';

export function store(name: string): string {
  return shape(name);
}
