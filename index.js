const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Firebase Realtime Database URL
const databaseURL = 'https://database-linebot-e6dd7-default-rtdb.asia-southeast1.firebasedatabase.app/'; // ใส่ URL ของ Firebase Realtime Database ของคุณที่นี่

// LINE API Config
const LINE_CHANNEL_ACCESS_TOKEN = 'ccLb2V+7NMLd1ZgPHHEz5NUfj9rkehvg3vGNEKPouliQFonC0HeweQf2+0Y/6U+07oR8cUVDFNC9iJD1ylMCf2JWP8keHohVzU+HlV9QV0F71oEYTGOYIT7nLMTrXsTDYU2DlfxJJn9dgY3QhIVJ+gdB04t89/1O/w1cDnyilFU=';
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile';

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL // เพิ่มการตั้งค่า URL สำหรับ Realtime Database
});

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

            // เพิ่มข้อมูลของผู้ใช้ทุกครั้งที่พิมพ์คำสั่ง
            await addUserData(userId);

            // คำสั่งต่างๆ
            if (userMessage === "mypoints") {
                const message = await getUserPoints(userId);
                await replyToUser(event.replyToken, message);
            } else if (userMessage === "faq") {
                const message = `คำสั่งที่สามารถใช้ได้:\n- mypoints: ตรวจสอบคะแนนของคุณ\n- viewuid: ดู UserID ของคุณ\n- addpoints <จำนวน>: เพิ่มคะแนน\n- removepoints <จำนวน>: ลบคะแนน\n- bypass: จัดการสิทธิ์ข้ามการตรวจสอบ\n- cancelbypass: ยกเลิกสิทธิ์ข้ามการตรวจสอบ`;
                await replyToUser(event.replyToken, message);
            } else if (userMessage === "viewuid") {
                await replyToUser(event.replyToken, `UserID ของคุณคือ: ${userId}`);
            } else if (userMessage.startsWith("addpoints")) {
                if (hasBypass(userId)) {
                    const points = parseInt(userMessage.split(" ")[1]);
                    if (!isNaN(points)) {
                        await addPoints(userId, points);
                        await replyToUser(event.replyToken, `เพิ่ม ${points} คะแนนให้กับบัญชีของคุณเรียบร้อยแล้ว!`);
                    } else {
                        await replyToUser(event.replyToken, "กรุณาระบุจำนวนคะแนนที่ถูกต้อง.");
                    }
                } else {
                    await replyToUser(event.replyToken, "คุณไม่มีสิทธิ์ในการเพิ่มคะแนน.");
                }
            } else if (userMessage.startsWith("removepoints")) {
                if (hasBypass(userId)) {
                    const points = parseInt(userMessage.split(" ")[1]);
                    if (!isNaN(points)) {
                        await removePoints(userId, points);
                        await replyToUser(event.replyToken, `ลบ ${points} คะแนนจากบัญชีของคุณเรียบร้อยแล้ว.`);
                    } else {
                        await replyToUser(event.replyToken, "กรุณาระบุจำนวนคะแนนที่ถูกต้อง.");
                    }
                } else {
                    await replyToUser(event.replyToken, "คุณไม่มีสิทธิ์ในการลบคะแนน.");
                }
            } else if (userMessage.startsWith("bypass")) {
                const secretCode = userMessage.split(" ")[1];

                if (secretCode === "byp@ss") {
                    grantBypass(userId);
                    await replyToUser(event.replyToken, "คุณได้รับสิทธิ์ในการข้ามการตรวจสอบแล้ว.");
                } else {
                    await replyToUser(event.replyToken, "รหัสลับไม่ถูกต้อง.");
                }
            } else if (userMessage.startsWith("cancelbypass")) {
                revokeBypass(userId);
                await replyToUser(event.replyToken, "คุณได้ยกเลิกสิทธิ์ในการข้ามการตรวจสอบแล้ว.");
            } else {
                await replyToUser(event.replyToken, "คำสั่งที่คุณป้อนมาไม่ถูกต้อง. กรุณาใช้คำสั่ง 'faq' เพื่อดูคำสั่งที่ใช้ได้.");
            }
        }
    }
    res.status(200).send('OK');
});

// ฟังก์ชันที่เพิ่มข้อมูลผู้ใช้ใน Firebase
async function addUserData(userId) {
    const userRef = db.ref('users/' + userId);
    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.val();

    if (!userData) {
        const userName = await getUserName(userId);
        userRef.set({ 
            name: userName, 
            userId: userId, 
            points: 0 
        });
    }
}

// เพิ่มคะแนนให้ผู้ใช้
async function addPoints(userId, points) {
    const userRef = db.ref('users/' + userId);
    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.val();

    if (!userData) {
        const userName = await getUserName(userId);
        userRef.set({ name: userName, points: 0 });
    }
    await userRef.update({
        points: (userData ? userData.points : 0) + points
    });
}

// ลบคะแนนจากผู้ใช้
async function removePoints(userId, points) {
    const userRef = db.ref('users/' + userId);
    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.val();

    if (userData) {
        const currentPoints = userData.points || 0;
        await userRef.update({
            points: Math.max(0, currentPoints - points)
        });
    }
}

// เพิ่มสิทธิ์ bypass
async function grantBypass(userId) {
    const bypassRef = db.ref('bypass/' + userId);
    await bypassRef.set({ granted: true });
}

// ยกเลิกสิทธิ์ bypass
async function revokeBypass(userId) {
    const bypassRef = db.ref('bypass/' + userId);
    await bypassRef.remove();
}

// ตรวจสอบว่า user มีสิทธิ์ bypass หรือไม่
async function hasBypass(userId) {
    const bypassRef = db.ref('bypass/' + userId);
    const bypassSnapshot = await bypassRef.once('value');
    return bypassSnapshot.exists();
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

// แสดงคะแนนของผู้ใช้
async function getUserPoints(userId) {
    const userRef = db.ref('users/' + userId);
    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.val();

    if (userData) {
        return `คุณมีคะแนนทั้งหมด ${userData.points} คะแนน (ชื่อ: ${userData.name}).`;
    }
    return "คุณไม่มีคะแนนในระบบ.";
}

// ส่งข้อความไปยังผู้ใช้
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

