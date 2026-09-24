/**
 * Calls one part makes to another over HTTP, read from the code on both
 * ends: a server file (one that imports a server framework) routes a path
 * with app.get('/x', handler), router.post(...) or the like, and mounts a
 * router under a prefix with app.use('/api', router); a client file (one
 * that calls fetch, axios, EventSource or WebSocket) names the paths it
 * calls as string or template literals. A client path that matches a route,
 * with or without a mount prefix before it, is a call from the client's
 * part to the server's. No import shows the link, so it is an edge of its
 * own kind (http), and a door's reach does not follow it: running the UI
 * does not run the server.
 */

const SERVER_MODULES = new Set(['express', 'fastify', 'hono', 'koa', 'koa-router', '@koa/router', 'restify', 'polka', 'h3', '@hono/node-server']);
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'del', 'all', 'head', 'options']);
const CLIENT_CALLS = new Set(['fetch', '$fetch', 'ofetch', 'ky']);
const CLIENT_OBJECTS = new Set(['axios', 'ky']);
const CLIENT_CONSTRUCTORS = new Set(['EventSource', 'WebSocket']);
const URL_PATH = /^\/[A-Za-z0-9._~%:@!$&'()*+,;=/-]+$/;

/**
 * @param {object} root tree-sitter root of a JavaScript or TypeScript file
 * @returns {null | { routes: string[], mounts: string[], paths: string[] }}
 *   the routes and mount prefixes a server file declares, or the paths a
 *   client file names; null when the file is neither
 */
export function httpFacts(root) {
  let serves = false;
  let calls = false;
  const routes = new Set();
  const mounts = new Set();
  const literals = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'import_statement') {
      const source = stringText(node.childForFieldName('source'));
      if (source != null && (SERVER_MODULES.has(source) || source.startsWith('hono/'))) serves = true;
    } else if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      const args = (node.childForFieldName('arguments')?.namedChildren ?? []).filter((arg) => arg.type !== 'comment');
      if (fn?.type === 'identifier' && fn.text === 'require' && SERVER_MODULES.has(stringText(args[0]))) serves = true;
      if (fn?.type === 'identifier' && CLIENT_CALLS.has(fn.text)) calls = true;
      if (fn?.type === 'identifier' && CLIENT_OBJECTS.has(fn.text)) calls = true;
      if (fn?.type === 'member_expression') {
        const object = fn.childForFieldName('object');
        const property = fn.childForFieldName('property')?.text;
        if (object?.type === 'identifier' && CLIENT_OBJECTS.has(object.text)) calls = true;
        const first = urlText(args[0]);
        if (first != null && args.length >= 2 && ROUTE_METHODS.has(property)) routes.add(first);
        if (first != null && args.length >= 2 && property === 'use') mounts.add(first);
      }
    } else if (node.type === 'new_expression') {
      if (CLIENT_CONSTRUCTORS.has(node.childForFieldName('constructor')?.text)) calls = true;
    }
    if (node.type === 'string' || node.type === 'template_string') {
      const text = urlText(node);
      if (text != null) literals.add(text);
    }
    for (const child of node.namedChildren) stack.push(child);
  }
  if (serves && (routes.size > 0 || mounts.size > 0)) return { routes: [...routes].sort(), mounts: [...mounts].sort(), paths: [] };
  if (!serves && calls && literals.size > 0) return { routes: [], mounts: [], paths: [...literals].sort() };
  return null;
}

/**
 * The edges between parts that one calls the other over HTTP, with how many
 * of the server's routes the client's paths reach.
 *
 * @param {Map<string, object>} files every file of the map, by path
 * @param {Map<string, string>} boundaryOf the part of each file
 * @param {(path: string) => boolean} isTest
 * @returns {Array<{ from: string, to: string, kind: 'http', routes: number }>}
 */
export function httpEdges(files, boundaryOf, isTest) {
  const servers = [];
  const clients = [];
  for (const [path, file] of files) {
    if (!file.http || isTest(path) || !boundaryOf.has(path)) continue;
    if (file.http.paths.length > 0) clients.push({ path, paths: file.http.paths.map(segments) });
    else servers.push({ path, routes: file.http.routes, mounts: file.http.mounts });
  }
  const mounts = [...new Set(servers.flatMap((server) => server.mounts))];
  const pairs = new Map();
  for (const server of servers) {
    const to = boundaryOf.get(server.path);
    const routes = server.routes.map((route) => ({ route, shapes: [route, ...mounts.map((mount) => joinRoute(mount, route))].map(segments) }));
    for (const client of clients) {
      const from = boundaryOf.get(client.path);
      if (from === to) continue;
      for (const { route, shapes } of routes) {
        if (!client.paths.some((path) => shapes.some((shape) => matches(path, shape)))) continue;
        const key = `${from}\0${to}`;
        if (!pairs.has(key)) pairs.set(key, { from, to, routes: new Set() });
        pairs.get(key).routes.add(`${server.path}\0${route}`);
      }
    }
  }
  return [...pairs.values()].map((pair) => ({ from: pair.from, kind: 'http', routes: pair.routes.size, to: pair.to }));
}

function joinRoute(mount, route) {
  return `${mount.replace(/\/+$/, '')}/${route.replace(/^\/+/, '')}`;
}

function segments(path) {
  return path.replace(/[?#].*$/, '').split('/').filter((segment) => segment !== '');
}

// A route's :name or * segment, and a client path's segment read at run
// time, match any one segment.
function matches(path, shape) {
  if (path.length === 0 || path.length !== shape.length) return false;
  return path.every((segment, index) => segment === '*' || shape[index] === '*' || shape[index].startsWith(':') || segment === shape[index]);
}

function stringText(node) {
  if (node?.type !== 'string') return null;
  return node.namedChildren.filter((child) => child.type === 'string_fragment').map((child) => child.text).join('');
}

// A literal that names a URL path, with each part of a template read at run
// time as one segment; a template that starts with such a part (a base the
// code reads) is read from its first slash on.
function urlText(node) {
  let text = null;
  if (node?.type === 'string') text = stringText(node);
  else if (node?.type === 'template_string') {
    text = node.namedChildren.map((child) => (child.type === 'template_substitution' ? '*' : child.text)).join('');
    text = text.replace(/^\*+(?=\/)/, '');
  }
  if (text == null || text.length < 2 || !URL_PATH.test(text) || text.startsWith('//')) return null;
  return text;
}
