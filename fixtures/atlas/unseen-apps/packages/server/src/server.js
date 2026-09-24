import express from 'express';

export function createServer() {
  const app = express();
  const api = express.Router();
  api.get('/state', (req, res) => res.json({}));
  api.post('/layers/add', (req, res) => res.json({}));
  app.use('/api', api);
  app.get('/health', (req, res) => res.send('ok'));
  return app;
}
