import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { authenticateAccessToken } from "./middleware/authMiddleWare";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Add middleware to parse JSON
app.use(express.json());

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

// Debug middleware - log all requests
app.use((req, res, next) => {
  next();
});


// Proxy /api/v1/user
app.use("/api/v1/user", async (req, res) => {
  try {
    const targetUrl = `http://user-service:3030${req.originalUrl}`;
    
    // Use the built-in http module to make the request
    const http = require('http');
    const url = require('url');
    
    const parsedUrl = url.parse(targetUrl);
         const options = {
       hostname: parsedUrl.hostname,
       port: parsedUrl.port,
       path: parsedUrl.path,
       method: req.method,
       headers: {
         // Don't override Content-Type - let the original headers pass through
         ...req.headers
       }
     };
    
    const proxyReq = http.request(options, (proxyRes: any) => {console.log(`🔄 Response from user service: ${proxyRes.statusCode}`);
      
      let data = '';
      proxyRes.on('data', (chunk: any) => {
        data += chunk;
      });
      
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).send(data);
      });
    });
    
    proxyReq.on('error', (error: any) => {
      res.status(500).json({ error: 'Proxy error', details: error.message });
    });
    
         if (req.method !== 'GET') {
       // For multipart uploads, we need to handle the body differently
       if (req.headers['content-type']?.includes('multipart/form-data')) {
         // For multipart, we need to pipe the raw request body
         req.pipe(proxyReq);
         return; // Don't call proxyReq.end() as piping handles it
       } else if (req.body) {
         // For JSON requests
         proxyReq.write(JSON.stringify(req.body));
       }
     }
    
    proxyReq.end();
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Proxy error', details: errorMessage });
  }
});

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

// Proxy /api/v1/media with special handling for images
app.use("/api/v1/media", (req, res, next) => {
  // Check if this is an image request (no auth required for public images)
  if (req.path.includes('/images/') || req.path.includes('.jpg') || req.path.includes('.jpeg') || req.path.includes('.png')) {
    // Handle image requests directly without auth
    const imagePath = req.path.replace('/api/v1/media/', '').replace(/^\/+/, '');
    const minioUrl = `http://minio:9000/media-bucket/${imagePath}`;
    
    console.log(`Serving image: ${imagePath}`);
    console.log(`MinIO URL: ${minioUrl}`);
    
    // Fetch image from MinIO
    const http = require('http');
    const url = require('url');
    
    const parsedUrl = url.parse(minioUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'API-Gateway'
      }
    };
    
    const proxyReq = http.request(options, (proxyRes: any) => {
      // Set appropriate headers for image
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for images
      
      // Pipe the response
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (error: any) => {
      console.error('Error fetching image from MinIO:', error);
      res.status(404).json({ error: 'Image not found' });
    });
    
    proxyReq.end();
  } else {
    // For non-image requests, use the regular proxy with auth
    authenticateAccessToken(req, res, next);
  }
});

// Media service proxy for non-image requests (after auth)
app.use(
  "/api/v1/media",
  createProxyMiddleware({
    target: process.env.MEDIA_SERVICE_URL || "http://media-service:3032",
    changeOrigin: true,
    pathRewrite: {
      "^/api/v1/media": "",
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