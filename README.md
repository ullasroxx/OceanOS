<div align="center">

<img src="https://img.shields.io/badge/OceanOS-Marine%20Conservation%20Platform-0ea5e9?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNCIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNNiAxOCBRMTAgMTIgMTYgMTYgUTIyIDIwIDI2IDE0IiBzdHJva2U9IiM2MGE1ZmEiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==" alt="OceanOS" />

# OceanOS

**A full-stack, real-time ocean health monitoring and conservation management system powered by AI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js)](https://nodejs.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Gemini AI](https://img.shields.io/badge/Powered%20by-Gemini%20AI-4285F4?logo=google)](https://aistudio.google.com)
[![Three.js](https://img.shields.io/badge/3D-Three.js-black?logo=three.js)](https://threejs.org)

</div>

---

## Overview

OceanOS is an integrated marine conservation platform that simulates, monitors, and manages ocean cleanup operations in real time. It combines a Node.js backend, an interactive admin dashboard, a fisherman incentive app, and multiple standalone 3D simulations — all communicating via WebSockets and a REST API.

Built with a local-first approach using `sql.js` for zero-dependency database storage, OceanOS is designed to run entirely on your machine with no cloud infrastructure required (except for the Gemini AI feature).

---

## Project Structure

```
OceanOS/
│
├── backend/                 # Express.js REST API + WebSocket server
│   ├── server.js            # Main server (API routes, DB, WebSocket, Gemini)
│   ├── package.json
│   ├── .env                 # Your API key goes here (not committed)
│   └── .env.example         # Template for .env
│
├── dashboard/               # Admin monitoring dashboard (HTML/CSS/JS)
│   ├── index.html
│   ├── app.js               # Dashboard logic, charts, WebSocket client
│   └── style.css
│
├── fisherman-app/           # Fisherman incentive & reporting app (HTML/CSS/JS)
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── simulation/              # MAIN Unified 3D world simulation (Three.js)
│   ├── index.html           # Connected to backend, dashboard & fisherman app
│   └── world.js             # Full world engine
│
├── ocean-drone-sim/         # Standalone: Drone patrol simulation
│   ├── index.html
│   ├── main.js
│   └── style.css
│
├── ocean-pollution-sim/     # Standalone: Ocean pollution simulation
│   ├── index.html
│   ├── main.js
│   └── style.css
│
├── river simulator/         # Standalone: River plastic collection sim (Vite/TS)
│   ├── index.html
│   ├── main.js
│   ├── src/
│   └── package.json
│
├── ocean clean/             # Standalone: Ocean boom cleanup sim (Vite/TS)
│   ├── index.html
│   ├── main.js
│   ├── src/
│   └── package.json
│
├── flowchart.html           # Interactive system architecture flowchart
├── start-all.ps1            # One-click startup script (Windows PowerShell)
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```

---

## Features

| Feature | Description |
|---|---|
| **Unified 3D Simulation** | Three.js world with ocean cleanup boom, drone patrols, river nets & oil spills |
| **Admin Dashboard** | Real-time charts (Chart.js), stat cards, live WebSocket feed |
| **Fisherman App** | Credit system for fishermen who return nets & report debris |
| **Gemini AI** | Image-based marine debris detection + conversational AI assistant |
| **Illegal Fishing Tracker** | Real-time vessel monitoring with MPA zone violation detection |
| **Pollution Monitor** | Oil spill detection, chemical composition analysis, buoy alerts |
| **Live Notifications** | WebSocket-driven alerts across all connected clients |
| **Local Database** | `sql.js` SQLite — no external DB required |
| **WebSocket Feed** | Live data broadcast every 5 seconds across all modules |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **v18 or higher**
- A modern browser (Chrome, Firefox, Edge)
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) *(free)*

---

### 1. Clone the Repository

```bash
git clone (https://github.com/ullasroxx/OceanOS.git) 
cd 
```

---

### 2. Set Up the Backend

```bash
cd backend
npm install
```

Copy the environment template and add your Gemini API key:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and replace the placeholder:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

---

### 3. Start the Full Platform (Windows)

From the project root, run the PowerShell startup script:

```powershell
.\start-all.ps1
```

This will launch 4 services simultaneously:

| Service | URL | Port |
|---|---|---|
| Backend API | http://localhost:3001 | 3001 |
| Dashboard | http://localhost:3002 | 3002 |
| Fisherman App | http://localhost:3003 | 3003 |
| 3D Simulation | http://localhost:3004 | 3004 |

The script will automatically open the dashboard in your browser.

---

### 4. Manual Start (macOS / Linux / Alternative)

Open 4 separate terminal windows and run each of the following:

**Terminal 1 — Backend:**
```bash
cd backend
node server.js
```

**Terminal 2 — Dashboard:**
```bash
cd dashboard
npx serve -l 3002
```

**Terminal 3 — Fisherman App:**
```bash
cd fisherman-app
npx serve -l 3003
```

**Terminal 4 — Main Simulation:**
```bash
cd simulation
npx serve -l 3004
```

---

## Running Standalone Simulations

The standalone simulations are independent — they do not require the backend or other services to run. Open them directly in your browser or use a simple file server.

### Option A: Open Directly in Browser
Just double-click the `index.html` file inside each folder.

### Option B: Use a Local Server (recommended)

```bash
# Drone Patrol Simulation
cd ocean-drone-sim
npx serve .

# Ocean Pollution Simulation
cd ocean-pollution-sim
npx serve .

# River Collector Simulation (Node.js required)
cd "river simulator"
npm install
npm run dev

# Ocean Cleanup Boom Simulation (Node.js required)
cd "ocean clean"
npm install
npm run dev
```

| Simulation | Backend Required | Description |
|---|---|---|
| `ocean-drone-sim` | No | Standalone drone patrol over ocean with detection events |
| `ocean-pollution-sim` | No | Standalone oil spill & chemical pollution visualizer |
| `river simulator` | No | Standalone river plastic collection net simulator |
| `ocean clean` | No | Standalone ocean boom cleanup system |
| `simulation` | Yes | Full unified world — posts data to backend, links to dashboard & fisherman app |

---

## API Reference

The backend exposes a REST API at `http://localhost:3001`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stats/overview` | Platform-wide stats summary |
| GET/POST | `/api/plastic` | Plastic collection records |
| GET/POST | `/api/detections` | Drone detection events |
| GET/POST | `/api/pollution` | Pollution events |
| GET/POST | `/api/river` | River net collection data |
| GET | `/api/fishing-zones` | Fishing zone map data |
| GET | `/api/fisherman/credits` | Fisherman credit leaderboard |
| POST | `/api/fisherman/return-net` | Log a net return & award credits |
| GET/POST | `/api/illegal-boats` | Illegal vessel records |
| GET | `/api/notifications` | Notification feed |
| PUT | `/api/notifications/:id/read` | Mark notification as read |
| POST | `/api/gemini/analyze` | AI debris image analysis |
| POST | `/api/gemini/chat` | AI chat assistant |

**WebSocket:** Connect to `ws://localhost:3001` for live event streaming.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js, WebSocket (`ws`) |
| **Database** | `sql.js` (SQLite in-memory, file-persisted) |
| **AI** | Google Gemini 2.5 Flash |
| **3D Graphics** | Three.js (WebGL) |
| **Charts** | Chart.js |
| **Simulations** | Vanilla Canvas 2D + Three.js |
| **Standalone Sims** | Vite + TypeScript |
| **Frontend** | Vanilla HTML / CSS / JavaScript |
| **File Uploads** | Multer |

---

## Architecture Flowchart

Open `flowchart.html` in your browser to see an interactive visual diagram of the full system architecture — data flows, API connections, WebSocket events, and module relationships.

---

## Security

- API keys are stored in `backend/.env` and are never committed to the repository.
- `.env.example` is provided as a safe template.
- The database file (`oceanos.db`) is also excluded from version control.

---

## Contributing

Contributions are welcome! Please read `CONTRIBUTING.md` before submitting a pull request.

---

## License

This project is licensed under the MIT License — see the LICENSE file for details.

---

<div align="center">

Made by **Team Numero Uno**

*Building technology for a cleaner ocean.*

</div>
