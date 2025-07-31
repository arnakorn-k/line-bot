# LINE Bot Green Point System

LINE Bot สำหรับระบบแต้มสะสม (Green Point System) ที่เชื่อมต่อกับ Firebase และ LINE Login API

## 🌟 ฟีเจอร์หลัก

### 📱 LINE Bot Features
- **ระบบแต้มสะสม**: ติดตามและจัดการแต้มของผู้ใช้
- **ระบบคูปอง**: รับแต้มผ่านรหัสคูปอง (รองรับทั้งแบบจำกัดและไม่จำกัดครั้ง)
- **โปรไฟล์ผู้ใช้**: ดูข้อมูลส่วนตัวและแต้มคงเหลือ
- **การเชื่อมต่อเว็บ**: เชื่อมบัญชี LINE กับเว็บแอปพลิเคชัน
- **ประวัติแต้ม**: เก็บบันทึกการเปลี่ยนแปลงแต้มทั้งหมด

### 🎮 คำสั่งใน LINE Bot

| คำสั่ง | คำอธิบาย |
|--------|----------|
| `/linkweb` | สร้างลิงก์เชื่อมต่อกับเว็บแอปพลิเคชัน |
| `/myprofile` | แสดงข้อมูลโปรไฟล์และแต้มคงเหลือ |
| `/coupons` | เริ่มต้นกระบวนการใช้รหัสคูปอง |
| `!@ [จำนวน]` | เพิ่ม/ลดแต้ม (สำหรับแอดมิน) |
| `mypoints` | ดูแต้มสะสมปัจจุบัน |
| `mypoints > ดูรายละเอียด` | ดูรายละเอียดแต้มแบบเต็ม |

## 🚀 การติดตั้งและใช้งาน

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

สร้างไฟล์ `.env` และเพิ่มตัวแปรต่อไปนี้:

```env
# LINE API Configuration
CHANNEL_ACCESS_TOKEN=your_line_channel_access_token

# Firebase Configuration
DATABASE_URL=your_firebase_database_url
GC_TYPE=service_account
GC_PROJECT_ID=your_project_id
GC_PRIVATE_KEY_ID=your_private_key_id
GC_PRIVATE_KEY=your_private_key
GC_CLIENT_EMAIL=your_client_email
GC_CLIENT_ID=your_client_id
GC_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GC_TOKEN_URI=https://oauth2.googleapis.com/token
GC_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GC_CLIENT_X509_CERT_URL=your_client_cert_url
```

### 3. เรียกใช้แอปพลิเคชัน

```bash
npm start
```

หรือสำหรับ development:

```bash
node index.js
```

## 🔧 API Endpoints

### LINE Webhook
- **POST** `/webhook` - รับข้อความจาก LINE และประมวลผล

### LINE Login Callback
- **GET** `/line-callback` - จัดการ callback จาก LINE Login

### Static Files
- **GET** `/u67319010043/GreenPointSystem/*` - เสิร์ฟไฟล์ static สำหรับเว็บแอปพลิเคชัน

## 🏗️ สถาปัตยกรรม

### เทคโนโลยีที่ใช้
- **Backend**: Node.js + Express.js
- **Database**: Firebase Realtime Database
- **Authentication**: LINE Login API
- **Deployment**: Vercel
- **Messaging**: LINE Messaging API

### โครงสร้างข้อมูลใน Firebase

```json
{
  "users": {
    "[userId]": {
      "name": "ชื่อผู้ใช้",
      "userId": "LINE User ID",
      "points": 0,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "state": "waiting_coupon",
      "points_history": {
        "[historyId]": {
          "timestamp": 1640995200000,
          "change": 10,
          "note": "รับแต้มจากคูปอง ABC123"
        }
      }
    }
  },
  "coupons": {
    "[couponCode]": {
      "points": 10,
      "limit": 100,
      "used": 0,
      "users": {
        "[userName]": true
      }
    }
  }
}
```

## 📱 ระบบคูปอง

### คูปองแบบจำกัดครั้ง
- มี `limit` กำหนดจำนวนครั้งที่ใช้ได้
- ติดตามผู้ใช้ที่เคยใช้แล้ว
- ป้องกันการใช้ซ้ำโดยผู้ใช้คนเดียวกัน

### คูปองแบบไม่จำกัดครั้ง
- ไม่มี `limit`
- ผู้ใช้สามารถใช้ได้หลายครั้ง

