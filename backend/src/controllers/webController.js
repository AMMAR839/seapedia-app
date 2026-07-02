const { docsHtml, send, serveStatic } = require("../core/seapediaCore");

function docsController(req, res) {
  send(res, 200, docsHtml());
}

function spaController(req, res, next) {
  try {
    const pathname = decodeURIComponent(new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`).pathname);
    return serveStatic(req, res, pathname);
  } catch (error) {
    return next(error);
  }
}

module.exports = { docsController, spaController };
