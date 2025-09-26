import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();
const PORT = 4097;
const OPENCODE_URL = 'http://localhost:4096';

// Enable CORS for all origins
app.use(cors());

// Proxy all requests to OpenCode server
app.use('/', createProxyMiddleware({
  target: OPENCODE_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket proxy
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying ${req.method} ${req.url} to ${OPENCODE_URL}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}));

app.listen(PORT, () => {
  console.log(`CORS proxy server running on http://localhost:${PORT}`);
  console.log(`Proxying requests to OpenCode server at ${OPENCODE_URL}`);
});