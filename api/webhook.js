const axios = require('axios');
const admin = require('firebase-admin');

// LINE API Config
const LINE_CHANNEL_ACCESS_TOKEN = 'ccLb2V+7NMLd1ZgPHHEz5NUfj9rkehvg3vGNEKPouliQFonC0HeweQf2+0Y/6U+07oR8cUVDFNC9iJD1ylMCf2JWP8keHohVzU+HlV9QV0F71oEYTGOYIT7nLMTrXsTDYU2DlfxJJn9dgY3QhIVJ+gdB04t89/1O/w1cDnyilFU=';
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile';

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-credentials.json')),
  databaseURL: 'https://your-project-id.firebaseio.com' // เปลี่ยนเป็น URL ของ Firebase project ของคุณ
});

// Get a reference to Firestore
const db = admin.firestore();

// Webhook handler
module.exports = async (req, res) => {
  try {
    const events = req.body.events;
    if (!events) {
      res.status(400).send('No events data');
      return;
    }

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
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Add points to user
async function addPoints(userId, points) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const userName = await getUserName(userId);
      await userRef.set({
        name: userName,
        points: points,
      });
    } else {
      const currentPoints = userDoc.data().points || 0;
      await userRef.update({
        points: currentPoints + points,
      });
    }
  } catch (error) {
    console.error('Error adding points:', error);
  }
}

// Remove points from user
async function removePoints(userId, points) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const currentPoints = userDoc.data().points || 0;
      await userRef.update({
        points: Math.max(0, currentPoints - points),
      });
    }
  } catch (error) {
    console.error('Error removing points:', error);
  }
}

// Grant bypass permission
async function grantBypass(userId) {
  try {
    const bypassRef = db.collection('bypass').doc(userId);
    const bypassDoc = await bypassRef.get();

    if (!bypassDoc.exists) {
      await bypassRef.set({ userId });
    }
  } catch (error) {
    console.error('Error granting bypass:', error);
  }
}

// Check if user has bypass access
async function hasBypass(userId) {
  const bypassRef = db.collection('bypass').doc(userId);
  const bypassDoc = await bypassRef.get();
  return bypassDoc.exists;
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
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    return `คุณมีคะแนนทั้งหมด ${userDoc.data().points} คะแนน (ชื่อ: ${userDoc.data().name}).`;
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
