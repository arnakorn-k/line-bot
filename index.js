require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');
const qs = require('querystring');
const path = require('path');

// Firebase Realtime Database URL
const databaseURL = process.env.DATABASE_URL;

// Google Cloud Service Account Credentials
const serviceAccount = {
  type: process.env.GC_TYPE,
  project_id: process.env.GC_PROJECT_ID,
  private_key_id: process.env.GC_PRIVATE_KEY_ID,
  private_key: process.env.GC_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GC_CLIENT_EMAIL,
  client_id: process.env.GC_CLIENT_ID,
  auth_uri: process.env.GC_AUTH_URI,
  token_uri: process.env.GC_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.GC_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.GC_CLIENT_X509_CERT_URL,
};

// LINE API Config
const LINE_CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile';

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL,
});

const db = admin.database();

// Express setup
const app = express();
app.use(bodyParser.json());

// ให้ Express เสิร์ฟไฟล์ static จาก GreenPointSystem
app.use('/u67319010043/GreenPointSystem', express.static(
  path.join(__dirname, '../u67319010043/GreenPointSystem')
));

// LINE Login Callback
app.get('/line-callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('ไม่พบ code จาก LINE');

  try {
    const client_id = '2007575934'; // Channel ID จาก LINE Login Channel
    const client_secret = '8068bab139aa738d240813377dc97121'; // Channel Secret จาก LINE Login Channel
    const redirect_uri = 'https://line-bot-navy.vercel.app/line-callback'; // ต้องตรงกับที่ตั้งไว้ใน LINE Developers Console

    const tokenRes = await axios.post('https://api.line.me/oauth2/v2.1/token', qs.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      client_id,
      client_secret
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const access_token = tokenRes.data.access_token;

    // ดึง profile จาก LINE Login
    const profileRes = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const { userId } = profileRes.data;

    // Redirect ไปหน้า user-ui.html ที่ deploy บน Vercel พร้อมส่ง lineUserId ไปด้วย
    res.redirect(`https://green-point-system.vercel.app/user-ui.html?lineUserId=${userId}`);
  } catch (err) {
    if (err.response && err.response.data) {
      res.send('เกิดข้อผิดพลาด: ' + JSON.stringify(err.response.data));
    } else {
      res.send('เกิดข้อผิดพลาด: ' + err.message);
    }
  }
});

