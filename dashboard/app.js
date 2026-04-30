// ═══════════════════════════════════════════════════════
// OceanOS Dashboard — Main Application Logic
// ═══════════════════════════════════════════════════════

const API = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const state = {
  ws: null,
  currentTab: 'overview',
  charts: {},
  simData: {
    ocean_cleanup: { plastic_collected_session: 0, debris_in_boom: 0, wind_speed: 12.4, wave_height: 1.2 },
    drone: { altitude: 100, battery: 95, targets_detected: 0 },
    pollution: { pollution_level: 0, oil_ppm: 0, water_quality: 'GOOD' },
    river: { fill_level: 0, flow_speed: 2.0, collected_count: 0 }
  },
  chartHistory: {
    plasticTrend: [],
    pollutionHistory: [],
    rvFill: [],
    ocRate: [],
    drHistory: [],
    labels: []
  }
};

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupWebSocket();
  setupGemini();
  setupChat();
  setupClock();
  loadOverviewData();
  loadNotifications();
  initCharts();

  // Periodic data refresh
  setInterval(loadOverviewData, 15000);
  setInterval(loadNotifications, 10000);
});

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });

  document.getElementById('notif-bell').addEventListener('click', () => switchTab('notifications'));
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navItem) navItem.classList.add('active');

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add('active');

  // Update title
  const titles = {
    'overview': 'Overview',
    'ocean-cleanup': 'Ocean Cleanup Operations',
    'river-cleanup': 'River Cleanup Monitor',
    'pollution': 'Pollution Detection',
    'drones': 'Drone Patrol System',
    'illegal': 'Illegal Fishing Monitor',
    'gemini': 'Gemini AI Analysis',
    'notifications': 'Notifications Center'
  };
  document.getElementById('page-title').textContent = titles[tabId] || tabId;

  // Load tab-specific data
  if (tabId === 'ocean-cleanup') loadOceanData();
  if (tabId === 'river-cleanup') loadRiverData();
  if (tabId === 'pollution') loadPollutionData();
  if (tabId === 'drones') loadDroneData();
  if (tabId === 'illegal') loadIllegalData();
  if (tabId === 'notifications') loadNotifications();
}

// ═══════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════
function setupWebSocket() {
  try {
    state.ws = new WebSocket(WS_URL);

    state.ws.onopen = () => {
      console.log('WebSocket connected');
      const wsStatus = document.getElementById('ws-status');
      if (wsStatus) wsStatus.textContent = 'CONNECTED';
    };

    state.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWSMessage(msg);
    };

    state.ws.onclose = () => {
      const wsStatus = document.getElementById('ws-status');
      if (wsStatus) wsStatus.textContent = 'DISCONNECTED';
      setTimeout(setupWebSocket, 3000);
    };

    state.ws.onerror = () => {
      console.log('WebSocket error, retrying...');
    };
  } catch (e) {
    setTimeout(setupWebSocket, 3000);
  }
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'sim_update':
      state.simData = msg.data;
      updateLiveStats();
      updateChartHistory();
      break;
    case 'notification':
      addNotifToFeed(msg.data);
      updateNotifCount();
      break;
    case 'plastic_collected':
    case 'detection':
    case 'pollution':
    case 'river_collection':
      addActivityItem(msg);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════
