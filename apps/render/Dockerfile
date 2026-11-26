# Image tag must match the "playwright" version in package.json (1.61.1).
FROM mcr.microsoft.com/playwright:v1.61.1-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY render.mjs server.mjs ./
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.mjs"]
