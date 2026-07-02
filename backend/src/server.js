const { APP_NAME, loadState } = require("./core/seapediaCore");
const { createExpressApp } = require("./app");

function startServer({
  port = Number(process.env.SEAPEDIA_PORT || process.env.PORT || 8000),
  host = process.env.SEAPEDIA_HOST || "0.0.0.0",
} = {}) {
  const state = loadState();
  const app = createExpressApp(state);

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`${APP_NAME} Express.js backend running at http://${host}:${server.address().port}`);
      resolve({ server, app, state });
    });
  });
}

module.exports = { startServer };
