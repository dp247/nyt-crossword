# 🧩 NYT Mini Crossword (Unofficial Web App)

Play any New York Times Mini Crossword in a polished, game-like web app.  
Built with **React + Tailwind CSS** on the frontend and an **Express proxy** backend that fetches JSON.

---

## ✨ Features

- ⬜ Dynamic crossword grid (supports 5×5, 6×6, and specials)
- 🔀 Random puzzle loader
- 🕒 Built-in timer with Start / Pause / Resume
- 👀 Clues hidden until the timer starts (then re-hidden on pause)
- ✅ Answer checking (correct = grey, wrong = red, blank = white)
- ⌨️ Keyboard navigation:
  - Arrow keys move caret
  - Typing auto-advances
  - Backspace clears/moves back
  - Space/Tab toggles Across/Down
  - Home/End jumps to start/end of word
- 🎉 Surprise ending

---

## 🛠️ Tech Stack

**Frontend**
- React (via Vite)
- React Router
- Tailwind CSS

**Backend**
- Node.js + Express
- In-memory cache (1 hour TTL)
- Proxy headers required by NYT API

**Build Tools**
- Vite proxy in dev
- Docker for easy distribution

---

## 🚀 Getting Started (Local Dev)

Clone and install dependencies:

```bash
git clone https://github.com/dp247/nyt-crossword.git
cd <repo>
npm install
```

Run:

```bash
node server.js
npm run dev
```