## 🌐 การ Deploy

### Vercel
โปรเจกต์นี้พร้อมสำหรับ deploy บน Vercel:

1. Push โค้ดไปยัง GitHub
2. เชื่อมต่อ repository กับ Vercel
3. ตั้งค่า Environment Variables ใน Vercel Dashboard
4. Deploy!

### การตั้งค่า LINE Developers Console

1. สร้าง LINE Login Channel และ Messaging API Channel
2. ตั้งค่า Webhook URL: `https://your-domain.vercel.app/webhook`
3. ตั้งค่า Callback URL: `https://your-domain.vercel.app/line-callback`
4. เปิดใช้งาน Auto-reply messages

## 🔒 ความปลอดภัย

- **User ID Masking**: ปกปิด User ID บางส่วนเมื่อแสดงใน UI
- **Environment Variables**: ข้อมูลสำคัญถูกเก็บใน environment variables
- **Firebase Security Rules**: ใช้ Firebase Admin SDK สำหรับการเข้าถึงข้อมูล

## 📄 ไฟล์สำคัญ

- `index.js` - Main application file
- `package.json` - Dependencies และ scripts
- `vercel.json` - Vercel deployment configuration
- `.env` - Environment variables (ไม่ควร commit)

## 🤝 การพัฒนา

### โครงสร้างโค้ด
- **Webhook Handler**: จัดการข้อความจาก LINE
- **User Management**: ฟังก์ชันจัดการข้อมูลผู้ใช้
- **Points System**: ระบบแต้มสะสมและประวัติ
- **Coupon System**: ระบบคูปองและการตรวจสอบ
- **Flex Messages**: ข้อความแบบ rich content

### การเพิ่มฟีเจอร์ใหม่
1. เพิ่มฟังก์ชันใน webhook handler
2. สร้าง helper functions ตามต้องการ
3. อัปเดต Firebase schema หากจำเป็น
4. ทดสอบผ่าน ngrok หรือ Vercel Preview

## 📞 การติดต่อ

หากมีคำถามหรือต้องการความช่วยเหลือ สามารถติดต่อได้ที่:
- GitHub: [isen-sama](https://github.com/isen-sama)
- Repository: [line-bot](https://github.com/isen-sama/line-bot)
- เชื่อมต่อกับ Firebase Realtime Database
- ใช้ LINE Flex Message แสดงข้อมูล
- ส่งปุ่มสำหรับเชื่อมบัญชี LINE กับเว็บไซต์ (พิมพ์ `linkweb` แล้วจะได้รับปุ่มกดลิงก์ ไม่ใช่ลิงก์ข้อความธรรมดา)

## การติดตั้ง

1. **Clone โปรเจกต์**
   ```sh
   git clone https://github.com/your-username/line-bot.git
   cd line-bot
   ```

2. **ติดตั้ง dependencies**
   ```sh
   npm install
   ```

3. **ตั้งค่าไฟล์ .env**
   - ดูตัวอย่างใน [.env](line-bot/.env)
   - กรอกข้อมูล Firebase, LINE Channel Access Token, Service Account ฯลฯ

4. **รันเซิร์ฟเวอร์**
   ```sh
   node index.js
   ```

## การใช้งาน

- เพิ่ม LINE Bot เป็นเพื่อน
- ส่งข้อความ `mypoints` เพื่อดูแต้มสะสม
- ส่งข้อความ `mypoints > ดูรายละเอียด` เพื่อดูรายละเอียดแต้ม
- ส่งข้อความ `myprofile` เพื่อดูข้อมูลโปรไฟล์
- ส่งข้อความ `linkweb` เพื่อรับปุ่มสำหรับเชื่อมบัญชี LINE กับเว็บไซต์

## โครงสร้างโปรเจกต์

```
line-bot/
├── .env
├── .gitignore
├── index.js
├── package.json
├── vercel.json
```

## เทคโนโลยีที่ใช้

- Node.js
- Express.js
- @line/bot-sdk
- Firebase Admin SDK
- Axios
- dotenv

## หมายเหตุ

- ใช้สำหรับการศึกษาและทดลองเท่านั้น
- ควรตั้งค่าความปลอดภัยของ Firebase ให้เหมาะสมก่อนใช้งานจริง

---

ผู้พัฒนา: แผนกเทคโนโลยีสารสนเทศ