// Webhook สำหรับ LINE Messaging API
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const code = event.message.text.trim();
      const userId = event.source.userId;

      // อ่านข้อมูลคูปอง
      const couponRef = db.ref('coupons/' + code);
      const couponSnap = await couponRef.once('value');
      const coupon = couponSnap.val();

      if (!coupon) {
        await replyToUser(event.replyToken, `ไม่พบคูปอง "${code}"`);
        return;
      }

      // ตรวจสอบว่าผู้ใช้เคยใช้คูปองนี้หรือยัง
      if (coupon.users && coupon.users[userId]) {
        await replyToUser(event.replyToken, `คุณได้ใช้คูปอง "${code}" ไปแล้ว`);
        return;
      }

      // ตรวจสอบจำนวนครั้งที่ใช้
      if ((coupon.used || 0) >= coupon.limit) {
        await replyToUser(event.replyToken, `คูปอง "${code}" ถูกใช้ครบจำนวนครั้งแล้ว`);
        return;
      }

      // ใช้คูปองได้
      await updateUserPoints(userId, coupon.points, `รับแต้มจากคูปอง ${code}`);
      await couponRef.child('used').set((coupon.used || 0) + 1);
      await couponRef.child('users/' + userId).set(true);
      await replyToUser(event.replyToken, `รับแต้ม ${coupon.points} แต้ม จากคูปอง "${code}" สำเร็จ!`);
      return;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const msg = event.message.text.trim();
      const userId = event.source.userId;

      // ตรวจสอบคูปอง
      const couponSnap = await db.ref('coupons/' + msg).once('value');
      const coupon = couponSnap.val();
      if (coupon && !coupon.used) {
        // เพิ่มแต้มให้ user
        await updateUserPoints(userId, coupon.points, `รับแต้มจากคูปอง ${msg}`);
        // อัปเดตสถานะคูปอง
        await db.ref('coupons/' + msg + '/used').set(true);
        await replyToUser(event.replyToken, `รับแต้ม ${coupon.points} แต้ม จากคูปอง "${msg}" สำเร็จ!`);
        return;
      } else if (coupon && coupon.used) {
        await replyToUser(event.replyToken, `คูปอง "${msg}" ถูกใช้ไปแล้ว`);
        return;
      }

      // เพิ่มแต้มด้วย !@ จำนวน
      if (/^!@\s*-?\d+$/.test(msg)) {
        const amount = parseInt(msg.replace('!@', '').trim(), 10);
        if (!isNaN(amount)) {
          await updateUserPoints(userId, amount, `เพิ่มแต้มโดยคำสั่ง !@ ${amount}`);
          await replyToUser(replyToken, `เพิ่มแต้ม ${amount > 0 ? '+' : ''}${amount} สำเร็จ`);
        } else {
          await replyToUser(replyToken, 'รูปแบบคำสั่งไม่ถูกต้อง');
        }
        continue;
      }

      // ดึงข้อมูลผู้ใช้จาก Firebase
      const userRef = db.ref('users/' + userId);
      const userSnapshot = await userRef.once('value');
      const userData = userSnapshot.val();
      const userName = userData ? userData.name : 'ไม่ทราบชื่อ';

      if (event.type === 'message') {
        if (event.message.type === 'text') {
          console.log(`User ${userName} (ID: ${userId}) sent a text message:`, event.message.text);
        } else if (event.message.type === 'sticker') {
          console.log(`User ${userName} (ID: ${userId}) sent a sticker:`, event.message.stickerId);
        }

        // เพิ่มข้อมูลผู้ใช้ทุกครั้งที่พิมพ์หรือส่งสติกเกอร์
        await addUserData(userId);

        // ตรวจสอบข้อความจากผู้ใช้
        if (event.message.type === 'text') {
          const userMessage = event.message.text.toLowerCase().trim();

          if (userMessage === 'linkweb') {
            const webUrl = `https://green-point-system.vercel.app/user-ui.html?lineUserId=${userId}`;
            const buttonMessage = {
              type: "template",
              altText: "กดปุ่มนี้เพื่อเชื่อมบัญชี LINE กับเว็บ",
              template: {
                type: "buttons",
                text: "กดปุ่มด้านล่างเพื่อเชื่อมบัญชี LINE กับเว็บ",
                actions: [
                  {
                    type: "uri",
                    label: "เชื่อมบัญชี",
                    uri: webUrl
                  }
                ]
              }
            };
            await replyWithFlexMessage(event.replyToken, buttonMessage);
            continue;
          }

          if (userMessage === 'mypoints') {
            await handleMyPoints(event.replyToken, userId);
            continue;
          }

          if (userMessage === 'mypoints > ดูรายละเอียด') {
            await handleUserDetails(event.replyToken, userId);
            continue;
          }

          if (userMessage === 'myprofile') {
            await handleUserProfile(event.replyToken, userId);
            continue;
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

// ฟังก์ชันเพิ่มข้อมูลผู้ใช้ใน Firebase
async function addUserData(userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (!userData) {
    const userName = await getUserName(userId);
    await userRef.set({
      name: userName,
      userId: userId,
      points: 0, // ไม่ให้แต้มเริ่มต้น
      createdAt: new Date().toISOString()
    });
    console.log(`สร้างข้อมูลใหม่สำหรับผู้ใช้: ${userName}`);
  }
}

// ฟังก์ชันแสดงแต้มของผู้ใช้
async function handleMyPoints(replyToken, userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (userData) {
    const maskedUserId = maskUID(userData.userId); // ปกปิด UID
    const points = userData.points || 0;
    const userName = userData.name || "ไม่ทราบชื่อ";

    // Flex Message template สำหรับแสดงข้อมูลพื้นฐาน
    const flexMessage = {
      type: "flex",
      altText: "แต้มสะสมของคุณ",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "แต้มสะสมของคุณ",
              weight: "bold",
              size: "xl",
              color: "#1DB446"
            },
            {
              type: "text",
              text: `${getCurrentDateTime()}`,  // ใช้เวลาปัจจุบันจากฟังก์ชันที่แก้ไขแล้ว
              size: "sm",
              color: "#888888",
              margin: "md"
            },
            {
              type: "separator",
              margin: "lg"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: "ชื่อผู้ใช้",
                  color: "#aaaaaa",
                  size: "sm"
                },
                {
                  type: "text",
                  text: userName,
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                },
                {
                  type: "text",
                  text: "User ID",
                  color: "#aaaaaa",
                  size: "sm"
                },
                {
                  type: "text",
                  text: maskedUserId,  // แสดง User ID แบบปกปิด
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                },
                {
                  type: "text",
                  text: "แต้มคงเหลือ",
                  color: "#aaaaaa",
                  size: "sm",
                  margin: "md"
                },
                {
                  type: "text",
                  text: `${points} แต้ม`,
                  weight: "bold",
                  size: "xl",
                  color: "#1DB446"
                }
              ]
            },
            {
              type: "separator",
              margin: "lg"
            },
            {
              type: "button",
              style: "primary",
              color: "#1DB446",
              action: {
                type: "message",
                label: "ดูรายละเอียด",  // ชื่อปุ่มยังคงเป็น "ดูรายละเอียด"
                text: "mypoints > ดูรายละเอียด"  // แต่คำสั่งที่ส่งเป็น "mypoints > ดูรายละเอียด"
              },
              margin: "lg"
            }
          ]
        }
      }
    };

    await replyWithFlexMessage(replyToken, flexMessage);
  } else {
    await replyToUser(replyToken, "ไม่พบข้อมูลแต้มของคุณ.");
  }
}

