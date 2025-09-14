const https = require('https');
const { DynamoDBClient } = require('@aws-sdkclient-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdklib-dynamodb');
const { randomUUID } = require('crypto');

 DynamoDB設定 (AWS SDK v3)
const client = new DynamoDBClient({
    region process.env.AWS_REGION  'ap-northeast-1'
});
const dynamodb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'line-bot-reminders';

exports.handler = async (event, context) = {
    console.log('=== Reminder BOT Lambda function started (v2.0) ===');
    console.log('Event', JSON.stringify(event, null, 2));
    
    try {
         環境変数から LINE Access Token を取得
        const lineAccessToken = process.env.LINE_ACCESS_TOKEN;
        if (!lineAccessToken) {
            console.error('LINE_ACCESS_TOKEN not found in environment variables');
            return {
                statusCode 500,
                body JSON.stringify({ error 'LINE_ACCESS_TOKEN not found' })
            };
        }

         リクエストボディを解析
        const body = JSON.parse(event.body);
        const events = body.events  [];
        console.log(`Processing ${events.length} events`);

         各イベントを処理
        for (const eventData of events) {
            if (eventData.type === 'message' && eventData.message.type === 'text') {
                const replyToken = eventData.replyToken;
                const userMessage = eventData.message.text;
                const userId = eventData.source.userId;
                
                console.log(`Received message ${userMessage} from user ${userId}`);
                
                 メッセージを解析してリマインダー情報を抽出
                const reminderInfo = parseReminderMessage(userMessage);
                
                if (reminderInfo) {
                     リマインダーをDynamoDBに保存
                    const reminderId = randomUUID();
                    await saveReminderToDynamoDB(reminderId, userId, reminderInfo);
                    
                     成功メッセージを返信
                    const replyText = `リマインダーを設定しました！n` +
                                    `日時 ${formatDateTime(reminderInfo.dateTime)}n` +
                                    `タスク ${reminderInfo.task}`;
                    
                    await sendReply(lineAccessToken, replyToken, replyText);
                } else {
                     解析に失敗した場合のメッセージ
                    const replyText = `申し訳ございません。メッセージを理解できませんでした。nn` +
                                    `例 「明日の朝8時にゴミ出し」n` +
                                    `例 「2025年9月15日 1430に会議の準備」n` +
                                    `例 「来週の月曜日 9時に病院の予約」`;
                    
                    await sendReply(lineAccessToken, replyToken, replyText);
                }
            }
        }

        return {
            statusCode 200,
            body JSON.stringify({ message 'Success' })
        };

    } catch (error) {
        console.error('=== Lambda function error ===');
        console.error('Error', error);
        return {
            statusCode 500,
            body JSON.stringify({ error error.message })
        };
    }
};


  メッセージからリマインダー情報を解析する関数
 
