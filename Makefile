dev:
  npm run dev
api:
  node server.js
docker:
  docker build -t nyt-mini .
run:
  docker run -p 3001:3001 nyt-mini
