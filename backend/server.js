// ═══════════════════════════════════════════════════════
// OceanOS Backend — Express + sql.js (SQLite) + WebSocket + Gemini
// ═══════════════════════════════════════════════════════

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Multer for image uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// ═══════════════════════════════════════════════════════
// DATABASE SETUP (sql.js)
// ═══════════════════════════════════════════════════════
let db;
const DB_PATH = path.join(__dirname, 'oceanos.db');

async function initDB() {
  const SQL = await initSqlJs();

  // Load existing db or create new
  let fileBuffer = null;
  if (fs.existsSync(DB_PATH)) {
    fileBuffer = fs.readFileSync(DB_PATH);
  }
  db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS plastic_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      weight_kg REAL DEFAULT 0,
      count INTEGER DEFAULT 1,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      location_x REAL,
      location_y REAL
    );
    CREATE TABLE IF NOT EXISTS drone_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT,
      confidence REAL DEFAULT 0.95,
      lat REAL,
      lng REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_illegal INTEGER DEFAULT 0,
      in_mpa INTEGER DEFAULT 0,
      resolved INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pollution_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT DEFAULT 'LOW',
      pollution_level REAL DEFAULT 0,
      oil_ppm REAL DEFAULT 0,
      location TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS river_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plastic_type TEXT NOT NULL,
      weight_kg REAL DEFAULT 0,
      fill_level REAL DEFAULT 0,
      flow_speed REAL DEFAULT 2.0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      source TEXT DEFAULT 'system',
      read INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS marine_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS fishing_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      lat REAL,
      lng REAL,
      radius REAL DEFAULT 5,
      type TEXT DEFAULT 'good',
      fish_density REAL DEFAULT 0.5,
      is_restricted INTEGER DEFAULT 0,
      reason TEXT,
      updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS fisherman_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fisherman_id TEXT NOT NULL,
      fisherman_name TEXT NOT NULL,
      credits INTEGER DEFAULT 0,
      nets_returned INTEGER DEFAULT 0,
      plastic_kg REAL DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS illegal_boats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vessel_name TEXT,
      vessel_type TEXT,
      lat REAL,
      lng REAL,
      speed_knots REAL,
      in_mpa INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS gemini_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT,
      result TEXT,
      is_debris INTEGER DEFAULT 0,
      confidence REAL DEFAULT 0,
      debris_type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDatabase();
  saveDB();
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-save periodically
setInterval(() => { if (db) saveDB(); }, 30000);

// Helper functions for sql.js
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let result = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  return { lastInsertRowid: dbGet('SELECT last_insert_rowid() as id')?.id };
}

