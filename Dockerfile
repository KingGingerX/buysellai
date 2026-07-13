FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY package.json ./
COPY assets ./assets
COPY docs ./docs
COPY scripts ./scripts
COPY src ./src
COPY index.html manifest.webmanifest README.md ./

RUN mkdir -p data

EXPOSE 4173

CMD ["npm", "run", "start"]
