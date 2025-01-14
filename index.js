const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');

// LINE API Config
const LINE_CHANNEL_ACCESS_TOKEN = 'ccLb2V+7NMLd1ZgPHHEz5NUfj9rkehvg3vGNEKPouliQFonC0HeweQf2+0Y/6U+07oR8cUVDFNC9iJD1ylMCf2JWP8keHohVzU+HlV9QV0F71oEYTGOYIT7nLMTrXsTDYU2DlfxJJn9dgY3QhIVJ+gdB04t89/1O/w1cDnyilFU=';
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_API = 'https://api.line.me/v2/bot/profile';

// Load data from JSON file
const dataFile = 'data.json';
let data = require(`./${dataFile}`);

// Helper to save data
function saveData() {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

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
                const message = getUserPoints(userId);
                await replyToUser(event.replyToken, message);
            } else if (userMessage === "viewuid") {
                await replyToUser(event.replyToken, `Your UserID is: ${userId}`);
            } else if (userMessage.startsWith("addpoints")) {
                if (hasBypass(userId)) {
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
                if (hasBypass(userId)) {
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
                    grantBypass(userId);
                    await replyToUser(event.replyToken, "คุณได้รับสิทธิ์ในการข้ามการตรวจสอบ.");
                } else {
                    await replyToUser(event.replyToken, "รหัสลับไม่ถูกต้อง. การเข้าถึงถูกปฏิเสธ.");
                }
            } else {
                await replyToUser(event.replyToken, "คำสั่งที่มีอยู่: 'mypoints', 'viewuid', 'addpoints <number>', 'removepoints <number>', หรือ 'bypass <secretcode>'");
            }
        }
    }
    res.status(200).send('OK');
});

// Add points to user
async function addPoints(userId, points) {
    if (!data.users[userId]) {
        const userName = await getUserName(userId);
        data.users[userId] = { name: userName, points: 0 };
    }
    data.users[userId].points += points;
    saveData();
}

// Remove points from user
async function removePoints(userId, points) {
    if (data.users[userId]) {
        data.users[userId].points = Math.max(0, data.users[userId].points - points);
        saveData();
    }
}

// Grant bypass permission
function grantBypass(userId) {
    if (!data.bypass) data.bypass = [];
    if (!data.bypass.includes(userId)) {
        data.bypass.push(userId);
        saveData();
    }
}

// Check if user has bypass access
function hasBypass(userId) {
    return data.bypass && data.bypass.includes(userId);
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
function getUserPoints(userId) {
    if (data.users[userId]) {
        return `คุณมีคะแนนทั้งหมด ${data.users[userId].points} คะแนน (ชื่อ: ${data.users[userId].name}).`;
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
