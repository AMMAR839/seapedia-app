const express = require("express");

const { loadState } = require("./core/seapediaCore");
const { createApiRoutes } = require("./routes/apiRoutes");
const { createWebRoutes, frontendFallback } = require("./routes/webRoutes");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { securityHeaders } = require("./middleware/securityHeaders");

function createExpressApp(state = loadState()) {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    return next();
  });
  app.use(express.json({ limit: "1mb" }));

  app.use(createApiRoutes(state));
  app.use(createWebRoutes());
  app.use(frontendFallback);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createExpressApp };
