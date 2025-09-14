const https = require('https');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// DynamoDB設定 (AWS SDK v3)
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1'
});
const dynamodb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'line-bot-reminders';

exports.handler = async (event, context) => {
    console.log('=== Reminder Sender Lambda started ===');
    
    try {
        // 環境変数から LINE Access Token を取得
        const lineAccessToken = process.env.LINE_ACCESS_TOKEN;
        if (!lineAccessToken) {
            console.error('LINE_ACCESS_TOKEN not found in environment variables');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'LINE_ACCESS_TOKEN not found' })
            };
        }

        // 現在時刻を取得（UTC）
        const now = new Date();
        const nowUTC = now.toISOString();
        
        // 現在時刻から1分後までの範囲（実行間隔の余裕を持たせる）
        const oneMinuteLater = new Date(now.getTime() + 60000).toISOString();
        
        console.log(`Checking for reminders between ${nowUTC} and ${oneMinuteLater}`);
        
        // 送信すべきリマインダーを取得
        const reminders = await getPendingReminders(nowUTC, oneMinuteLater);
        console.log(`Found ${reminders.length} reminders to send`);
        
        // 各リマインダーを送信
        for (const reminder of reminders) {
            try {
                await sendPushMessage(lineAccessToken, reminder.userId, reminder.task);
                await markReminderAsSent(reminder.reminderId);
                console.log(`Reminder sent successfully: ${reminder.reminderId}`);
            } catch (error) {
                console.error(`Failed to send reminder ${reminder.reminderId}:`, error);
            }
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'Success',
                remindersSent: reminders.length
            })
        };

    } catch (error) {
        console.error('=== Reminder Sender error ===');
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

/**
 * 送信すべきリマインダーを取得
 */
async function getPendingReminders(startTime, endTime) {
    console.log(`Scanning for pending reminders...`);
    
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status AND #reminderDateTime BETWEEN :startTime AND :endTime',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#reminderDateTime': 'reminderDateTime'
        },
        ExpressionAttributeValues: {
            ':status': 'pending',
            ':startTime': startTime,
            ':endTime': endTime
        }
    };
    
    try {
        const command = new ScanCommand(params);
        const result = await dynamodb.send(command);
        console.log(`Scan completed: ${result.Items.length} items found`);
        return result.Items;
    } catch (error) {
        console.error('Error scanning reminders:', error);
        return [];
    }
}

/**
 * LINE Push Message API でメッセージを送信
 */
function sendPushMessage(accessToken, userId, message) {
    console.log(`Sending push message to user: ${userId}`);
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 10000);

        const postData = JSON.stringify({
            to: userId,
            messages: [
                {
                    type: 'text',
                    text: `🔔 リマインダー\n${message}`
                }
            ]
        });

        const options = {
            hostname: 'api.line.me',
            port: 443,
            path: '/v2/bot/message/push',
            method: 'POST',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            clearTimeout(timeout);
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('Push message sent successfully');
                    resolve(data);
                } else {
                    console.error('LINE API Error:', res.statusCode, data);
                    reject(new Error(`LINE API returned status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('timeout', () => {
            clearTimeout(timeout);
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * リマインダーを送信済みとしてマーク
 */
async function markReminderAsSent(reminderId) {
    console.log(`Marking reminder as sent: ${reminderId}`);
    
    const params = {
        TableName: TABLE_NAME,
        Key: {
            reminderId: reminderId
        },
        UpdateExpression: 'SET #status = :status, #sentAt = :sentAt',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#sentAt': 'sentAt'
        },
        ExpressionAttributeValues: {
            ':status': 'sent',
            ':sentAt': new Date().toISOString()
        }
    };
    
    try {
        const command = new UpdateCommand(params);
        await dynamodb.send(command);
        console.log('Reminder marked as sent successfully');
    } catch (error) {
        console.error('Error updating reminder status:', error);
        throw error;
    }
}