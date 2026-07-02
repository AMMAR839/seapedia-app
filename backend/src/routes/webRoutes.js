const express = require("express");

const { docsController, spaController } = require("../controllers/webController");

function createWebRoutes() {
  const router = express.Router();

  router.get("/docs", docsController);

  return router;
}

function frontendFallback(req, res, next) {
  if (!["GET", "HEAD"].includes(req.method)) return next();
  const pathname = decodeURIComponent(new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`).pathname);
  if (pathname.startsWith("/api/") || pathname === "/health" || pathname === "/openapi.json" || pathname === "/docs") {
    return next();
  }
  return spaController(req, res, next);
}

module.exports = { createWebRoutes, frontendFallback };
