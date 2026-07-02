const { apiHandler } = require("../core/seapediaCore");

function createApiController(state) {
  return async function apiController(req, res, next) {
    try {
      const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(url.pathname);
      await apiHandler(req, res, state, pathname, url);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createApiController };
