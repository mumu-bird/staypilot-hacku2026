FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npx playwright install ffmpeg
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 CHROME_PATH=/usr/bin/chromium
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/ready');process.exit(r.ok?0:1)"
EXPOSE 4173
CMD ["npm", "start"]
