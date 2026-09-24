export function listen() {
  return new EventSource('/api/events');
}
