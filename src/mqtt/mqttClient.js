const mqtt = require("mqtt");
// const pool = require("../db/pool");
const models = require("../db/models");
// const config = require("../config");
const { randomUUID } = require("crypto");

function buildBrokerUrl() {
  const type = process.env.BROKER_TYPE || "tcp";

  const host = process.env.MQTT_HOST;
  const port = process.env.MQTT_PORT;
  const useTLS = process.env.MQTT_USE_TLS === "true";

  if (type === "tcp") {
    return `${useTLS ? "mqtts" : "mqtt"}://${host}:${port}`;
  }

  if (type === "ws") {
    const path = process.env.MQTT_WS_PATH || "/mqtt";
    return `${useTLS ? "wss" : "ws"}://${host}:${port}${path}`;
  }

  throw new Error("Invalid BROKER_TYPE. Use 'tcp' or 'ws'");
}

const client = mqtt.connect(buildBrokerUrl(), {
  clientId:
    process.env.MQTT_CLIENT_ID || `notification-service-${randomUUID()}`,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
  clean: true,
  reconnectPeriod: 5000,
  keepalive: 60,
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
client.on("reconnect", () => {
  console.log("MQTT reconnecting...");
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

module.exports = client;

///////////////////////////////////////////////////////////////
async function handleAck(payload) {
  try {
    await models.updateStatusByNotificationAndUser(
      payload.notification_id,
      payload.user_id,
      "DELIVERED",
      "delivered_at",
    );
  } catch (err) {
    console.error("handleAck error:", err);
  }
}
async function handleRead(payload) {
  try {
    await models.updateStatusByNotificationAndUser(
      payload.notification_id,
      payload.user_id,
      "READ",
      "read_at",
    );
  } catch (err) {
    console.error("handleRead error:", err);
  }
}
