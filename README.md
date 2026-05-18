<div align="center">
  <div style="display: flex; justify-content: center; align-items: center; padding: 20px;">
    <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/film.svg" width="80" alt="Logo">
  </div>

  <h1>🎬 Watch Together</h1>
  <p><strong>A modern, real-time synchronized video-watching platform with P2P voice, encrypted chat, and AI.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/React-18-blue.svg?style=for-the-badge&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/Vite-5-purple.svg?style=for-the-badge&logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/Socket.io-4.8-black.svg?style=for-the-badge&logo=socket.io" alt="Socket.io" />
    <img src="https://img.shields.io/badge/WebRTC-P2P-blue.svg?style=for-the-badge&logo=webrtc" alt="WebRTC" />
    <img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC.svg?style=for-the-badge&logo=tailwind-css" alt="Tailwind CSS" />
  </p>
</div>

---

## ✨ Features

- **📺 Universal Playback**: Syncs direct links (MP4, WebM), HLS streams (.m3u8), YouTube, and Vimeo flawlessly.
- **🔒 Secure & Private**: End-to-end Encrypted text chat (AES-GCM), optional password-protected rooms, and strict security headers.
- **🎙️ P2P Voice Chat**: Crystal-clear voice chat with your friends powered by WebRTC (zero latency, no central audio server routing).
- **🤖 AI Assistant**: Built-in chat assistant powered by OpenRouter / Gemini to summarize conversations, suggest movies, or answer questions.
- **🎭 Highly Interactive**: Emoji reactions, programmatic notification sounds, double-click seek (-10s / +10s), and a network latency quality badge.
- **🎬 Immersive Experience**: Theater mode (`T`), Picture-in-Picture (`P`), and full-screen support with auto-hiding controls.
- **⚡ Ultra-Low Latency**: Built on a highly optimized custom Socket.IO relay architecture for pixel-perfect sync.

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/0xkhass/watch-together.git
cd watch-together
npm install
```

### 2. Environment Setup

**Client (`packages/client/.env`)**
```env
# Leave VITE_SERVER_URL empty to auto-detect from browser hostname (works seamlessly on LAN)
# VITE_SERVER_URL=http://localhost:3001

# AI Provider (Optional)
VITE_OPENROUTER_API_KEY=your_openrouter_key
# VITE_GEMINI_API_KEY=your_gemini_key
```

**Server (`packages/server/.env`)**
```env
PORT=3001
CLIENT_URL=http://localhost:5173
```

### 3. Run the Application
```bash
npm run dev
```
*This command concurrently starts the backend relay server and the Vite frontend.*

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :---: | --- |
| `Space` / `K` | Play / Pause |
| `←` / `→` | Seek backward / forward 10 seconds |
| `M` | Mute / Unmute audio |
| `F` | Toggle Fullscreen |
| `T` | Toggle Theater Mode |
| `P` | Toggle Picture-in-Picture |

---

<div align="center">
  <p>Crafted with 🖤 by <strong><a href="https://github.com/0xkhass">0xkhass</a></strong></p>
</div>
