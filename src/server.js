const fastify = require("fastify")({ logger: true });
const config = require("./config");
const routes = require("./routes/notifications");

fastify.register(routes);

fastify.listen({ port: config.server.port }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server running on port ${config.server.port}`);
});