function parseReminderMessage(message) {
    console.log(`=== PARSING MESSAGE (v2.0) === ${message}`);
    
     現在の日本時間を取得
    const now = new Date();
    const nowJST = new Date(now.toLocaleString(en-US, {timeZone AsiaTokyo}));
    console.log(`Current JST ${nowJST.toLocaleString('ja-JP', {timeZone 'AsiaTokyo'})}`);
    
    let jstDateTime = null;
    let task = null;
    
     パターン1 「明日の朝8時にゴミ出し」
    const pattern1 = ^明日の(朝夜午前午後)(d{1,2})時に(.+)$;
    const match1 = message.match(pattern1);
    if (match1) {
        console.log('Matched pattern 1 Tomorrow');
        const hour = parseInt(match1[1]);
        const taskText = match1[2];
        
         明日の日本時間で設定
        jstDateTime = new Date(nowJST);
        jstDateTime.setDate(jstDateTime.getDate() + 1);
        jstDateTime.setHours(hour, 0, 0, 0);
        task = taskText;
    }
    
     パターン2 「今日の15時にミーティング」
    const pattern2 = ^今日の(d{1,2})時に(.+)$;
    const match2 = message.match(pattern2);
    if (match2) {
        console.log('Matched pattern 2 Today');
        const hour = parseInt(match2[1]);
        const taskText = match2[2];
        
         今日の日本時間で設定
        jstDateTime = new Date(nowJST);
        jstDateTime.setHours(hour, 0, 0, 0);
        task = taskText;
    }
    
     パターン3 「2025年9月15日 1430に会議の準備」
    const pattern3 = ^(d{4})年(d{1,2})月(d{1,2})日s+(d{1,2})(d{1,2})に(.+)$;
    const match3 = message.match(pattern3);
    if (match3) {
        console.log('Matched pattern 3 Specific date');
        const year = parseInt(match3[1]);
        const month = parseInt(match3[2]) - 1;  JavaScript月は0ベース
        const day = parseInt(match3[3]);
        const hour = parseInt(match3[4]);
        const minute = parseInt(match3[5]);
        const taskText = match3[6];
        
        console.log(`Parsed date components ${year}${month + 1}${day} ${hour}${minute}`);
        
         指定された日本時間で設定
        jstDateTime = new Date(nowJST);
        jstDateTime.setFullYear(year, month, day);
        jstDateTime.setHours(hour, minute, 0, 0);
        task = taskText;
    }
    
     パターン4 「来週の月曜日 9時に病院の予約」
    const pattern4 = ^来週の(月火水木金土日)曜日s+(d{1,2})時に(.+)$;
    const match4 = message.match(pattern4);
    if (match4) {
        console.log('Matched pattern 4 Next week');
        const dayOfWeek = match4[1];
        const hour = parseInt(match4[2]);
        const taskText = match4[3];
        
        const dayMap = {'月' 1, '火' 2, '水' 3, '木' 4, '金' 5, '土' 6, '日' 0};
        const targetDayOfWeek = dayMap[dayOfWeek];
        
        jstDateTime = new Date(nowJST);
        jstDateTime.setDate(jstDateTime.getDate() + 7);  来週
        
         来週の指定曜日を計算
        const daysToAdd = (targetDayOfWeek - jstDateTime.getDay() + 7) % 7;
        jstDateTime.setDate(jstDateTime.getDate() + daysToAdd);
        jstDateTime.setHours(hour, 0, 0, 0);
        task = taskText;
    }
    
    if (jstDateTime && task) {
         JST時間をUTCに変換して保存（9時間引く）
        const utcDateTime = new Date(jstDateTime.getTime() - (9  60  60  1000));
        const dateTime = utcDateTime.toISOString();
        
        console.log(`=== CONVERSION RESULTS ===`);
        console.log(`JST DateTime ${jstDateTime.toLocaleString('ja-JP', {timeZone 'AsiaTokyo'})}`);
        console.log(`UTC DateTime ${dateTime}`);
        console.log(`Task ${task}`);
        console.log(`=== END CONVERSION ===`);
        
        return { dateTime, task };
    }
    
    console.log('Failed to parse message - no pattern matched');
    return null;
}


  リマインダーをDynamoDBに保存する関数
 
async function saveReminderToDynamoDB(reminderId, userId, reminderInfo) {
    console.log(`Saving reminder to DynamoDB - ID ${reminderId}`);
    console.log(`Reminder DateTime (UTC) ${reminderInfo.dateTime}`);
    
    const params = {
        TableName TABLE_NAME,
        Item {
            reminderId reminderId,
            userId userId,
            reminderDateTime reminderInfo.dateTime,
            task reminderInfo.task,
            status 'pending',
            createdAt new Date().toISOString()
        }
    };
    
    try {
        const command = new PutCommand(params);
        await dynamodb.send(command);
        console.log('Reminder saved to DynamoDB successfully');
    } catch (error) {
        console.error('Error saving reminder to DynamoDB', error);
        throw error;
    }
}


  日時をユーザーフレンドリーな形式でフォーマット
 
function formatDateTime(isoString) {
    console.log(`Formatting UTC time ${isoString} to JST`);
    
     UTC時間を日本時間に変換して表示
    const utcDate = new Date(isoString);
    const jstDate = new Date(utcDate.getTime() + (9  60  60  1000));
    
    const year = jstDate.getFullYear();
    const month = jstDate.getMonth() + 1;
    const day = jstDate.getDate();
    const hour = jstDate.getHours();
    const minute = jstDate.getMinutes();
    
    const formatted = `${year}年${month}月${day}日 ${hour}${minute.toString().padStart(2, '0')}`;
    console.log(`Formatted JST time ${formatted}`);
    
    return formatted;
}


  LINE Messaging API に返信を送信する関数
 
function sendReply(accessToken, replyToken, messageText) {
    return new Promise((resolve, reject) = {
        const timeout = setTimeout(() = {
            reject(new Error('Request timeout'));
        }, 10000);

        const postData = JSON.stringify({
            replyToken replyToken,
            messages [
                {
                    type 'text',
                    text messageText
                }
            ]
        });

        const options = {
            hostname 'api.line.me',
            port 443,
            path 'v2botmessagereply',
            method 'POST',
            timeout 10000,
            headers {
                'Content-Type' 'applicationjson',
                'Authorization' `Bearer ${accessToken}`,
                'Content-Length' Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) = {
            clearTimeout(timeout);
            let data = '';
            
            res.on('data', (chunk) = {
                data += chunk;
            });

            res.on('end', () = {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`LINE API returned status ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('timeout', () = {
            clearTimeout(timeout);
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.on('error', (error) = {
            clearTimeout(timeout);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}