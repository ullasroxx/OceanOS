// ═══════════════════════════════════════════════════════
// FisherGuard — Fisherman App Logic
// ═══════════════════════════════════════════════════════

const API = 'http://localhost:3001/api';
const FISHER_ID = 'F001';
const FISHER_NAME = 'Ahmed Hassan';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const state = {
  zones: [],
  credits: 0,
  leaderboard: [],
  notifications: []
};

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Hide splash
  setTimeout(() => document.getElementById('splash-screen').classList.add('hidden'), 1800);

  setupNav();
  setupQuickActions();
  setupReturnNet();
  setupAIChat();
  setupCatchUpload();
  setGreeting();

  loadFishingZones();
  loadLeaderboard();
  loadAlerts();
  loadCredits();

  // Refresh periodically
  setInterval(loadAlerts, 30000);
});

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');

      if (tab === 'map') drawMap();
    });
  });

  document.getElementById('btn-notif-header').addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-tab[data-tab="alerts"]').classList.add('active');
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-alerts').classList.add('active');
  });
}

function setupQuickActions() {
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.goto;
      const navBtn = document.querySelector(`.nav-tab[data-tab="${tab}"]`);
      if (navBtn) navBtn.click();
    });
  });
}

function setGreeting() {
  const h = new Date().getHours();
  let g = 'Good Evening';
  if (h < 12) g = 'Good Morning';
  else if (h < 17) g = 'Good Afternoon';
  document.getElementById('greeting').textContent = g;
}

// ═══════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════
async function loadFishingZones() {
  try {
    const res = await fetch(`${API}/fishing-zones`);
    state.zones = await res.json();
    renderBestSpots();
    renderWarnings();
    renderIllegalZones();
  } catch (e) {
    console.log('API not available:', e.message);
    // Fallback data
    state.zones = [
      { name: 'Coral Reef Shallows', type: 'excellent', fish_density: 0.92, is_restricted: 0, lat: 14.55, lng: -65.20 },
      { name: 'Mangrove Bay', type: 'excellent', fish_density: 0.88, is_restricted: 0, lat: 14.60, lng: -65.15 },
      { name: 'Deep Trench Point', type: 'good', fish_density: 0.75, is_restricted: 0, lat: 14.48, lng: -65.35 },
      { name: 'Seagrass Meadow', type: 'good', fish_density: 0.68, is_restricted: 0, lat: 14.62, lng: -65.22 },
      { name: 'Turtle Nesting Area', type: 'restricted', fish_density: 0.30, is_restricted: 1, reason: 'Marine Protected Area', lat: 14.52, lng: -65.08 },
    ];
    renderBestSpots();
    renderWarnings();
    renderIllegalZones();
  }
}

async function loadLeaderboard() {
  try {
    const res = await fetch(`${API}/fisherman/credits`);
    state.leaderboard = await res.json();
    renderLeaderboard();
  } catch (e) {
    state.leaderboard = [
      { fisherman_name: 'Carlos Silva', credits: 2100 },
      { fisherman_name: 'Omar Ali', credits: 1780 },
      { fisherman_name: 'Ahmed Hassan', credits: 1250 },
      { fisherman_name: 'Ravi Kumar', credits: 890 },
      { fisherman_name: 'Yuki Tanaka', credits: 560 },
    ];
    renderLeaderboard();
  }
}

async function loadAlerts() {
  try {
    const res = await fetch(`${API}/notifications`);
    state.notifications = await res.json();
    renderAlerts();
    const unread = state.notifications.filter(n => !n.read).length;
    document.getElementById('alert-count').textContent = unread;
  } catch (e) {
    console.log('Alerts unavailable');
  }
}

