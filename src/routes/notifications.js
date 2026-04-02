const notificationService = require("../services/notificationService");

async function routes(fastify) {
  fastify.post("/notify", async (request, reply) => {
    const id = await notificationService.createNotification(request.body);
    return { success: true, notification_id: id };
  });

  fastify.post("/webhook/email/delivery-update", async (request, reply) => {
    const event = request.body;
    console.log("Resend webhook:", event);
    await notificationService.emailDeliveryUpdate(event);
    return { ok: true };
  });
}

module.exports = routes;
