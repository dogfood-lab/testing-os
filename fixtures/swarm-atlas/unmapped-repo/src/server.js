export function handle(request) {
  return { status: 200, body: `hello ${request.name}` };
}
