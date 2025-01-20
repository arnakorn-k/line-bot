import axios from 'axios';
import * as admin from 'firebase-admin';
import { config } from 'dotenv';

// โหลดไฟล์ .env
config();

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile';
const firebase = admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.DATABASE_URL,
});

const db = firebase.database();

// Webhook handler
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const events = req.body.events;

    for (let event of events) {
      const userId = event.source.userId;

      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.toLowerCase().trim();

        // ตัวอย่างการตอบคำถามเมื่อผู้ใช้พิมพ์ "mypoints"
        if (userMessage === "mypoints") {
          const message = await getUserPoints(userId);
          await replyToUser(event.replyToken, message);
        }
      }
    }

    res.status(200).send('OK');
  } else {
    res.status(405).send('Method Not Allowed');
  }
}

// ฟังก์ชันช่วยเหลือ - เพิ่มข้อมูลผู้ใช้ใน Firebase
async function addUserData(userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (!userData) {
    const userName = await getUserName(userId);
    userRef.set({ name: userName, userId: userId, points: 0 });
  }
}

// ฟังก์ชันดึงคะแนนของผู้ใช้
async function getUserPoints(userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (userData) {
    return `คุณมีคะแนนทั้งหมด ${userData.points} คะแนน (ชื่อ: ${userData.name}).`;
  }
  return "คุณไม่มีคะแนนในระบบ.";
}

// ฟังก์ชันดึงชื่อผู้ใช้จาก LINE API
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
    return 'ไม่ทราบชื่อ';
  }
}

// ฟังก์ชันตอบกลับผู้ใช้
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
