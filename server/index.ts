import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite"; // 'log' is imported from ./vite

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine); // This uses the 'log' function imported from ./vite
    }
  });

  next();
});

(async () => {
  // The 'log' function is available here if imported at the top
  log("Starting async IIFE setup", "ServerIndex");

  log("Registering routes...", "ServerIndex");
  const server = await registerRoutes(app); // Make sure registerRoutes returns the http.Server instance
  log("Routes registered.", "ServerIndex");

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error Handler: Status ${status}, Message: ${message}`, "ServerError"); // Log errors

    res.status(status).json({ message });
    // Consider not re-throwing 'throw err;' unless you have another layer to catch it,
    // as it might terminate the process if unhandled by a higher-level promise catch.
  });
  log("Error handling middleware configured.", "ServerIndex");

  log(`App environment: ${app.get("env")}`, "ServerIndex");
  if (app.get("env") === "development") {
    log("Setting up Vite for development...", "ServerIndex");
    await setupVite(app, server);
    log("Vite setup for development complete.", "ServerIndex");
  } else {
    log("Configuring static file serving for production...", "ServerIndex");
    serveStatic(app); // Assuming this is your original serveStatic from ./vite
    log("Static file serving configured for production.", "ServerIndex");
  }

  // --- PORT ADJUSTMENT FOR RAILWAY ---
  // const port = 5000; // Your original hardcoded port
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5000; // Use Railway's port, fallback to 5000
  // --- END OF PORT ADJUSTMENT ---

  log(`Attempting to listen on host 0.0.0.0, port ${port}`, "ServerIndex");
  server.listen({
    port,
    host: "0.0.0.0", // Important: Listen on all available network interfaces
    // reusePort: true, // This can sometimes be problematic; consider removing if issues arise
  }, () => {
    log(`Server IS LISTENING on port ${port}`, "ServerListen"); // Confirmation log
    if (process.env.RAILWAY_STATIC_URL) { // Optional: Log Railway's public URL if available
        log(`App might be available at: https://${process.env.RAILWAY_STATIC_URL}`, "ServerListen");
    }
  });
})().catch(err => {
  // Catch errors from the main async IIFE (e.g., if registerRoutes rejects)
  log(`CRITICAL ERROR during async setup: ${err.message}${err.stack ? `\nStack: ${err.stack}` : ''}`, "ServerIIFE_Error");
  console.error('[SERVER_INDEX_CRITICAL_IIFE_ERROR]', err); // Also log to console.error
  process.exit(1); // Exit if the main async setup fails critically
});

// Optional: Add top-level unhandled error catchers if not already present
// These were in the smoke test and can be useful.
process.on('uncaughtException', (err, origin) => {
  log(`UNCAUGHT_EXCEPTION: Origin: ${origin}, Error: ${err.message}${err.stack ? `\nStack: ${err.stack}` : ''}`, "ServerProcessError");
  console.error(`[SERVER_UNCAUGHT_EXCEPTION] Origin: ${origin}`, err);
  process.exit(1); // Usually good to exit on unhandled exceptions
});

process.on('unhandledRejection', (reason, promise) => {
  const reasonMessage = reason instanceof Error ? reason.message : String(reason);
  log(`UNHANDLED_REJECTION: Reason: ${reasonMessage}${reason instanceof Error && reason.stack ? `\nStack: ${reason.stack}` : ''}`, "ServerProcessError");
  console.error('[SERVER_UNHANDLED_REJECTION] At:', promise, 'reason:', reason);
  process.exit(1); // Usually good to exit on unhandled rejections
});

log("Bottom of server/index.ts synchronous execution.", "ServerIndex");
