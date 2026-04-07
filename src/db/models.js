const pool = require("./pool");
const { randomUUID } = require("crypto");

function sanitizeBind(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (Buffer.isBuffer && Buffer.isBuffer(v)) return v;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "bigint") return v;
  if (t === "boolean") return v ? 1 : 0;
  // objects -> JSON string
  try {
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

async function execQuery(conn, sql, params = []) {
  const safe = (params || []).map(sanitizeBind);
  return conn.query(sql, safe);
}

module.exports = {
  async insertNotification(obj) {
    const conn = await pool.getConnection();
    try {
      const sql = `INSERT INTO notifications
        (id, type, target, title, message_type, message, payload_json, created_by_service)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      await execQuery(conn, sql, [
        obj.id,
        obj.type,
        obj.target,
        obj.title || null,
        obj.message_type || obj.messageType || "mqtt",
        obj.message || null,
        obj.payload_json || obj.data || {},
        obj.created_by_service || "api-service",
      ]);
    } finally {
      conn.release();
    }
  },

  async insertNotificationTarget(obj) {
    const conn = await pool.getConnection();
    try {
      const sql = `INSERT INTO notification_targets
        (id, notification_id, user_id, email, mobile)
        VALUES (?, ?, ?, ?, ?)`;
      await execQuery(conn, sql, [
        obj.id,
        obj.notification_id,
        obj.user_id,
        obj.email || null,
        obj.mobile || null,
      ]);
    } finally {
      conn.release();
    }
  },

  async insertNotificationQueue(obj) {
    const conn = await pool.getConnection();
    try {
      const sql = `INSERT INTO notification_queue
        (id, notification_target_id, next_attempt_at)
        VALUES (?, ?, ${process.env.DB_TYPE === "mysql" ? "NOW()" : "datetime('now')"})`;
      await execQuery(conn, sql, [obj.id, obj.notification_target_id]);
    } finally {
      conn.release();
    }
  },

  async runRawQuery(sql, params = []) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await execQuery(conn, sql, params);
      return rows;
    } finally {
      conn.release();
    }
  },

  async selectPendingQueue(limit = 20) {
    const conn = await pool.getConnection();
    try {
      const sql =
        `SELECT q.id, q.notification_target_id,
              nt.user_id, nt.email, nt.mobile,
              n.id as notification_id,
              n.title, n.message, n.payload_json, n.message_type
       FROM notification_queue q
       JOIN notification_targets nt ON q.notification_target_id = nt.id
       JOIN notifications n ON nt.notification_id = n.id
       WHERE q.status='PENDING'
       AND q.next_attempt_at <= ${process.env.DB_TYPE === "mysql" ? "NOW()" : "datetime('now')"}
       LIMIT ? ` +
        (process.env.DB_TYPE === "mysql" ? " FOR UPDATE SKIP LOCKED" : "");

      const [rows] = await execQuery(conn, sql, [limit]);
      return rows;
    } finally {
      conn.release();
    }
  },

  async markTargetSent(id, externalId) {
    const conn = await pool.getConnection();
    try {
      const sql = `UPDATE notification_targets
           SET status='SENT', last_attempt_at=${process.env.DB_TYPE === "mysql" ? "NOW()" : "datetime('now')"}, external_id=?
           WHERE id=?`;
      await execQuery(conn, sql, [externalId, id]);
    } finally {
      conn.release();
    }
  },

  async deleteQueue(id) {
    const conn = await pool.getConnection();
    try {
      await execQuery(conn, `DELETE FROM notification_queue WHERE id=?`, [id]);
    } finally {
      conn.release();
    }
  },

  async incrementRetry(id) {
    const conn = await pool.getConnection();
    try {
      const sql = `UPDATE notification_targets
           SET retry_count = retry_count + 1,
               last_attempt_at = ${process.env.DB_TYPE === "mysql" ? "NOW()" : "datetime('now')"}
           WHERE id=?`;
      await execQuery(conn, sql, [id]);
    } finally {
      conn.release();
    }
  },

  async postponeQueue(id) {
    const conn = await pool.getConnection();
    try {
      const sql = `UPDATE notification_queue
           SET next_attempt_at = ${process.env.DB_TYPE === "mysql" ? "DATE_ADD(NOW(), INTERVAL 1 MINUTE)" : "datetime('now', '+1 minute')"}
           WHERE id=?`;
      await execQuery(conn, sql, [id]);
    } finally {
      conn.release();
    }
  },

  async updateStatusByExternalId(
    externalId,
    status,
    deliveredAt = null,
    readAt = null,
  ) {
    const conn = await pool.getConnection();
    try {
      await execQuery(
        conn,
        `UPDATE notification_targets
         SET status=?, delivered_at=?, read_at=?
         WHERE external_id=?`,
        [status, deliveredAt, readAt, externalId],
      );
    } finally {
      conn.release();
    }
  },

  async insertDeliveryLogByExternalId(externalId, eventType, metadata = null) {
    const conn = await pool.getConnection();
    try {
      // fetch matching notification_target ids
      const [targets] = await execQuery(
        conn,
        `SELECT id FROM notification_targets WHERE external_id=?`,
        [externalId],
      );

      for (const t of targets) {
        const id = randomUUID();
        await execQuery(
          conn,
          `INSERT INTO delivery_logs (id, notification_target_id, event_type, metadata) VALUES (?, ?, ?, ?)`,
          [id, t.id, eventType, metadata],
        );
      }
    } finally {
      conn.release();
    }
  },

  async updateStatusByNotificationAndUser(
    notificationId,
    userId,
    status,
    timeCol,
  ) {
    const conn = await pool.getConnection();
    try {
      const sql = `UPDATE notification_targets
       SET status='${status}', ${timeCol}=${process.env.DB_TYPE === "mysql" ? "NOW()" : "datetime('now')"}
       WHERE notification_id=? AND user_id=?`;
      await execQuery(conn, sql, [notificationId, userId]);

      // insert delivery_logs rows with UUID ids
      const [targets] = await execQuery(
        conn,
        `SELECT id FROM notification_targets WHERE notification_id=? AND user_id=?`,
        [notificationId, userId],
      );
      for (const t of targets) {
        await execQuery(
          conn,
          `INSERT INTO delivery_logs (id, notification_target_id, event_type) VALUES (?, ?, ?)`,
          [randomUUID(), t.id, status],
        );
      }
    } finally {
      conn.release();
    }
  },
};
