const { createExpressApp } = require("./backend/src/app");
const { createHandler, loadState, seedState } = require("./backend/src/core/seapediaCore");
const { startServer } = require("./backend/src/server");

if (require.main === module) {
  startServer();
}

module.exports = {
  createExpressApp,
  createHandler,
  loadState,
  seedState,
  startServer,
};
