require("dotenv").config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
  },
  mysql: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  mqtt: {
    url: process.env.MQTT_BROKER_URL,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
  },
};
