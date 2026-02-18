require("dotenv").config();
const { startWorker } = require("./workers/queueWorker");

startWorker();
