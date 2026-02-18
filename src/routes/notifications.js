const notificationService = require("../services/notificationService");

async function routes(fastify) {
  fastify.post("/notify", async (request, reply) => {
    const id = await notificationService.createNotification(request.body);
    return { success: true, notification_id: id };
  });
}

module.exports = routes;
