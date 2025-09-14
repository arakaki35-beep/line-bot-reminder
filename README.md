# LINE BOT Reminder System

日本語の自然言語でリマインダーを設定できるLINE BOTシステムです。

## 🚀 機能

- **自然言語での日時指定**: 「明日の朝8時にゴミ出し」のような自然な日本語でリマインダーを設定
- **柔軟な日時パターン対応**: 
  - 「明日の朝8時に〜」
  - 「今日の15時に〜」
  - 「2025年9月15日 14:30に〜」
  - 「来週の月曜日 9時に〜」
- **正確なタイムゾーン処理**: 日本時間（JST）での設定・表示
- **自動通知**: 指定時刻にLINE経由でリマインダーを送信

## 🏗️ システム構成

```
LINE Messaging API → API Gateway → Lambda (Message Handler) → DynamoDB
                                         ↓
EventBridge Schedule → Lambda (Reminder Sender) → LINE Push Message API
```

### 使用AWS サービス
- **AWS Lambda**: メッセージ処理・リマインダー送信
- **Amazon API Gateway**: LINE Webhook受信
- **Amazon DynamoDB**: リマインダーデータ保存
- **Amazon EventBridge**: 定期実行スケジュール

## 📋 セットアップ

### 1. 前提条件
- AWSアカウント
- LINE Developer アカウント
- LINE Messaging API チャンネル

### 2. DynamoDBテーブル作成
```bash
テーブル名: line-bot-reminders
パーティションキー: reminderId (String)
```

### 3. Lambda関数のデプロイ

#### メッセージハンドラー
```bash
cd lambda/message-handler
# Lambda関数を作成し、index.jsをアップロード
```

#### リマインダー送信
```bash
cd lambda/reminder-sender  
# Lambda関数を作成し、index.jsをアップロード
```

### 4. 環境変数設定
両方のLambda関数に以下を設定:
```
LINE_ACCESS_TOKEN=your_line_access_token
AWS_REGION=ap-northeast-1
```

### 5. IAM権限
Lambda実行ロールに以下を付与:
- `AmazonDynamoDBFullAccess`（開発用）
- 基本Lambda実行権限

### 6. API Gateway設定
- HTTPSエンドポイント作成
- Lambdaプロキシ統合を有効化
- WebhookURLをLINE Developer Consoleに設定

### 7. EventBridge設定
- スケジュール: `rate(1 minute)`
- ターゲット: reminder-sender Lambda関数

## 💬 使い方

LINE BOTに以下のようなメッセージを送信:

```
明日の朝8時にゴミ出し
今日の15時にミーティング
2025年12月25日 10:00にクリスマス準備
来週の月曜日 9時に病院の予約
```

## 📝 データ構造

### DynamoDBアイテム例
```json
{
  "reminderId": "uuid-12345",
  "userId":