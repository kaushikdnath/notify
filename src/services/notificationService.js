const pool = require("../db/pool");
const { randomUUID } = require("crypto");
const { getTypeConfig } = require("./targetResolver");

async function createNotification(payload) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const notificationUUID = randomUUID();

    await connection.query(
      `INSERT INTO notifications
      (id, type, target, title, message, payload_json, created_by_service)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        notificationUUID,
        payload.type,
        payload.target || null,
        payload.title,
        payload.message,
        JSON.stringify(payload.data || {}),
        "api-service",
      ],
    );

    let users = [];

    if (payload.type === "USER") {
      users = [payload.target];
    } else {
      const typeConfig = getTypeConfig(payload.type);

      if (!typeConfig) {
        throw new Error(`Unsupported notification type: ${payload.type}`);
      }

      let queryParams = [];

      if (typeConfig.param_source === "target") {
        queryParams.push(payload.target);
      }

      const [rows] = await connection.query(typeConfig.query, queryParams);

      users = rows.map((r) => r.user_id);
    }
    // Insert targets + queue
    for (const userId of users) {
      const targetUUID = randomUUID();

      await connection.query(
        `INSERT INTO notification_targets
        (id, notification_id, user_id)
        VALUES (?, ?, ?)`,
        [targetUUID, notificationUUID, userId],
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

module.exports = { createNotification };
