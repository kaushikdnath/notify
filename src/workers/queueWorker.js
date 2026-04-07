const pool = require("../db/pool");
const mqttClient = require("../mqtt/mqttClient");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

async function processQueue() {
  // Use model layer to handle DB operations
  const models = require("../db/models");

  try {
    const rows = await models.selectPendingQueue(20);

    for (const row of rows) {
      try {
        console.log("Processing:", row.notification_id, row.message_type);
        var response = 0;
        if (row.message_type === "mqtt") {
          response = await sendMQTT(row);
        } else if (row.message_type === "email") {
          response = await sendEmail(row);
        } else if (row.message_type === "sms") {
          response = await sendSMS(row);
        }

        await models.markTargetSent(row.notification_target_id, response);
        await models.deleteQueue(row.id);
      } catch (err) {
        console.error("Send failed:", err.message);

        await models.incrementRetry(row.notification_target_id);
        await models.postponeQueue(row.id);
      }
    }
  } catch (err) {
    console.error("Worker error:", err);
  }
}

async function sendMQTT(row) {
  const topic = `notify/user/${row.user_id}`;

  mqttClient.publish(
    topic,
    JSON.stringify({
      id: row.notification_id,
      title: row.title,
      message: row.message,
      data: row.payload_json,
    }),
    { qos: 1 },
  );
  return null;
}

async function sendEmail(row) {
  if (!row.email) {
    throw new Error("Email missing");
  }

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: row.email,
    subject: row.title,
    html: `<p>${row.message}</p>`,
  });

  if (error) {
    throw new Error(error.message);
  } else {
    console.log("Email sent successfully to", data);
  }
  return data?.id;
}

// async function sendSMS(row) {
//   if (!row.mobile) {
//     throw new Error("Mobile number missing");
//   }

//   await axios.post(SMS_API_URL, {
//     messageBody: row.message,
//     receivingMobileNo: row.mobile,
//     params: {},
//     messageid: row.notification_id,
//   });
// }

function startWorker() {
  console.log("Queue worker started...");
  setInterval(processQueue, 3000);
}

module.exports = { startWorker };
