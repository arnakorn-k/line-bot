const line = require('@line/bot-sdk');
const express = require('express');

const app = express();

const config = {
    channelAccessToken: 'nFYmrWmJ+zIStXZqjJ9/3RXGrJMI1hOQLV0UsLglMQ8CbK20iSYnudnvSEDYWpH/NZWOc9qX7cFBk93C8XdVy2uA+y9/ICM3P84r1VMuI0Ez2waEbMIre2xrqSBI0tqUIMonOJ6/6w2pKkUE1Lb6HQdB04t89/1O/w1cDnyilFU=', // ใส่ Access Token ของคุณ
    channelSecret: '8cb20bd19b332d4651f2b63f14836a26',           // ใส่ Secret ของคุณ
};

const client = new line.Client(config);

app.post('/webhook', line.middleware(config), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }
    return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `คุณหน้าหีพูดว่า: ${event.message.text}`,
    });
}

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
