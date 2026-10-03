FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npx playwright install ffmpeg
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 CHROME_PATH=/usr/bin/chromium
EXPOSE 4173
CMD ["npm", "start"]
