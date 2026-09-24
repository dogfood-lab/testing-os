const API_BASE = '/api';

async function post(path, body) {
  return fetch(`${API_BASE}${path}`, { method: 'POST', body: JSON.stringify(body) });
}

export const addLayer = (id) => post('/layers/add', { id });
export const readState = () => fetch('/api/state');
