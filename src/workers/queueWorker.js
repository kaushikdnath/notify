const pool = require("../db/pool");
const mqttClient = require("../mqtt/mqttClient");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

async function processQueue() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT q.id, q.notification_target_id,
              nt.user_id, nt.email, nt.mobile,
              n.id as notification_id,
              n.title, n.message, n.payload_json, n.message_type
       FROM notification_queue q
       JOIN notification_targets nt ON q.notification_target_id = nt.id
       JOIN notifications n ON nt.notification_id = n.id
       WHERE q.status='PENDING'
       AND q.next_attempt_at <= NOW()
       LIMIT 20
       FOR UPDATE SKIP LOCKED`,
    );

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
        await connection.query(
          `UPDATE notification_targets
           SET status='SENT', last_attempt_at=NOW(),external_id=?
           WHERE id=?`,
          [response, row.notification_target_id],
        );

        await connection.query(`DELETE FROM notification_queue WHERE id=?`, [
          row.id,
        ]);
      } catch (err) {
        console.error("Send failed:", err.message);

        //  retry logic
        await connection.query(
          `UPDATE notification_targets
           SET retry_count = retry_count + 1,
               last_attempt_at = NOW()
           WHERE id=?`,
          [row.notification_target_id],
        );

        await connection.query(
          `UPDATE notification_queue
           SET next_attempt_at = DATE_ADD(NOW(), INTERVAL 1 MINUTE)
           WHERE id=?`,
          [row.id],
        );
      }
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error("Worker error:", err);
  } finally {
    connection.release();
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