// ฟังก์ชันแสดงรายละเอียดทั้งหมดของผู้ใช้
async function handleUserDetails(replyToken, userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (userData) {
    const points = userData.points || 0;
    const userName = userData.name || "ไม่ทราบชื่อ";

    // Flex Message template สำหรับแสดงข้อมูลทั้งหมด
    const flexMessage = {
      type: "flex",
      altText: "ข้อมูลรายละเอียดของคุณ",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "ข้อมูลของคุณ",
              weight: "bold",
              size: "xl",
              color: "#1DB446"
            },
            {
              type: "text",
              text: `${getCurrentDateTime()}`,  // ใช้เวลาปัจจุบันจากฟังก์ชันที่แก้ไขแล้ว
              size: "sm",
              color: "#888888",
              margin: "md"
            },
            {
              type: "separator",
              margin: "lg"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: "ชื่อผู้ใช้",
                  color: "#aaaaaa",
                  size: "sm"
                },
                {
                  type: "text",
                  text: userName,
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                },
                {
                  type: "text",
                  text: "User ID",
                  color: "#aaaaaa",
                  size: "sm"
                },
                {
                  type: "text",
                  text: userData.userId,  // แสดง User ID แบบเต็ม
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                },
                {
                  type: "text",
                  text: "แต้มคงเหลือ",
                  color: "#aaaaaa",
                  size: "sm",
                  margin: "md"
                },
                {
                  type: "text",
                  text: `${points} แต้ม`,
                  weight: "bold",
                  size: "xl",
                  color: "#1DB446"
                },
                {
                  type: "text",
                  text: "วันที่สร้างบัญชี",
                  color: "#aaaaaa",
                  size: "sm",
                  margin: "md"
                },
                {
                  type: "text",
                  text: userData.createdAt,
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                }
              ]
            },
            {
              type: "separator",
              margin: "lg"
            },
            {
              type: "button",
              style: "primary",
              color: "#1DB446",
              action: {
                type: "message",
                label: "กลับไปที่หน้าแรก",
                text: "mypoints"  // กลับไปที่ข้อความหลักเมื่อกดปุ่ม
              },
              margin: "lg"
            }
          ]
        }
      }
    };

    await replyWithFlexMessage(replyToken, flexMessage);
  } else {
    await replyToUser(replyToken, "ไม่พบข้อมูลของคุณ.");
  }
}

