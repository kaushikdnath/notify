const mqtt = require("mqtt");
const pool = require("../db/pool");
const config = require("../config");
const { randomUUID } = require("crypto");

const client = mqtt.connect(config.mqtt.url, {
  clientId:
    process.env.MQTT_CLIENT_ID || `notification-service-${randomUUID()}`,
  username: config.mqtt.username,
  password: config.mqtt.password,
  clean: true,
  reconnectPeriod: 5000,
});

client.on("error", (err) => {
  console.error("MQTT error:", err);
});
client.on("connect", () => {
  console.log("MQTT connected");
  client.subscribe(["notify/ack", "notify/read"], { qos: 1 }, (err) => {
    if (err) {
      console.error("Subscription error:", err);
    } else {
      console.log("Subscribed to ack/read topics");
    }
  });
});
client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    if (topic === "notify/ack") {
      await handleAck(payload);
    }

    if (topic === "notify/read") {
      await handleRead(payload);
    }
  } catch (err) {
    console.error("MQTT message handling error:", err);
  }
});

async function handleAck(payload) {
  const connection = await pool.getConnection();

  try {
    await connection.query(
      `UPDATE notification_targets
       SET status='DELIVERED',
           delivered_at=NOW()
       WHERE notification_id=? AND user_id=?`,
      [payload.notification_id, payload.user_id],
    );

    await connection.query(
      `INSERT INTO delivery_logs
       (notification_target_id, event_type)
       SELECT id, 'DELIVERED'
       FROM notification_targets
       WHERE notification_id=? AND user_id=?`,
      [payload.notification_id, payload.user_id],
    );
  } finally {
    connection.release();
  }
}
async function handleRead(payload) {
  const connection = await pool.getConnection();

  try {
    await connection.query(
      `UPDATE notification_targets
       SET status='READ',
           read_at=NOW()
       WHERE notification_id=? AND user_id=?`,
      [payload.notification_id, payload.user_id],
    );

    await connection.query(
      `INSERT INTO delivery_logs
       (notification_target_id, event_type)
       SELECT id, 'READ'
       FROM notification_targets
       WHERE notification_id=? AND user_id=?`,
      [payload.notification_id, payload.user_id],
    );
  } finally {
    connection.release();
  }
}

module.exports = client;
