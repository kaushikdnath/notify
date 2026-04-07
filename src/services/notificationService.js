// const pool = require("../db/pool");
const models = require("../db/models");
const { randomUUID } = require("crypto");
const { getTargetsConfig } = require("./targetResolver");

async function createNotification(payload) {
  const notificationUUID = randomUUID();

  // insert notification
  await models.insertNotification({
    id: notificationUUID,
    type: payload.type,
    target: payload.target,
    title: payload.title,
    messageType: payload.messageType || "mqtt",
    message: payload.message,
    data: payload.data || {},
    created_by_service: "api-service",
  });

  let users = [];

  if (payload.type === "USER") {
    users = [payload.target];
  } else if (payload.type === "GROUP") {
    const targetConfig = getTargetsConfig(payload.target);
    if (!targetConfig) {
      throw new Error(`Unsupported notification type: ${payload.target}`);
    }
    console.info("Target config for group:", targetConfig);

    let queryParams = [];
    if (targetConfig.param_source === "payload_json") {
      const val = payload.payload_json;
      queryParams.push(typeof val === "string" ? val : JSON.stringify(val));
    }

    users = await models.runRawQuery(targetConfig.query, queryParams);
  }

  for (const user of users) {
    const targetUUID = randomUUID();

    await models.insertNotificationTarget({
      id: targetUUID,
      notification_id: notificationUUID,
      user_id: user.user_id,
      email: user.email || null,
      mobile: user.mobile || null,
    });

    const queueUUID = randomUUID();
    await models.insertNotificationQueue({
      id: queueUUID,
      notification_target_id: targetUUID,
    });
  }

  return notificationUUID;
}
async function emailDeliveryUpdate(event) {
  const emailId = event.data?.email_id;

  if (!emailId) return { ok: true };

  console.info("Event received:", event);
  // update target by external id + insert log
  try {
    var deliveryStatus = "SENT";
    var metaData = null;
    var delivery_at = null;
    var read_at = null;
    switch (event.type) {
      case "email.bounced":
        deliveryStatus = "FAILED";
        metaData = JSON.stringify({
          reason: event.data?.reason,
          bounce_type: event.data?.bounce_type,
        });
        break;
      case "email.complained":
        deliveryStatus = "FAILED";
        metaData = JSON.stringify({
          reason: event.data?.reason,
          bounce_type: event.data?.bounce_type,
        });
        break;
      case "email.delivered":
        deliveryStatus = "DELIVERED";
        delivery_at = new Date(event.data?.delivered_at);
        metaData = JSON.stringify({
          delivery_at:
            event.data?.delivered_at || process.env.DB_TYPE === "mysql"
              ? "NOW()"
              : "datetime('now')",
        });
        break;
      case "email.opened":
        deliveryStatus = "OPENED";
        read_at = new Date(event.data?.opened_at);
        metaData = JSON.stringify({
          read_at:
            event.data?.opened_at || process.env.DB_TYPE === "mysql"
              ? "NOW()"
              : "datetime('now')",
        });
        break;
      case "email.clicked":
        deliveryStatus = "CLICKED";
        metaData = JSON.stringify({
          clicked_at:
            event.data?.clicked_at || process.env.DB_TYPE === "mysql"
              ? "NOW()"
              : "datetime('now')",
        });
        break;
    }
    await models.updateStatusByExternalId(
      emailId,
      deliveryStatus,
      delivery_at,
      read_at,
    );
    await models.insertDeliveryLogByExternalId(
      emailId,
      deliveryStatus,
      metaData,
    );
  } catch (err) {
    throw err;
  }
}
module.exports = { createNotification, emailDeliveryUpdate };