function setupClock() {
  function updateClock() {
    const now = new Date();
    document.getElementById('topbar-time').textContent =
      now.toLocaleTimeString('en-US', { hour12: false });
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// ═══════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════
async function loadOverviewData() {
  try {
    const res = await fetch(`${API}/stats/overview`);
    const data = await res.json();

    // Update stat cards
    if (data.stats) {
      data.stats.forEach(s => {
        const el = document.getElementById(`stat-${s.metric.replace(/_/g, '-')}`);
        if (el) el.textContent = formatNumber(s.value);
      });
    }

    document.getElementById('stat-active-alerts').textContent = data.activePollution + data.illegalBoats;
    updateNotifCount(data.unreadNotifications);

    // Load plastic data for charts
    const plasticRes = await fetch(`${API}/plastic`);
    const plasticData = await plasticRes.json();
    updateOverviewCharts(plasticData);

    // Load activity
    const notifRes = await fetch(`${API}/notifications`);
    const notifs = await notifRes.json();
    updateActivityFeed(notifs.slice(0, 10));

  } catch (e) {
    console.log('API not available yet:', e.message);
  }
}

async function loadOceanData() {
  try {
    const res = await fetch(`${API}/plastic`);
    const data = await res.json();
    const oceanData = data.bySource.find(s => s.source === 'ocean_cleanup') || { total: 0, items: 0 };
    document.getElementById('oc-total-kg').textContent = (oceanData.total || 0).toFixed(1);
    document.getElementById('oc-items').textContent = oceanData.items || 0;
    document.getElementById('oc-wind').textContent = state.simData.ocean_cleanup.wind_speed;
    document.getElementById('oc-wave').textContent = state.simData.ocean_cleanup.wave_height;

    updateOceanCharts(data);
  } catch (e) { console.log(e); }
}

async function loadRiverData() {
  try {
    const res = await fetch(`${API}/river`);
    const data = await res.json();
    document.getElementById('rv-collected').textContent = data.data.length;
    document.getElementById('rv-fill').textContent = Math.round(state.simData.river.fill_level) + '%';
    document.getElementById('rv-flow').textContent = state.simData.river.flow_speed;
    document.getElementById('rv-total-kg').textContent = (data.totalKg || 0).toFixed(1);

    updateRiverCharts(data);
  } catch (e) { console.log(e); }
}

async function loadPollutionData() {
  try {
    const res = await fetch(`${API}/pollution`);
    const data = await res.json();
    document.getElementById('pl-level').textContent = Math.round(state.simData.pollution.pollution_level) + '%';
    document.getElementById('pl-oil').textContent = state.simData.pollution.oil_ppm + ' ppm';
    document.getElementById('pl-quality').textContent = state.simData.pollution.water_quality;
    document.getElementById('pl-events').textContent = data.length;

    updatePollutionTable(data);
  } catch (e) { console.log(e); }
}

async function loadDroneData() {
  try {
    const res = await fetch(`${API}/detections`);
    const data = await res.json();
    document.getElementById('dr-detections').textContent = data.length;
    document.getElementById('dr-battery').textContent = state.simData.drone.battery + '%';

    updateDroneTable(data);
    updateDroneCharts(data);
  } catch (e) { console.log(e); }
}

async function loadIllegalData() {
  try {
    const res = await fetch(`${API}/illegal-boats`);
    const data = await res.json();
    const active = data.filter(b => b.status === 'active');
    const mpa = data.filter(b => b.in_mpa);
    const intercepted = data.filter(b => b.status === 'intercepted');
    const monitoring = data.filter(b => b.status === 'monitoring');

    document.getElementById('il-active').textContent = active.length;
    document.getElementById('il-mpa').textContent = mpa.length;
    document.getElementById('il-total').textContent = intercepted.length;
    document.getElementById('il-monitoring').textContent = monitoring.length;

    updateIllegalTable(data);
  } catch (e) { console.log(e); }
}

async function loadNotifications() {
  try {
    const res = await fetch(`${API}/notifications`);
    const data = await res.json();
    renderNotifications(data);
    const unread = data.filter(n => !n.read).length;
    updateNotifCount(unread);
  } catch (e) { console.log(e); }
}

// ═══════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════
const chartColors = {
  blue: 'rgba(59, 130, 246, 0.8)',
  blueFill: 'rgba(59, 130, 246, 0.1)',
  green: 'rgba(34, 197, 94, 0.8)',
  greenFill: 'rgba(34, 197, 94, 0.1)',
  teal: 'rgba(20, 184, 166, 0.8)',
  orange: 'rgba(249, 115, 22, 0.8)',
  red: 'rgba(239, 68, 68, 0.8)',
  purple: 'rgba(168, 85, 247, 0.8)',
  yellow: 'rgba(234, 179, 8, 0.8)',
  pink: 'rgba(236, 72, 153, 0.8)',
};

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } }
  },
  scales: {
    x: { grid: { color: 'rgba(30,42,69,0.5)' }, ticks: { color: '#64748b', font: { size: 10 } } },
    y: { grid: { color: 'rgba(30,42,69,0.5)' }, ticks: { color: '#64748b', font: { size: 10 } }, beginAtZero: true }
  }
};

