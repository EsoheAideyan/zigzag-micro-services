import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { authenticateAccessToken } from "./middleware/authMiddleWare";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// // Add middleware to parse JSON
// app.use(express.json());

// CORS middleware - must come before routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Root: simple health / info (so https://api.thezigzagapp.com/ doesn't 404)
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "zigzag-api-gateway", version: "1.0", basePath: "/api/v1" });
});

// Proxy /api/v1/user
app.use(
  "/api/v1/user",
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/v1/user": "/api/v1/user",
    },
  })
);
// Proxy /api/v1/events
app.use(
  "/api/v1/events",
  authenticateAccessToken,
  createProxyMiddleware({
    target: process.env.EVENT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/v1/events": "/api/v1/events",
    },
      on: {
      proxyReq: (proxyReq, req, _res) => {
        const user: any = (req as any).user;
        if (user && user.userId) {
          proxyReq.setHeader("x-user-id", user.userId);
          if (user.email) proxyReq.setHeader("x-user-email", user.email);
        }
        if (process.env.INTERNAL_GATEWAY_KEY) {
          proxyReq.setHeader("x-internal-key", process.env.INTERNAL_GATEWAY_KEY);
        }
      },
      error: (err, _req, res) => {
        (res as any).status(502).json({ message: "Upstream service unavailable" });
      },
    },
  })
);

// Proxy /api/v1/media
app.use(
  "/api/v1/media",
  authenticateAccessToken,
  createProxyMiddleware({
    target: process.env.MEDIA_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/v1/media": "/api/v1/media",
    },
  })
);

// Catch all
app.use((req, res) => {
  res.status(404).send("❌ API Gateway: Route not found.");
});

app.listen(PORT, () => {
  console.log(`✅ API Gateway running on port ${PORT}`);
  console.log(`🔗 User Service: ${process.env.USER_SERVICE_URL}`);
  console.log(`🔗 Event Service: ${process.env.EVENT_SERVICE_URL}`);
  console.log(`🔗 Media Service: ${process.env.MEDIA_SERVICE_URL}`);  
});