// ═══════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════
function seedDatabase() {
  const check = dbGet('SELECT COUNT(*) as c FROM fishing_zones');
  if (check && check.c > 0) return;

  const zones = [
    ['Coral Reef Shallows', 14.55, -65.20, 8, 'excellent', 0.92, 0, null],
    ['Deep Trench Point', 14.48, -65.35, 6, 'good', 0.75, 0, null],
    ['Mangrove Bay', 14.60, -65.15, 5, 'excellent', 0.88, 0, null],
    ['Open Sea Zone A', 14.40, -65.50, 12, 'moderate', 0.55, 0, null],
    ['Turtle Nesting Area', 14.52, -65.08, 10, 'restricted', 0.30, 1, 'Marine Protected Area - Sea Turtle Nesting'],
    ['Whale Migration Path', 14.35, -65.40, 15, 'restricted', 0.20, 1, 'Seasonal Whale Migration Route'],
    ['Industrial Outflow Zone', 14.58, -65.28, 4, 'poor', 0.15, 1, 'Pollution from Industrial Waste'],
    ['Seagrass Meadow', 14.62, -65.22, 7, 'good', 0.68, 0, null],
    ['Rocky Outcrop', 14.45, -65.18, 5, 'good', 0.72, 0, null],
    ['Sandy Bottom Flats', 14.50, -65.30, 9, 'moderate', 0.45, 0, null],
  ];
  zones.forEach(z => dbRun('INSERT INTO fishing_zones (name,lat,lng,radius,type,fish_density,is_restricted,reason) VALUES (?,?,?,?,?,?,?,?)', z));

  const stats = [
    ['plastic_recovered_tonnes', 847.3, 'tonnes'],
    ['marine_lives_saved', 15420, 'animals'],
    ['co2_emissions_prevented', 2340, 'tonnes'],
    ['ocean_area_cleaned', 12500, 'sq_km'],
    ['illegal_boats_intercepted', 234, 'vessels'],
    ['oil_spills_contained', 18, 'incidents'],
    ['coral_reefs_protected', 45, 'reefs'],
    ['fishing_nets_recycled', 3200, 'nets'],
    ['species_monitored', 156, 'species'],
    ['drones_deployed', 12, 'units'],
  ];
  stats.forEach(s => dbRun('INSERT INTO marine_stats (metric,value,unit) VALUES (?,?,?)', s));

  const notifs = [
    ['Illegal Vessel Detected', 'Commercial trawler detected in MPA Zone B at 14.52N, 65.08W', 'danger', 'drone'],
    ['Oil Spill Alert', 'Minor oil leak detected near Industrial Zone - Buoy #7 triggered', 'warning', 'buoy'],
    ['Net Capacity Warning', 'River collection net at 85% capacity - Schedule maintenance', 'warning', 'river'],
    ['Plastic Patch Located', 'Large debris field spotted at 14.48N 65.35W - ~450kg estimated', 'info', 'drone'],
    ['System Update', 'Drone firmware v3.2.1 deployed successfully across fleet', 'info', 'system'],
    ['Marine Life Alert', 'Dolphin pod detected near active cleanup zone - Operations paused', 'warning', 'drone'],
  ];
  notifs.forEach(n => dbRun('INSERT INTO notifications (title,message,type,source) VALUES (?,?,?,?)', n));

  const boats = [
    ['Shadow Fisher', 'Trawler', 14.52, -65.09, 6.2, 1, 'active'],
    ['Night Hawk', 'Drift Netter', 14.53, -65.10, 4.8, 1, 'active'],
    ['Sea Ghost', 'Long Liner', 14.38, -65.42, 8.1, 0, 'monitoring'],
    ['Dark Tide', 'Purse Seiner', 14.55, -65.07, 3.5, 1, 'intercepted'],
  ];
  boats.forEach(b => dbRun('INSERT INTO illegal_boats (vessel_name,vessel_type,lat,lng,speed_knots,in_mpa,status) VALUES (?,?,?,?,?,?,?)', b));

  const sources = ['ocean_cleanup', 'river_net', 'beach_patrol', 'drone_guided'];
  const types = ['bottle', 'bag', 'container', 'fishing_net', 'fragment', 'styrofoam'];
  for (let i = 0; i < 50; i++) {
    dbRun('INSERT INTO plastic_collections (source,type,weight_kg,count) VALUES (?,?,?,?)', [
      sources[Math.floor(Math.random()*sources.length)],
      types[Math.floor(Math.random()*types.length)],
      +(Math.random()*5+0.1).toFixed(2),
      Math.floor(Math.random()*20+1)
    ]);
  }

  const fishermen = [
    ['F001', 'Ahmed Hassan', 1250, 15, 45.5],
    ['F002', 'Ravi Kumar', 890, 10, 32.0],
    ['F003', 'Carlos Silva', 2100, 25, 78.3],
    ['F004', 'Yuki Tanaka', 560, 7, 21.2],
    ['F005', 'Omar Ali', 1780, 20, 65.0],
  ];
  fishermen.forEach(f => dbRun('INSERT INTO fisherman_credits (fisherman_id,fisherman_name,credits,nets_returned,plastic_kg) VALUES (?,?,?,?,?)', f));

  saveDB();
  console.log('Database seeded successfully');
}