function initCharts() {
  // Overview — Plastic Trend
  state.charts.plasticTrend = new Chart(document.getElementById('chart-plastic-trend'), {
    type: 'line',
    data: {
      labels: getLast12Months(),
      datasets: [{
        label: 'Plastic Collected (kg)',
        data: [120, 185, 210, 340, 290, 480, 520, 610, 490, 730, 680, 847],
        borderColor: chartColors.blue,
        backgroundColor: chartColors.blueFill,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: chartColors.blue
      }]
    },
    options: { ...chartDefaults }
  });

  // Overview — By Source
  state.charts.bySource = new Chart(document.getElementById('chart-by-source'), {
    type: 'doughnut',
    data: {
      labels: ['Ocean Cleanup', 'River Net', 'Beach Patrol', 'Drone Guided'],
      datasets: [{
        data: [45, 25, 18, 12],
        backgroundColor: [chartColors.blue, chartColors.teal, chartColors.orange, chartColors.purple],
        borderColor: '#131b2e',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 } }
      }
    }
  });

  // Overview — Debris Type
  state.charts.debrisType = new Chart(document.getElementById('chart-debris-type'), {
    type: 'bar',
    data: {
      labels: ['Bottles', 'Bags', 'Containers', 'Nets', 'Fragments', 'Styrofoam'],
      datasets: [{
        label: 'Count',
        data: [320, 210, 180, 90, 450, 120],
        backgroundColor: [chartColors.blue, chartColors.teal, chartColors.orange, chartColors.purple, chartColors.red, chartColors.yellow],
        borderRadius: 4
      }]
    },
    options: { ...chartDefaults, plugins: { legend: { display: false } } }
  });

  // Ocean Cleanup Charts
  state.charts.ocRate = new Chart(document.getElementById('chart-oc-rate'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'kg/hr', data: [], borderColor: chartColors.blue, tension: 0.4, fill: true, backgroundColor: chartColors.blueFill }] },
    options: { ...chartDefaults }
  });

  state.charts.ocBreakdown = new Chart(document.getElementById('chart-oc-breakdown'), {
    type: 'doughnut',
    data: { labels: ['Bottles', 'Bags', 'Containers', 'Other'], datasets: [{ data: [35, 28, 22, 15], backgroundColor: [chartColors.blue, chartColors.green, chartColors.orange, chartColors.purple], borderColor: '#131b2e', borderWidth: 3 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
  });

  state.charts.ocCycles = new Chart(document.getElementById('chart-oc-cycles'), {
    type: 'bar',
    data: { labels: ['Cycle 1', 'Cycle 2', 'Cycle 3', 'Cycle 4', 'Cycle 5', 'Cycle 6'], datasets: [{ label: 'Plastic (kg)', data: [45, 62, 38, 71, 55, 48], backgroundColor: chartColors.blue, borderRadius: 6 }] },
    options: { ...chartDefaults }
  });

  // River Charts
  state.charts.rvFill = new Chart(document.getElementById('chart-rv-fill'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Fill %', data: [], borderColor: chartColors.teal, tension: 0.4, fill: true, backgroundColor: 'rgba(20,184,166,0.1)' }] },
    options: { ...chartDefaults }
  });

  state.charts.rvTypes = new Chart(document.getElementById('chart-rv-types'), {
    type: 'doughnut',
    data: { labels: ['Bottle', 'Bag', 'Container', 'Cup', 'Straw'], datasets: [{ data: [30, 20, 15, 25, 10], backgroundColor: [chartColors.blue, chartColors.purple, chartColors.orange, chartColors.pink, chartColors.green], borderColor: '#131b2e', borderWidth: 3 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
  });

  state.charts.rvEfficiency = new Chart(document.getElementById('chart-rv-efficiency'), {
    type: 'line',
    data: {
      labels: ['1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0'],
      datasets: [
        { label: 'Collection Rate', data: [95, 90, 85, 78, 68, 55, 40], borderColor: chartColors.green, tension: 0.4 },
        { label: 'Overflow Risk', data: [5, 10, 15, 22, 32, 45, 60], borderColor: chartColors.red, tension: 0.4 }
      ]
    },
    options: { ...chartDefaults }
  });

  // Pollution Charts
  state.charts.plHistory = new Chart(document.getElementById('chart-pl-history'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Pollution %', data: [], borderColor: chartColors.red, tension: 0.4, fill: true, backgroundColor: 'rgba(239,68,68,0.1)' }] },
    options: { ...chartDefaults }
  });

  state.charts.plChemicals = new Chart(document.getElementById('chart-pl-chemicals'), {
    type: 'radar',
    data: {
      labels: ['Oil', 'Heavy Metals', 'Microplastics', 'Chemicals', 'Nitrogen', 'pH Level'],
      datasets: [{
        label: 'Current',
        data: [65, 30, 80, 45, 55, 70],
        borderColor: chartColors.red,
        backgroundColor: 'rgba(239,68,68,0.15)',
        pointBackgroundColor: chartColors.red
      }, {
        label: 'Safe Threshold',
        data: [20, 15, 25, 20, 30, 50],
        borderColor: chartColors.green,
        backgroundColor: 'rgba(34,197,94,0.08)',
        pointBackgroundColor: chartColors.green
      }]
    },
    options: {
      responsive: true,
      scales: { r: { grid: { color: 'rgba(30,42,69,0.5)' }, ticks: { display: false }, pointLabels: { color: '#94a3b8', font: { size: 11 } } } },
      plugins: { legend: { labels: { color: '#94a3b8' } } }
    }
  });

  // Drone Charts
  state.charts.drHistory = new Chart(document.getElementById('chart-dr-history'), {
    type: 'bar',
    data: {
      labels: getLast7Days(),
      datasets: [
        { label: 'Plastic', data: [12, 8, 15, 20, 11, 18, 14], backgroundColor: chartColors.blue, borderRadius: 4 },
        { label: 'Vessels', data: [3, 5, 2, 4, 6, 3, 5], backgroundColor: chartColors.orange, borderRadius: 4 },
        { label: 'Marine Life', data: [8, 6, 10, 7, 9, 12, 8], backgroundColor: chartColors.green, borderRadius: 4 }
      ]
    },
    options: { ...chartDefaults }
  });

  state.charts.drTypes = new Chart(document.getElementById('chart-dr-types'), {
    type: 'polarArea',
    data: {
      labels: ['Plastic Debris', 'Fishing Vessels', 'Marine Life', 'Oil Slicks', 'Unknown'],
      datasets: [{
        data: [45, 20, 25, 5, 5],
        backgroundColor: [
          'rgba(59,130,246,0.7)', 'rgba(249,115,22,0.7)', 'rgba(34,197,94,0.7)',
          'rgba(239,68,68,0.7)', 'rgba(148,163,184,0.7)'
        ]
      }]
    },
    options: {
      responsive: true,
      scales: { r: { grid: { color: 'rgba(30,42,69,0.3)' }, ticks: { display: false } } },
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
    }
  });
}

function updateChartHistory() {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const h = state.chartHistory;
  h.labels.push(now);
  h.plasticTrend.push(state.simData.ocean_cleanup.plastic_collected_session);
  h.pollutionHistory.push(state.simData.pollution.pollution_level);
  h.rvFill.push(state.simData.river.fill_level);
  h.ocRate.push(state.simData.ocean_cleanup.plastic_collected_session);
  h.drHistory.push(state.simData.drone.targets_detected);

  const maxPoints = 30;
  if (h.labels.length > maxPoints) {
    h.labels.shift();
    h.plasticTrend.shift();
    h.pollutionHistory.shift();
    h.rvFill.shift();
    h.ocRate.shift();
    h.drHistory.shift();
  }

  // Update live charts
  if (state.charts.ocRate) {
    state.charts.ocRate.data.labels = [...h.labels];
    state.charts.ocRate.data.datasets[0].data = [...h.ocRate];
    state.charts.ocRate.update('none');
  }
  if (state.charts.rvFill) {
    state.charts.rvFill.data.labels = [...h.labels];
    state.charts.rvFill.data.datasets[0].data = [...h.rvFill];
    state.charts.rvFill.update('none');
  }
  if (state.charts.plHistory) {
    state.charts.plHistory.data.labels = [...h.labels];
    state.charts.plHistory.data.datasets[0].data = [...h.pollutionHistory];
    state.charts.plHistory.update('none');
  }
}

function updateOverviewCharts(plasticData) {
  if (plasticData.bySource && state.charts.bySource) {
    state.charts.bySource.data.labels = plasticData.bySource.map(s => s.source.replace(/_/g, ' '));
    state.charts.bySource.data.datasets[0].data = plasticData.bySource.map(s => s.total);
    state.charts.bySource.update();
  }
  if (plasticData.byType && state.charts.debrisType) {
    state.charts.debrisType.data.labels = plasticData.byType.map(s => s.type);
    state.charts.debrisType.data.datasets[0].data = plasticData.byType.map(s => s.items);
    state.charts.debrisType.update();
  }
}

function updateOceanCharts(data) {}
function updateRiverCharts(data) {}
function updateDroneCharts(data) {}

// ═══════════════════════════════════════════════════════
// LIVE STATS UPDATE
// ═══════════════════════════════════════════════════════
function updateLiveStats() {
  const s = state.simData;
  // Ocean
  const ocWind = document.getElementById('oc-wind');
  if (ocWind) ocWind.textContent = s.ocean_cleanup.wind_speed;
  const ocWave = document.getElementById('oc-wave');
  if (ocWave) ocWave.textContent = s.ocean_cleanup.wave_height;

  // River
  const rvFill = document.getElementById('rv-fill');
  if (rvFill) rvFill.textContent = Math.round(s.river.fill_level) + '%';
  const rvFlow = document.getElementById('rv-flow');
  if (rvFlow) rvFlow.textContent = s.river.flow_speed;

  // Pollution
  const plLevel = document.getElementById('pl-level');
  if (plLevel) plLevel.textContent = Math.round(s.pollution.pollution_level) + '%';
  const plOil = document.getElementById('pl-oil');
  if (plOil) plOil.textContent = s.pollution.oil_ppm + ' ppm';
  const plQuality = document.getElementById('pl-quality');
  if (plQuality) plQuality.textContent = s.pollution.water_quality;

  // Drone
  const drBattery = document.getElementById('dr-battery');
  if (drBattery) drBattery.textContent = s.drone.battery + '%';
}

// ═══════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════
function updatePollutionTable(data) {
  const container = document.getElementById('pollution-events-table');
  if (!container) return;
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Type</th><th>Severity</th><th>Level</th><th>Oil PPM</th><th>Location</th><th>Time</th><th>Status</th></tr></thead>
      <tbody>${data.map(e => `
        <tr>
          <td>${e.type}</td>
          <td><span class="tag ${e.severity === 'CRITICAL' ? 'danger' : e.severity === 'HIGH' ? 'warning' : 'info'}">${e.severity}</span></td>
          <td>${Math.round(e.pollution_level)}%</td>
          <td>${e.oil_ppm}</td>
          <td>${e.location || 'N/A'}</td>
          <td>${formatTime(e.timestamp)}</td>
          <td>${e.resolved ? '<span class="tag success">RESOLVED</span>' : '<span class="tag danger">ACTIVE</span>'}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
}

function updateDroneTable(data) {
  const container = document.getElementById('detection-log-table');
  if (!container) return;
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Type</th><th>Name</th><th>Confidence</th><th>Location</th><th>MPA</th><th>Illegal</th><th>Time</th></tr></thead>
      <tbody>${data.map(d => `
        <tr>
          <td><span class="tag ${d.type === 'ship' ? 'warning' : d.type === 'plastic' ? 'info' : 'success'}">${d.type}</span></td>
          <td>${d.name || 'N/A'}</td>
          <td>${Math.round((d.confidence || 0) * 100)}%</td>
          <td>${d.lat?.toFixed(2) || 'N/A'}, ${d.lng?.toFixed(2) || 'N/A'}</td>
          <td>${d.in_mpa ? '<span class="tag danger">YES</span>' : 'No'}</td>
          <td>${d.is_illegal ? '<span class="tag danger">YES</span>' : 'No'}</td>
          <td>${formatTime(d.timestamp)}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
}

function updateIllegalTable(data) {
  const container = document.getElementById('illegal-boats-table');
  if (!container) return;
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Vessel</th><th>Type</th><th>Speed</th><th>Location</th><th>In MPA</th><th>Status</th><th>First Detected</th></tr></thead>
      <tbody>${data.map(b => `
        <tr>
          <td><strong>${b.vessel_name || 'Unknown'}</strong></td>
          <td>${b.vessel_type || 'N/A'}</td>
          <td>${b.speed_knots?.toFixed(1) || 'N/A'} kn</td>
          <td>${b.lat?.toFixed(4) || 'N/A'}, ${b.lng?.toFixed(4) || 'N/A'}</td>
          <td>${b.in_mpa ? '<span class="tag danger">YES</span>' : 'No'}</td>
          <td><span class="tag ${b.status === 'active' ? 'danger' : b.status === 'intercepted' ? 'success' : 'warning'}">${b.status.toUpperCase()}</span></td>
          <td>${formatTime(b.first_detected)}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
}

// ═══════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════
function renderNotifications(data) {
  const list = document.getElementById('notif-list');
  if (!list) return;

  const icons = { danger: '!', warning: '!', info: 'i' };

  list.innerHTML = data.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="notif-dot ${n.type}">${icons[n.type] || 'i'}</div>
      <div class="notif-content">
        <div class="notif-title">${n.title}</div>
        <div class="notif-msg">${n.message}</div>
        <div class="notif-meta">
          <span class="notif-source">${n.source}</span>
          <span class="notif-time">${formatTime(n.timestamp)}</span>
        </div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      await fetch(`${API}/notifications/${id}/read`, { method: 'PUT' });
      item.classList.remove('unread');
      loadNotifications();
    });
  });
}

function updateNotifCount(count) {
  if (count === undefined) return;
  const el = document.getElementById('notif-count');
  const bell = document.getElementById('bell-badge');
  if (el) el.textContent = count;
  if (bell) {
    bell.textContent = count;
    bell.style.display = count > 0 ? 'block' : 'none';
  }
}

function addNotifToFeed(data) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  const icons = { danger: '!', warning: '!', info: 'i' };
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-icon ${data.type}">${icons[data.type] || 'i'}</div>
    <div class="activity-content">
      <div class="activity-title">${data.title}</div>
      <div class="activity-msg">${data.message}</div>
    </div>
    <span class="activity-time">Just now</span>
  `;
  feed.prepend(item);
}

document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
  await fetch(`${API}/notifications/read-all`, { method: 'PUT' });
  loadNotifications();
});

// ═══════════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════════
function updateActivityFeed(notifs) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const icons = { danger: '!', warning: '!', info: 'i' };

  feed.innerHTML = notifs.map(n => `
    <div class="activity-item">
      <div class="activity-icon ${n.type}">${icons[n.type] || 'i'}</div>
      <div class="activity-content">
        <div class="activity-title">${n.title}</div>
        <div class="activity-msg">${n.message}</div>
      </div>
      <span class="activity-time">${formatTime(n.timestamp)}</span>
    </div>
  `).join('');
}

function addActivityItem(msg) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-icon info">+</div>
    <div class="activity-content">
      <div class="activity-title">${msg.type.replace(/_/g, ' ')}</div>
      <div class="activity-msg">${JSON.stringify(msg.data).substring(0, 80)}</div>
    </div>
    <span class="activity-time">Now</span>
  `;
  feed.prepend(item);
}

// ═══════════════════════════════════════════════════════
// GEMINI AI
// ═══════════════════════════════════════════════════════
function setupGemini() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('gemini-file-input');

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = '#3b82f6'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleImageFile(fileInput.files[0]);
  });

  document.getElementById('btn-analyze')?.addEventListener('click', analyzeWithGemini);
}

let currentImageBase64 = null;

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageBase64 = e.target.result;
    document.getElementById('gemini-img-preview').src = currentImageBase64;
    document.getElementById('gemini-preview').style.display = 'block';
    document.getElementById('gemini-result').style.display = 'none';
    document.getElementById('upload-area').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function analyzeWithGemini() {
  if (!currentImageBase64) return;

  document.getElementById('gemini-loading').style.display = 'flex';
  document.getElementById('gemini-result').style.display = 'none';

  try {
    const res = await fetch(`${API}/gemini/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentImageBase64 })
    });
    const data = await res.json();

    document.getElementById('gemini-loading').style.display = 'none';
    const resultDiv = document.getElementById('gemini-result');
    resultDiv.style.display = 'block';

    const isDebris = data.is_debris;
    resultDiv.innerHTML = `
      <div class="result-header">
        <span style="color: ${isDebris ? '#ef4444' : '#22c55e'}; font-size: 20px;">${isDebris ? '!' : 'OK'}</span>
        ${isDebris ? 'DEBRIS DETECTED' : 'NO DEBRIS FOUND'}
      </div>
      <div class="result-row"><span class="result-key">Confidence</span><span class="result-val">${Math.round((data.confidence || 0) * 100)}%</span></div>
      ${data.debris_type ? `<div class="result-row"><span class="result-key">Type</span><span class="result-val">${data.debris_type}</span></div>` : ''}
      ${data.estimated_weight_kg ? `<div class="result-row"><span class="result-key">Est. Weight</span><span class="result-val">${data.estimated_weight_kg} kg</span></div>` : ''}
      ${data.environmental_risk ? `<div class="result-row"><span class="result-key">Risk Level</span><span class="result-val tag ${data.environmental_risk === 'CRITICAL' ? 'danger' : data.environmental_risk === 'HIGH' ? 'warning' : 'info'}">${data.environmental_risk}</span></div>` : ''}
      ${data.description ? `<div class="result-row"><span class="result-key">Description</span><span class="result-val">${data.description}</span></div>` : ''}
      ${data.recommended_action ? `<div class="result-row"><span class="result-key">Action</span><span class="result-val">${data.recommended_action}</span></div>` : ''}
      ${data.error ? `<div class="result-row"><span class="result-key">Error</span><span class="result-val" style="color: #ef4444">${data.error}</span></div>` : ''}
    `;
  } catch (err) {
    document.getElementById('gemini-loading').style.display = 'none';
    document.getElementById('gemini-result').style.display = 'block';
    document.getElementById('gemini-result').innerHTML = `<p style="color: #ef4444">Error: ${err.message}</p>`;
  }
}