// ฟังก์ชันแสดงข้อมูลโปรไฟล์ของผู้ใช้
async function handleUserProfile(replyToken, userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (userData) {
    const userName = userData.name || "ไม่ทราบชื่อ";
    const points = userData.points || 0;
    const createdAt = userData.createdAt || "ไม่ทราบเวลา";
    const userUID = userData.userId; // ดึง User ID เต็ม

    // Flex Message template สำหรับแสดงข้อมูลโปรไฟล์
    const flexMessage = {
      type: "flex",
      altText: "ข้อมูลโปรไฟล์ของคุณ",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "ข้อมูลโปรไฟล์ของคุณ",
              weight: "bold",
              size: "xl",
              color: "#1DB446"
            },
            {
              type: "text",
              text: `${getCurrentDateTime()}`,  // ใช้เวลาปัจจุบันจากฟังก์ชันที่แก้ไขแล้ว
              size: "sm",
              color: "#888888",
              margin: "md"
            },
            {
              type: "separator",
              margin: "lg"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: "ชื่อผู้ใช้",
                  color: "#aaaaaa",
                  size: "sm"
                },
                {
                  type: "text",
                  text: userName,
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                },
                {
                  type: "text",
                  text: "User ID",
                  color: "#aaaaaa",
                  size: "sm"
                },
                {
                  type: "text",
                  text: userUID,  // แสดง User ID เต็ม
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                },
                {
                  type: "text",
                  text: "แต้มคงเหลือ",
                  color: "#aaaaaa",
                  size: "sm",
                  margin: "md"
                },
                {
                  type: "text",
                  text: `${points} แต้ม`,
                  weight: "bold",
                  size: "xl",
                  color: "#1DB446"
                },
                {
                  type: "text",
                  text: "วันที่สร้างบัญชี",
                  color: "#aaaaaa",
                  size: "sm",
                  margin: "md"
                },
                {
                  type: "text",
                  text: createdAt,
                  weight: "bold",
                  size: "md",
                  color: "#333333"
                }
              ]
            },
            {
              type: "separator",
              margin: "lg"
            }
          ]
        }
      }
    };

    await replyWithFlexMessage(replyToken, flexMessage);
  } else {
    await replyToUser(replyToken, "ไม่พบข้อมูลโปรไฟล์ของคุณ.");
  }
}

// ฟังก์ชันปกปิดเลข UID บางส่วนเพื่อความปลอดภัย
function maskUID(uid) {
  // แสดงแค่ 5 ตัวแรก
  return uid.substring(0, 5) + "…"; // เช่น U1234…
}

// ฟังก์ชันดึงเวลาปัจจุบันในรูปแบบที่ต้องการ (เวลาไทย)
function getCurrentDateTime() {
  const now = new Date();
  
  // ตั้งค่า timezone เป็น 'Asia/Bangkok'
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  };
  
  // ใช้ toLocaleString เพื่อให้แสดงเวลาในรูปแบบที่ถูกต้อง
  return now.toLocaleString('th-TH', options);
}

// ฟังก์ชันเพิ่มข้อมูลผู้ใช้ใน Firebase
async function addUserData(userId) {
  const userRef = db.ref('users/' + userId);
  const userSnapshot = await userRef.once('value');
  const userData = userSnapshot.val();

  if (!userData) {
    const userName = await getUserName(userId);
    await userRef.set({
      name: userName,
      userId: userId,
      points: 0, // ไม่ให้แต้มเริ่มต้น
      createdAt: new Date().toISOString()
    });
    console.log(`สร้างข้อมูลใหม่สำหรับผู้ใช้: ${userName}`);
  }
}

// ดึงชื่อผู้ใช้จาก LINE API
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

// ส่งข้อความไปยังผู้ใช้
async function replyToUser(replyToken, message) {
  try {
    await axios.post(
      LINE_REPLY_API,
      {
        replyToken: replyToken,
        messages: [{ type: 'text', text: message }], 
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

// ฟังก์ชันส่ง Flex Message
async function replyWithFlexMessage(replyToken, flexMessage) {
  try {
    await axios.post(LINE_REPLY_API, {
      replyToken: replyToken,
      messages: [flexMessage]
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
  } catch (error) {
    console.error('Error sending Flex Message:', error.response?.data || error.message);
  }
}

// ฟังก์ชันอัปเดตแต้มผู้ใช้
async function updateUserPoints(userId, change, note) {
  const userRef = db.ref('users/' + userId);
  const userSnap = await userRef.once('value');
  const userData = userSnap.val();

  let newPoints = (userData?.points || 0) + change;
  if (newPoints < 0) newPoints = 0;

  // อัปเดตแต้ม
  await userRef.update({ points: newPoints });

  // เพิ่มประวัติแต้ม
  const historyRef = userRef.child('points_history').push();
  await historyRef.set({
    timestamp: Date.now(),
    change,
    note
  });
}



// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