async function loadCredits() {
  try {
    const res = await fetch(`${API}/fisherman/credits`);
    const data = await res.json();
    const me = data.find(f => f.fisherman_id === FISHER_ID);
    if (me) {
      state.credits = me.credits;
      document.getElementById('total-credits').textContent = me.credits.toLocaleString();
      document.getElementById('home-credits').textContent = me.credits.toLocaleString();
      document.getElementById('home-nets').textContent = me.nets_returned;
    }
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════
function renderBestSpots() {
  const container = document.getElementById('best-spots');
  const goodZones = state.zones.filter(z => !z.is_restricted).sort((a, b) => b.fish_density - a.fish_density).slice(0, 4);

  container.innerHTML = goodZones.map(z => `
    <div class="spot-card">
      <div class="spot-icon ${z.type}">
        ${z.type === 'excellent' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' :
          z.type === 'good' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>' :
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}
      </div>
      <div class="spot-info">
        <div class="spot-name">${z.name}</div>
        <div class="spot-meta">${z.lat?.toFixed(2) || '--'}N, ${Math.abs(z.lng || 0).toFixed(2)}W | ${(Math.random() * 10 + 2).toFixed(1)} km away</div>
      </div>
      <div class="spot-density">${Math.round(z.fish_density * 100)}%</div>
    </div>
  `).join('');
}

function renderWarnings() {
  const container = document.getElementById('home-warnings');
  const restricted = state.zones.filter(z => z.is_restricted);

  container.innerHTML = restricted.map(z => `
    <div class="warning-card">
      <div class="warning-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div class="warning-text">
        <div class="warning-title">${z.name}</div>
        <div class="warning-desc">${z.reason || 'Restricted Zone - Do Not Enter'}</div>
      </div>
    </div>
  `).join('');
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard');
  const ranks = ['gold', 'silver', 'bronze'];

  container.innerHTML = state.leaderboard.slice(0, 5).map((f, i) => `
    <div class="leader-row">
      <div class="leader-rank ${ranks[i] || 'default'}">${i + 1}</div>
      <div class="leader-name">${f.fisherman_name}</div>
      <div class="leader-credits">${f.credits.toLocaleString()} pts</div>
    </div>
  `).join('');
}

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  if (!container) return;

  container.innerHTML = state.notifications.slice(0, 10).map(n => `
    <div class="alert-card ${n.type}">
      <div class="alert-title">${n.title}</div>
      <div class="alert-msg">${n.message}</div>
      <div class="alert-meta">
        <span class="alert-tag ${n.type}">${n.type}</span>
        <span style="font-size:11px; color: var(--text3)">${n.source} | ${formatTime(n.timestamp)}</span>
      </div>
    </div>
  `).join('');
}

function renderIllegalZones() {
  const container = document.getElementById('illegal-zones');
  if (!container) return;
  const restricted = state.zones.filter(z => z.is_restricted);

  container.innerHTML = restricted.map(z => `
    <div class="illegal-zone-card">
      <div class="zone-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      </div>
      <div class="zone-info">
        <div class="zone-name">${z.name}</div>
        <div class="zone-reason">${z.reason || 'Fishing Prohibited'} | ${z.lat?.toFixed(2) || '--'}N, ${Math.abs(z.lng || 0).toFixed(2)}W</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════
function drawMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;

  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');

  // Ocean background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0a1628');
  grad.addColorStop(0.5, '#0d1f3c');
  grad.addColorStop(1, '#0a1628');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(30,42,69,0.4)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Draw zones
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const scale = 20;

  state.zones.forEach(z => {
    if (!z.lat || !z.lng) return;
    const x = centerX + (z.lng + 65.25) * scale * 30;
    const y = centerY - (z.lat - 14.52) * scale * 30;
    const r = (z.radius || 5) * 2;

    // Zone circle
    const colors = {
      excellent: '#22c55e',
      good: '#3b82f6',
      moderate: '#f97316',
      restricted: '#ef4444',
      poor: '#ef4444'
    };

    const color = colors[z.type] || '#3b82f6';

    // Glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    glow.addColorStop(0, color + '30');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '25';
    ctx.fill();
    ctx.strokeStyle = color + '80';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(z.name, x, y + r + 14);

    if (z.is_restricted) {
      // Draw X
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    }
  });

  // Draw compass
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('N', canvas.width - 30, 20);
  ctx.fillText('S', canvas.width - 30, canvas.height - 10);
  ctx.fillText('W', 10, canvas.height / 2);
  ctx.fillText('E', canvas.width - 10, canvas.height / 2);

  // My position
  ctx.beginPath();
  ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#60a5fa';
  ctx.fill();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pulse animation
  const pulseR = 10 + Math.sin(Date.now() / 300) * 5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, pulseR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(59,130,246,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter';
  ctx.fillText('You', centerX, centerY + 18);

  // Click handler
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const z of state.zones) {
      if (!z.lat || !z.lng) continue;
      const x = centerX + (z.lng + 65.25) * scale * 30;
      const y = centerY - (z.lat - 14.52) * scale * 30;
      if (Math.hypot(mx - x, my - y) < 20) {
        document.getElementById('map-info-card').style.display = 'block';
        document.getElementById('map-zone-name').textContent = z.name;
        document.getElementById('map-fish-density').textContent = Math.round(z.fish_density * 100) + '%';
        document.getElementById('map-zone-status').textContent = z.is_restricted ? 'RESTRICTED' : z.type.toUpperCase();
        document.getElementById('map-zone-distance').textContent = (Math.random() * 10 + 2).toFixed(1) + ' km';
        break;
      }
    }
  };

  // Animate
  requestAnimationFrame(() => setTimeout(drawMap, 1000));
}

// ═══════════════════════════════════════════════════════
// RECYCLE / CREDITS
// ═══════════════════════════════════════════════════════
function setupReturnNet() {
  document.getElementById('btn-return-net').addEventListener('click', async () => {
    const weight = parseFloat(document.getElementById('return-weight').value);
    if (!weight || weight <= 0) {
      alert('Please enter a valid weight');
      return;
    }

    try {
      const res = await fetch(`${API}/fisherman/return-net`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fisherman_id: FISHER_ID, fisherman_name: FISHER_NAME, plastic_kg: weight })
      });
      const data = await res.json();

      const resultEl = document.getElementById('return-result');
      resultEl.style.display = 'block';
      resultEl.textContent = `+${data.credits_earned} credits earned! Total: ${data.total} credits`;

      document.getElementById('return-weight').value = '';
      document.getElementById('return-desc').value = '';

      loadCredits();
      loadLeaderboard();
    } catch (e) {
      const resultEl = document.getElementById('return-result');
      resultEl.style.display = 'block';
      resultEl.style.borderColor = 'rgba(239,68,68,0.2)';
      resultEl.style.background = 'rgba(239,68,68,0.1)';
      resultEl.style.color = '#ef4444';
      resultEl.textContent = 'Unable to connect to server. Please try again.';
    }
  });
}

// ═══════════════════════════════════════════════════════
// AI CHAT
// ═══════════════════════════════════════════════════════
function setupAIChat() {
  const input = document.getElementById('ai-input');
  const btn = document.getElementById('btn-ai-send');

  async function sendAI() {
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const chat = document.getElementById('ai-chat');
    chat.innerHTML += `
      <div class="chat-msg user">
        <div class="chat-av">U</div>
        <div class="chat-bbl">${escapeHtml(msg)}</div>
      </div>
    `;
    chat.scrollTop = chat.scrollHeight;

    try {
      const res = await fetch(`${API}/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();

      chat.innerHTML += `
        <div class="chat-msg bot">
          <div class="chat-av">AI</div>
          <div class="chat-bbl">${escapeHtml(data.reply)}</div>
        </div>
      `;
    } catch (e) {
      chat.innerHTML += `
        <div class="chat-msg bot">
          <div class="chat-av">AI</div>
          <div class="chat-bbl" style="color:#ef4444">Unable to connect to AI. Make sure backend is running.</div>
        </div>
      `;
    }
    chat.scrollTop = chat.scrollHeight;
  }

  btn.addEventListener('click', sendAI);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') sendAI(); });

  // Quick prompts
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.prompt;
      sendAI();
    });
  });
}