// ═══════════════════════════════════════════════════════
// CHAT (Gemini)
// ═══════════════════════════════════════════════════════
function setupChat() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('btn-chat-send');

  async function sendChat() {
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const container = document.getElementById('chat-container');
    container.innerHTML += `
      <div class="chat-message user">
        <div class="chat-avatar">U</div>
        <div class="chat-bubble">${escapeHtml(msg)}</div>
      </div>
    `;
    container.scrollTop = container.scrollHeight;

    try {
      const res = await fetch(`${API}/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();

      container.innerHTML += `
        <div class="chat-message bot">
          <div class="chat-avatar">AI</div>
          <div class="chat-bubble">${escapeHtml(data.reply)}</div>
        </div>
      `;
      container.scrollTop = container.scrollHeight;
    } catch (err) {
      container.innerHTML += `
        <div class="chat-message bot">
          <div class="chat-avatar">AI</div>
          <div class="chat-bubble" style="color: #ef4444">Failed to get response: ${err.message}</div>
        </div>
      `;
    }
  }

  btn?.addEventListener('click', sendChat);
  input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function formatNumber(num) {
  if (num >= 1000) return num.toLocaleString();
  return num;
}

function formatTime(ts) {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getLast12Months() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const result = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i);
    result.push(months[d.getMonth()]);
  }
  return result;
}

function getLast7Days() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(days[d.getDay()]);
  }
  return result;
}
