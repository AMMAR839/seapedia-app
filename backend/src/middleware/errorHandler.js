function notFound(req, res) {
  res.status(404).json({ detail: "Endpoint tidak ditemukan" });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ detail: "JSON tidak valid" });
  }
  return res.status(error.status || 500).json({
    detail: error.status ? error.message : "Terjadi kesalahan server",
  });
}

module.exports = { errorHandler, notFound };
