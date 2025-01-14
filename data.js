const admin = require('firebase-admin');
const serviceAccount = require('./path/to/your/serviceAccountKey.json');  // ใช้ Service Account Key

// Firebase Admin SDK Initialization
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),  // ใช้ Service Account Key
  databaseURL: 'https://line-bot-87bda-default-rtdb.asia-southeast1.firebasedatabase.app/' // Firebase Realtime Database URL ของคุณ
});

// Firebase Realtime Database reference
const db = admin.database();

// Helper to save data to Firebase
async function saveData(path, data) {
  const ref = db.ref(path);
  await ref.set(data);
}

// Helper to get data from Firebase
async function getData(path) {
  const ref = db.ref(path);
  const snapshot = await ref.once('value');
  return snapshot.val();
}

module.exports = { saveData, getData };
