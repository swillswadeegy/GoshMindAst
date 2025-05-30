// server/vite.ts - MINIMAL FOR PRODUCTION TEST

import express, { type Express } from "express";
import fs from "fs";
import path from "path";
// We are removing createServer as createViteServer, createLogger, viteConfig, nanoid, fileURLToPath
// as they are primarily for setupVite or problematic path resolutions.

// Keep your log function
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// GUTTED setupVite - it does nothing now to avoid any path errors from its body
export async function setupVite(app: Express, server: any) { // 'any' for server type to avoid http import
  log("DEV MODE: setupVite called - BUT IT IS CURRENTLY A NO-OP in this test version.", "ViteSetup_Minimal");
  // Intentionally empty or just logging for this test
}

// ROBUST serveStatic using process.cwd()
export function serveStatic(app: Express) {
  log("Attempting to configure static files (Minimal serveStatic using process.cwd).", "ServeStatic_Minimal_CWD");

  const baseDir = process.cwd(); // Should be /app on Railway
  log(`Base directory (process.cwd()): ${baseDir}`, "ServeStatic_Minimal_CWD_Path");

  // Path to the 'public' folder inside 'dist' (created by 'vite build')
  const publicAssetsPath = path.resolve(baseDir, "dist", "public");
  log(`Static files expected at: ${publicAssetsPath}`, "ServeStatic_Minimal_CWD_Path");

  if (!fs.existsSync(publicAssetsPath)) {
    const errorMsg = `CRITICAL_ERROR: Static files directory NOT FOUND at: ${publicAssetsPath}. 'vite build' must output to 'dist/public'.`;
    log(errorMsg, "ServeStatic_Minimal_CWD_Error");
    // Log contents of parent 'dist' directory if it exists
    const distDir = path.resolve(baseDir, "dist");
    if (fs.existsSync(distDir)) {
        try {
            const distDirContents = fs.readdirSync(distDir);
            log(`Contents of ${distDir}: ${distDirContents.join(', ')}`, "ServeStatic_Minimal_CWD_Info");
        } catch (e:any) {
            log(`Could not read ${distDir}: ${e.message}`, "ServeStatic_Minimal_CWD_Info");
        }
    } else {
        log(`Parent directory ${distDir} also NOT FOUND.`, "ServeStatic_Minimal_CWD_Error");
    }
    // For this test, let's not throw an error here yet, to see if the server can start
    // and serve 404s from the fallback. This helps confirm the rest of the Express app starts.
    // throw new Error(errorMsg);
    log("Continuing server startup despite missing static files directory, will rely on fallback.", "ServeStatic_Minimal_CWD_Warning");
  } else {
    log(`Static files directory FOUND at: ${publicAssetsPath}`, "ServeStatic_Minimal_CWD_Success");
    app.use(express.static(publicAssetsPath));
    log("express.static middleware configured.", "ServeStatic_Minimal_CWD");
  }

  // Fallback for SPA
  app.use("*", (req, res) => {
    const indexPath = path.resolve(publicAssetsPath, "index.html");
    log(`Fallback: Request for ${req.originalUrl}, attempting to serve: ${indexPath}`, "ServeStatic_Minimal_CWD_Fallback");
    if (fs.existsSync(publicAssetsPath) && fs.existsSync(indexPath)) { // Check publicAssetsPath again
      res.sendFile(indexPath);
    } else {
      log(`Fallback ERROR: index.html (or its directory ${publicAssetsPath}) NOT FOUND at: ${indexPath}`, "ServeStatic_Minimal_CWD_Fallback_Error");
      res.status(404).send(`Application not found. Missing: ${indexPath}`);
    }
  });
  log("Static file serving configuration complete (Minimal serveStatic).", "ServeStatic_Minimal_CWD");
}