// ═══════════════════════════════════════════════════════
// GEMINI API
// ═══════════════════════════════════════════════════════
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function analyzeImageWithGemini(imageBase64, mimeType = 'image/jpeg') {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: "Analyze this image for marine debris, plastic waste, or ocean pollution. Respond in JSON format with: is_debris (boolean), confidence (0-1), debris_type (string), estimated_weight_kg (number), environmental_risk (LOW/MEDIUM/HIGH/CRITICAL), description (string), recommended_action (string)." },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]}],
        generationConfig: { temperature: 0.3, topP: 0.8, maxOutputTokens: 1024 }
      })
    });
    const data = await response.json();
    if (data.candidates?.[0]) {
      const text = data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return { is_debris: false, description: text, confidence: 0.5 };
    }
    return { error: 'No response from Gemini', is_debris: false };
  } catch (err) {
    return { error: err.message, is_debris: false };
  }
}

async function chatWithGemini(message) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `You are OceanOS AI Assistant, an expert in marine conservation, ocean health, fishing regulations, and environmental protection. Be helpful, concise, and provide actionable advice. User question: ${message}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
      })
    });
    const data = await response.json();
    if (data.candidates?.[0]) return data.candidates[0].content.parts[0].text;
    return 'Sorry, I could not process your request.';
  } catch (err) {
    return 'AI service unavailable: ' + err.message;
  }
}

// ═══════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════

app.get('/api/stats/overview', (req, res) => {
  const stats = dbAll('SELECT metric, value, unit FROM marine_stats');
  const plasticTotal = dbGet('SELECT SUM(weight_kg) as total FROM plastic_collections');
  const detectionCount = dbGet('SELECT COUNT(*) as c FROM drone_detections');
  const illegalCount = dbGet("SELECT COUNT(*) as c FROM illegal_boats WHERE status = 'active'");
  const pollutionCount = dbGet('SELECT COUNT(*) as c FROM pollution_events WHERE resolved = 0');
  const unreadNotifs = dbGet('SELECT COUNT(*) as c FROM notifications WHERE read = 0');
  res.json({ stats, plasticTotal: plasticTotal?.total || 0, detectionCount: detectionCount?.c || 0, illegalBoats: illegalCount?.c || 0, activePollution: pollutionCount?.c || 0, unreadNotifications: unreadNotifs?.c || 0 });
});

app.get('/api/plastic', (req, res) => {
  const data = dbAll('SELECT * FROM plastic_collections ORDER BY timestamp DESC LIMIT 100');
  const bySource = dbAll('SELECT source, SUM(weight_kg) as total, SUM(count) as items FROM plastic_collections GROUP BY source');
  const byType = dbAll('SELECT type, SUM(weight_kg) as total, SUM(count) as items FROM plastic_collections GROUP BY type');
  res.json({ data, bySource, byType });
});

app.post('/api/plastic', (req, res) => {
  const { source, type, weight_kg, count, location_x, location_y } = req.body;
  const result = dbRun('INSERT INTO plastic_collections (source,type,weight_kg,count,location_x,location_y) VALUES (?,?,?,?,?,?)', [source, type, weight_kg||0, count||1, location_x, location_y]);
  broadcastWS({ type: 'plastic_collected', data: req.body });
  saveDB();
  res.json({ id: result.lastInsertRowid });
});

app.get('/api/detections', (req, res) => res.json(dbAll('SELECT * FROM drone_detections ORDER BY timestamp DESC LIMIT 50')));

app.post('/api/detections', (req, res) => {
  const { type, name, confidence, lat, lng, is_illegal, in_mpa } = req.body;
  const result = dbRun('INSERT INTO drone_detections (type,name,confidence,lat,lng,is_illegal,in_mpa) VALUES (?,?,?,?,?,?,?)', [type, name, confidence||0.95, lat, lng, is_illegal||0, in_mpa||0]);
  if (is_illegal) addNotification('Illegal Activity', `${name||'Unknown vessel'} detected`, 'danger', 'drone');
  broadcastWS({ type: 'detection', data: req.body });
  saveDB();
  res.json({ id: result.lastInsertRowid });
});

app.get('/api/pollution', (req, res) => res.json(dbAll('SELECT * FROM pollution_events ORDER BY timestamp DESC LIMIT 50')));

app.post('/api/pollution', (req, res) => {
  const { type, severity, pollution_level, oil_ppm, location } = req.body;
  const result = dbRun('INSERT INTO pollution_events (type,severity,pollution_level,oil_ppm,location) VALUES (?,?,?,?,?)', [type, severity||'LOW', pollution_level||0, oil_ppm||0, location]);
  if (severity === 'HIGH' || severity === 'CRITICAL') addNotification('Pollution Alert', `${severity} ${type} at ${location}`, 'danger', 'buoy');
  broadcastWS({ type: 'pollution', data: req.body });
  saveDB();
  res.json({ id: result.lastInsertRowid });
});

app.get('/api/river', (req, res) => {
  const data = dbAll('SELECT * FROM river_collections ORDER BY timestamp DESC LIMIT 100');
  const total = dbGet('SELECT SUM(weight_kg) as total FROM river_collections');
  res.json({ data, totalKg: total?.total || 0 });
});

app.post('/api/river', (req, res) => {
  const { plastic_type, weight_kg, fill_level, flow_speed } = req.body;
  dbRun('INSERT INTO river_collections (plastic_type,weight_kg,fill_level,flow_speed) VALUES (?,?,?,?)', [plastic_type, weight_kg||0, fill_level||0, flow_speed||2.0]);
  if (fill_level > 85) addNotification('Net Warning', `River net at ${fill_level?.toFixed(0)}% capacity`, 'warning', 'river');
  broadcastWS({ type: 'river_collection', data: req.body });
  saveDB();
  res.json({ success: true });
});

app.get('/api/notifications', (req, res) => res.json(dbAll('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 50')));

app.put('/api/notifications/:id/read', (req, res) => { dbRun('UPDATE notifications SET read = 1 WHERE id = ?', [+req.params.id]); saveDB(); res.json({ success: true }); });

app.put('/api/notifications/read-all', (req, res) => { dbRun('UPDATE notifications SET read = 1'); saveDB(); res.json({ success: true }); });

app.get('/api/fishing-zones', (req, res) => res.json(dbAll('SELECT * FROM fishing_zones ORDER BY fish_density DESC')));

app.get('/api/fisherman/credits', (req, res) => res.json(dbAll('SELECT * FROM fisherman_credits ORDER BY credits DESC')));

app.post('/api/fisherman/return-net', (req, res) => {
  const { fisherman_id, fisherman_name, plastic_kg } = req.body;
  const credits = Math.floor((plastic_kg || 1) * 25);
  const existing = dbGet('SELECT * FROM fisherman_credits WHERE fisherman_id = ?', [fisherman_id]);
  if (existing) {
    dbRun('UPDATE fisherman_credits SET credits = credits + ?, nets_returned = nets_returned + 1, plastic_kg = plastic_kg + ? WHERE fisherman_id = ?', [credits, plastic_kg||0, fisherman_id]);
  } else {
    dbRun('INSERT INTO fisherman_credits (fisherman_id,fisherman_name,credits,nets_returned,plastic_kg) VALUES (?,?,?,1,?)', [fisherman_id, fisherman_name||'Anonymous', credits, plastic_kg||0]);
  }
  addNotification('Net Returned', `${fisherman_name||'A fisherman'} returned nets (+${credits} credits)`, 'info', 'fisherman');
  saveDB();
  const updated = dbGet('SELECT * FROM fisherman_credits WHERE fisherman_id = ?', [fisherman_id]);
  res.json({ credits_earned: credits, total: updated?.credits || credits });
});

app.get('/api/illegal-boats', (req, res) => res.json(dbAll('SELECT * FROM illegal_boats ORDER BY last_seen DESC')));

app.post('/api/illegal-boats', (req, res) => {
  const { vessel_name, vessel_type, lat, lng, speed_knots, in_mpa } = req.body;
  const result = dbRun('INSERT INTO illegal_boats (vessel_name,vessel_type,lat,lng,speed_knots,in_mpa) VALUES (?,?,?,?,?,?)', [vessel_name, vessel_type, lat, lng, speed_knots, in_mpa||0]);
  addNotification('Illegal Vessel', `${vessel_name||'Unknown'} (${vessel_type}) spotted`, 'danger', 'drone');
  saveDB();
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/gemini/analyze', upload.single('image'), async (req, res) => {
  try {
    let imageBase64, mimeType;
    if (req.file) {
      imageBase64 = fs.readFileSync(req.file.path).toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
      fs.unlinkSync(req.file.path);
    } else if (req.body.image) {
      const matches = req.body.image.match(/^data:(.+);base64,(.+)$/);
      if (matches) { mimeType = matches[1]; imageBase64 = matches[2]; }
      else { imageBase64 = req.body.image; mimeType = 'image/jpeg'; }
    } else return res.status(400).json({ error: 'No image' });

    const result = await analyzeImageWithGemini(imageBase64, mimeType);
    dbRun('INSERT INTO gemini_analyses (result,is_debris,confidence,debris_type) VALUES (?,?,?,?)', [JSON.stringify(result), result.is_debris?1:0, result.confidence||0, result.debris_type||null]);
    if (result.is_debris) addNotification('AI Debris Detection', `${result.debris_type||'Debris'} found (${Math.round((result.confidence||0)*100)}%)`, 'warning', 'gemini');
    saveDB();
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gemini/chat', async (req, res) => {
  if (!req.body.message) return res.status(400).json({ error: 'No message' });
  const reply = await chatWithGemini(req.body.message);
  res.json({ reply });
});

app.post('/api/stats/update', (req, res) => {
  const { metric, value } = req.body;
  const existing = dbGet('SELECT * FROM marine_stats WHERE metric = ?', [metric]);
  if (existing) dbRun('UPDATE marine_stats SET value = ? WHERE metric = ?', [value, metric]);
  else dbRun('INSERT INTO marine_stats (metric,value) VALUES (?,?)', [metric, value]);
  broadcastWS({ type: 'stat_update', data: { metric, value } });
  saveDB();
  res.json({ success: true });
});

function addNotification(title, message, type, source) {
  dbRun('INSERT INTO notifications (title,message,type,source) VALUES (?,?,?,?)', [title, message, type, source]);
  broadcastWS({ type: 'notification', data: { title, message, type, source, timestamp: new Date().toISOString() } });
}

// ═══════════════════════════════════════════════════════
// HTTP + WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log('WebSocket client connected');
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
  const stats = dbAll('SELECT metric, value, unit FROM marine_stats');
  ws.send(JSON.stringify({ type: 'init', data: { stats } }));
});

function broadcastWS(message) {
  const msg = JSON.stringify(message);
  wsClients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// Periodic sim data broadcast
setInterval(() => {
  broadcastWS({ type: 'sim_update', data: {
    ocean_cleanup: { plastic_collected_session: +(Math.random()*2).toFixed(2), debris_in_boom: Math.floor(Math.random()*30), wind_speed: +(10+Math.random()*10).toFixed(1), wave_height: +(0.5+Math.random()*2).toFixed(1) },
    drone: { altitude: Math.floor(80+Math.random()*60), battery: Math.floor(70+Math.random()*28), targets_detected: Math.floor(Math.random()*5) },
    pollution: { pollution_level: +(Math.random()*30).toFixed(1), oil_ppm: Math.floor(Math.random()*100), water_quality: Math.random()>0.7?'POOR':'GOOD' },
    river: { fill_level: +(Math.random()*100).toFixed(1), flow_speed: +(1.5+Math.random()*2).toFixed(1), collected_count: Math.floor(Math.random()*10) }
  }});
}, 5000);

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════
async function start() {
  await initDB();
  server.listen(PORT, () => {
    console.log(`\n  OceanOS Backend running at http://localhost:${PORT}`);
    console.log(`  WebSocket at ws://localhost:${PORT}`);
    console.log(`  Database: ${DB_PATH}\n`);
  });
}

start();
