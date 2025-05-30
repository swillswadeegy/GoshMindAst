import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
// import { fileURLToPath } from 'url'; // Not strictly needed if we switch strategy

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// MODIFIED setupVite for production safety
export async function setupVite(app: Express, server: Server) {
  // This function is intended for development.
  // In a production build (NODE_ENV=production), this function's body
  // should ideally not run or cause side effects like path errors.
  // The original path.resolve using import.meta.dirname was suspect.
  log("setupVite function called. This should only happen in a development environment.", "ViteSetup");

  // If you absolutely need to ensure it does nothing in prod builds handled by esbuild:
  if (process.env.NODE_ENV !== 'development') {
    log("NODE_ENV is not development, skipping actual Vite server setup.", "ViteSetup");
    return; // Exit early
  }

  // Original setupVite logic (keep it for local dev, but be mindful of paths)
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // Consider if process.exit(1) is too abrupt for all dev errors
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      // For development, Vite handles resolving client/index.html from project root.
      // This path is relative to the project root where Vite dev server runs.
      // No need for complex import.meta.dirname here usually in dev with Vite.
      // Vite's own dev server knows where 'client/index.html' is if 'root' is configured.
      // Assuming your project root is where 'client/index.html' can be found relative to:
      const clientIndexHtmlPath = path.resolve(process.cwd(), "client", "index.html"); // More robust for dev server context
      log(`Dev mode: attempting to load template from ${clientIndexHtmlPath}`, "ViteSetup");

      let template = await fs.promises.readFile(clientIndexHtmlPath, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      viteLogger.error(`Error in setupVite catch-all: ${(e as Error).message}`, "ViteSetup");
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// MODIFIED serveStatic for robust path handling in production
export function serveStatic(app: Express) {
  log("Attempting to configure static file serving for production (using process.cwd).", "ServeStatic_CWD");

  const baseDir = process.cwd(); // Should be /app on Railway
  log(`Base directory (process.cwd()): ${baseDir}`, "ServeStatic_CWD_Path");

  // Your vite.config.ts outputs client files to "dist/public" relative to project root.
  // Your esbuild outputs server files to "dist" relative to project root.
  // So, distPath should be /app/dist/public
  const distPath = path.resolve(baseDir, "dist", "public");
  log(`Serving static files from: ${distPath}`, "ServeStatic_CWD_Path");

  if (!fs.existsSync(distPath)) {
    const errorMsg = `CRITICAL_ERROR: Static files directory NOT FOUND at: ${distPath}. 'vite build' might not have run or output to the correct location.`;
    log(errorMsg, "ServeStatic_CWD_Error");
    // To help debug, list contents of expected parent directories
    try {
        const distDirContents = fs.readdirSync(path.resolve(baseDir, "dist"));
        log(`Contents of ${path.resolve(baseDir, "dist")}: ${distDirContents.join(', ')}`, "ServeStatic_CWD_Info");
    } catch (e:any) {
        log(`Could not read ${path.resolve(baseDir, "dist")}: ${e.message}`, "ServeStatic_CWD_Info");
    }
    throw new Error(errorMsg); // Important to stop if files aren't there
  } else {
    log(`Static files directory FOUND at: ${distPath}`, "ServeStatic_CWD_Success");
     try {
        const publicDirContents = fs.readdirSync(distPath);
        log(`Contents of ${distPath}: ${publicDirContents.join(', ')}`, "ServeStatic_CWD_Info");
    } catch (e:any) {
        log(`Could not read ${distPath}: ${e.message}`, "ServeStatic_CWD_Info");
    }
  }

  app.use(express.static(distPath));
  log("express.static middleware configured.", "ServeStatic_CWD");

  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    log(`Fallback: attempting to serve index.html from: ${indexPath}`, "ServeStatic_CWD_Fallback");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      log(`Fallback ERROR: index.html NOT FOUND at: ${indexPath}`, "ServeStatic_CWD_Fallback_Error");
      res.status(404).send(`index.html not found at ${indexPath}. Check build output.`);
    }
  });
  log("Static file serving configuration complete.", "ServeStatic_CWD");
}
