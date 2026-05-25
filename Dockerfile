# 1. ベースとなるOS（軽量で安全なNode.js環境）
FROM node:22-alpine

# ★ 追加: コンテナ内にGitをインストール
RUN apk add --no-cache git

# 2. コンテナ内の作業ディレクトリを指定
WORKDIR /app

# 3. パッケージ情報を先にコピーしてインストール（ビルド高速化のため）
COPY package*.json ./
RUN npm install

# 4. プロジェクトの全ファイルをコンテナにコピー
COPY . .

# 5. Cloudflare Pagesのローカルサーバー（Wrangler）が使うポートを開放
EXPOSE 8787

# 6. コンテナ起動時に実行するコマンド（外部からアクセスできるよう --ip 0.0.0.0 を指定）
CMD ["npx", "wrangler", "pages", "dev", ".", "--port", "8787", "--ip", "0.0.0.0"]