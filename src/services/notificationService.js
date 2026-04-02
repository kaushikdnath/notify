const pool = require("../db/pool");
const { randomUUID } = require("crypto");
const { getTargetsConfig } = require("./targetResolver");

async function createNotification(payload) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const notificationUUID = randomUUID();

    await connection.query(
      `INSERT INTO notifications
      (id, type, target, title, message_type, message, payload_json, created_by_service)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notificationUUID,
        payload.type,
        payload.target,
        payload.title,
        payload.messageType || "mqtt",
        payload.message,
        JSON.stringify(payload.data || {}),
        "api-service",
      ],
    );

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
        queryParams.push(payload.payload_json);
      }
      [users] = await connection.query(targetConfig.query, queryParams); // use Dizzle here to convert callback-based query to promise-based

      // users = rows;
    }
    // Insert targets + queue
    for (const user of users) {
      const targetUUID = randomUUID();

      await connection.query(
        `INSERT INTO notification_targets
        (id, notification_id, user_id,email,mobile)
        VALUES (?, ?, ?, ?, ?)`,
        [
          targetUUID,
          notificationUUID,
          user.user_id,
          user.email || null,
          user.mobile || null,
        ],
      );

      const queueUUID = randomUUID();

      await connection.query(
        `INSERT INTO notification_queue
         (id, notification_target_id, next_attempt_at)
         VALUES (?, ?, NOW())`,
        [queueUUID, targetUUID],
      );
    }

    await connection.commit();

    return notificationUUID;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
async function emailDeliveryUpdate(event) {
  const emailId = event.data?.email_id;

  if (!emailId) return { ok: true };

  const connection = await pool.getConnection();
  console.info("Event received:", event);
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
          delivery_at: event.data?.delivered_at || new Date().toISOString(),
        });
        break;
      case "email.opened":
        deliveryStatus = "OPENED";
        read_at = new Date(event.data?.opened_at);
        metaData = JSON.stringify({
          read_at: event.data?.opened_at || new Date().toISOString(),
        });
        break;
      case "email.clicked":
        deliveryStatus = "CLICKED";
        metaData = JSON.stringify({
          clicked_at: event.data?.clicked_at || new Date().toISOString(),
        });
        break;
    }
    await connection.query(
      `UPDATE notification_targets
         SET status=?,
             delivered_at=?,
             read_at=?,
         WHERE external_id=?`,
      [deliveryStatus, delivery_at, read_at, emailId],
    );
    await connection.query(
      `INSERT INTO delivery_logs
     (notification_target_id, event_type, metadata)
     SELECT id, ?, ?
     FROM notification_targets
     WHERE external_id=?`,
      [deliveryStatus, metaData, emailId],
    );
  } finally {
    connection.release();
  }
}
module.exports = { createNotification, emailDeliveryUpdate };
