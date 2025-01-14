const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // ใช้ Service Account Key

// LINE API Config
const LINE_CHANNEL_ACCESS_TOKEN = 'ccLb2V+7NMLd1ZgPHHEz5NUfj9rkehvg3vGNEKPouliQFonC0HeweQf2+0Y/6U+07oR8cUVDFNC9iJD1ylMCf2JWP8keHohVzU+HlV9QV0F71oEYTGOYIT7nLMTrXsTDYU2DlfxJJn9dgY3QhIVJ+gdB04t89/1O/w1cDnyilFU=';
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile';

// Firebase Admin SDK Initialization
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),  // ใช้ Service Account Key
  databaseURL: 'https://line-bot-87bda-default-rtdb.asia-southeast1.firebasedatabase.app/' // Firebase Realtime Database URL ของคุณ
});

// Firebase Realtime Database reference
const db = admin.database();

// Express setup
const app = express();
app.use(bodyParser.json());

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  for (let event of events) {
    const userId = event.source.userId;
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text.toLowerCase().trim(); // Convert to lowercase and trim

      // Commands
      if (userMessage === "mypoints") {
        const message = await getUserPoints(userId);
        await replyToUser(event.replyToken, message);
      } else if (userMessage === "viewuid") {
        await replyToUser(event.replyToken, `Your UserID is: ${userId}`);
      } else if (userMessage.startsWith("addpoints")) {
        if (await hasBypass(userId)) {
          const points = parseInt(userMessage.split(" ")[1]);
          if (!isNaN(points)) {
            await addPoints(userId, points);
            await replyToUser(event.replyToken, `เพิ่ม ${points} คะแนนให้กับบัญชีของคุณ!`);
          } else {
            await replyToUser(event.replyToken, "กรุณาระบุจำนวนคะแนนที่ถูกต้องเพื่อเพิ่ม.");
          }
        } else {
          await replyToUser(event.replyToken, "คุณไม่มีสิทธิ์ในการเพิ่มคะแนน.");
        }
      } else if (userMessage.startsWith("removepoints")) {
        if (await hasBypass(userId)) {
          const points = parseInt(userMessage.split(" ")[1]);
          if (!isNaN(points)) {
            await removePoints(userId, points);
            await replyToUser(event.replyToken, `ลบ ${points} คะแนนจากบัญชีของคุณ.`);
          } else {
            await replyToUser(event.replyToken, "กรุณาระบุจำนวนคะแนนที่ถูกต้องเพื่อลบ.");
          }
        } else {
          await replyToUser(event.replyToken, "คุณไม่มีสิทธิ์ในการลบคะแนน.");
        }
      } else if (userMessage.startsWith("bypass")) {
        const secretCode = userMessage.split(" ")[1];
        if (secretCode === "byp@ss") {
          await grantBypass(userId);
          await replyToUser(event.replyToken, "คุณได้รับสิทธิ์ในการข้ามการตรวจสอบ.");
        } else {
          await replyToUser(event.replyToken, "รหัสลับไม่ถูกต้อง. การเข้าถึงถูกปฏิเสธ.");
        }
      } else {
        await replyToUser(event.replyToken, "คำสั่งที่มีอยู่: 'mypoints', 'viewuid', 'addpoints <number>', 'removepoints <number>'");
      }
    }
  }
  res.status(200).send('OK');
});

// Add points to user
async function addPoints(userId, points) {
  const ref = db.ref(`users/${userId}`);
  const userSnapshot = await ref.once('value');
  let user = userSnapshot.val();

  if (!user) {
    const userName = await getUserName(userId);
    user = { name: userName, points: 0 };
    await ref.set(user);
  }

  user.points += points;
  await ref.update({ points: user.points });
}

// Remove points from user
async function removePoints(userId, points) {
  const ref = db.ref(`users/${userId}`);
  const userSnapshot = await ref.once('value');
  let user = userSnapshot.val();

  if (user) {
    user.points = Math.max(0, user.points - points);
    await ref.update({ points: user.points });
  }
}

// Grant bypass permission
async function grantBypass(userId) {
  const ref = db.ref('bypass');
  const bypassSnapshot = await ref.once('value');
  let bypassList = bypassSnapshot.val() || [];

  if (!bypassList.includes(userId)) {
    bypassList.push(userId);
    await ref.set(bypassList);
  }
}

// Check if user has bypass access
async function hasBypass(userId) {
  const ref = db.ref('bypass');
  const bypassSnapshot = await ref.once('value');
  const bypassList = bypassSnapshot.val() || [];
  return bypassList.includes(userId);
}

// Fetch user's display name
async function getUserName(userId) {
  try {
    const response = await axios.get(`${LINE_PROFILE_API}/${userId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    return response.data.displayName;
  } catch (error) {
    console.error('Error fetching user profile:', error.response?.data || error.message);
    return 'Unknown';
  }
}

// Get user points
async function getUserPoints(userId) {
  const ref = db.ref(`users/${userId}`);
  const userSnapshot = await ref.once('value');
  const user = userSnapshot.val();
  if (user) {
    return `คุณมีคะแนนทั้งหมด ${user.points} คะแนน (ชื่อ: ${user.name}).`;
  }
  return "คุณไม่มีคะแนนในระบบ.";
}

// Reply to user
async function replyToUser(replyToken, message) {
  try {
    await axios.post(
      LINE_REPLY_API,
      {
        replyToken: replyToken,
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
  } catch (error) {
    console.error('Error replying to user:', error.response?.data || error.message);
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
