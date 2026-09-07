# VOC Smash デモ

## ローカル開発

1. [Google Cloud Console](https://console.cloud.google.com/) で **Places API (New)** を有効化し、APIキーを発行
2. このフォルダに `.env` ファイルを作成：

```env
GOOGLE_PLACES_API_KEY=あなたのAPIキー
```

3. 依存関係をインストールして起動：

```bash
npm install
npm start
```

4. ブラウザで http://localhost:3000 を開く

## Vercel へデプロイ

WPX など Node.js が使えないレンタルサーバーの場合は、Vercel へデプロイしてください。

1. [Vercel](https://vercel.com/) にログイン
2. 「Add New Project」→ この Git リポジトリを選択
3. 「Environment Variables」に以下を追加：
   - `GOOGLE_PLACES_API_KEY` = あなたのAPIキー
4. 「Deploy」

デプロイ後、Vercel のドメイン（例：`https://voc-smash-demo.vercel.app`）でアクセスできます。

## 注意

- `.env` は Git に含めないでください
- APIキーはサーバー側（`api/place.js` / `server.js`）で管理し、フロントエンドに露出しないようにしてください
- GoogleマップURLは「共有」でコピーした `maps.app.goo.gl` 形式、またはブラウザアドレスバーの長いURLの両方に対応しています
