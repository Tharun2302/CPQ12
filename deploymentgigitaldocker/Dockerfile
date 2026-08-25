FROM node:20-alpine

RUN apk add --no-cache \
    libreoffice \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    ttf-opensans \
    curl \
  && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ARG VITE_BACKEND_URL
ARG VITE_MSAL_CLIENT_ID
ARG VITE_MSAL_REDIRECT_URI
ARG VITE_CLARITY_ID
ARG VITE_HOTJAR_ID

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_MSAL_CLIENT_ID=${VITE_MSAL_CLIENT_ID}
ENV VITE_MSAL_REDIRECT_URI=${VITE_MSAL_REDIRECT_URI}
ENV VITE_CLARITY_ID=${VITE_CLARITY_ID}
# Baked into the bundle by `npm run build` below; blank here means Hotjar never loads.
ENV VITE_HOTJAR_ID=${VITE_HOTJAR_ID}

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

RUN npm prune --omit=dev

EXPOSE 3001

CMD ["npm", "start"]

