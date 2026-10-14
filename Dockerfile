FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
ARG VITE_API_BASE_URL=/api
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN chmod +x node_modules/.bin/* 2>/dev/null; npx vite build
EXPOSE 30050
ENV NODE_ENV=production
ENV PORT=30050
CMD ["node", "server/index.js"]
