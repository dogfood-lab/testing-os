import { greet } from '../core/engine.js';

export function handle(request) {
  return { status: 200, body: greet(request.name) };
}