// ═══════════════════════════════════════════════════════
// CATCH UPLOAD
// ═══════════════════════════════════════════════════════
function setupCatchUpload() {
  const area = document.getElementById('catch-upload-area');
  const input = document.getElementById('catch-file-input');

  area.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files.length) handleCatchFile(input.files[0]);
  });

  document.getElementById('btn-identify-catch')?.addEventListener('click', identifyCatch);
}

let catchImageData = null;

function handleCatchFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    catchImageData = e.target.result;
    document.getElementById('catch-img-preview').src = catchImageData;
    document.getElementById('catch-preview').style.display = 'block';
    document.getElementById('catch-upload-area').style.display = 'none';
    document.getElementById('catch-result').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function identifyCatch() {
  if (!catchImageData) return;

  document.getElementById('catch-loading').style.display = 'flex';
  document.getElementById('catch-result').style.display = 'none';

  try {
    const res = await fetch(`${API}/gemini/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: catchImageData })
    });
    const data = await res.json();

    document.getElementById('catch-loading').style.display = 'none';
    const resultEl = document.getElementById('catch-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div style="padding: 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: var(--r); font-size: 13px; line-height: 1.6;">
        <strong style="color: var(--blue2)">${data.is_debris ? 'Debris Detected!' : 'Analysis Complete'}</strong><br/>
        ${data.description || 'No description available'}<br/>
        ${data.debris_type ? `<span style="color: var(--text3)">Type: ${data.debris_type}</span><br/>` : ''}
        <span style="color: var(--text3)">Confidence: ${Math.round((data.confidence || 0) * 100)}%</span>
      </div>
    `;
  } catch (e) {
    document.getElementById('catch-loading').style.display = 'none';
    document.getElementById('catch-result').style.display = 'block';
    document.getElementById('catch-result').innerHTML = '<p style="color: #ef4444; font-size: 13px;">Could not analyze. Check server connection.</p>';
  }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
