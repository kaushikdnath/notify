const pool = require("../db/pool");
const mqttClient = require("../mqtt/mqttClient");

async function processQueue() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT q.id, q.notification_target_id, nt.user_id,
              n.id as notification_id,
              n.title, n.message, n.payload_json
       FROM notification_queue q
       JOIN notification_targets nt ON q.notification_target_id = nt.id
       JOIN notifications n ON nt.notification_id = n.id
       WHERE q.status='PENDING'
       AND q.next_attempt_at <= NOW()
       LIMIT 20
       FOR UPDATE SKIP LOCKED`,
    );

    for (const row of rows) {
      const topic = `notify/user/${row.user_id}`;

      mqttClient.publish(topic, row.message, { qos: 1 });

      await connection.query(
        `UPDATE notification_targets
         SET status='SENT', last_attempt_at=NOW()
         WHERE id=?`,
        [row.notification_target_id],
      );

      await connection.query(`DELETE FROM notification_queue WHERE id=?`, [
        row.id,
      ]);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error("Worker error:", err);
  } finally {
    connection.release();
  }
}

function startWorker() {
  console.log("Queue worker started...");
  setInterval(processQueue, 5000);
}

module.exports = { startWorker };
