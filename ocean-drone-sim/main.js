import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ═══════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════ */
const state = {
  time: 0,
  mode: 'ship',   // auto-start scanning – 'ship' | 'plastic' | 'bio'
  target: null,
  droneSpeed: 120,
  uavPos: new THREE.Vector3(0, 120, 100),
  scanAngle: 0,
  battery: 98,
  patrolPhase: 0,     // cycles through patrol waypoints
  waypointIndex: 0,
  detectedSet: new Set(),  // track already-detected IDs
  autoScanTimer: 0,
  manualTarget: null,     // clicked point on ocean (THREE.Vector3)
  manualMode: false,      // true = flying to manual click; false = patrol
  hoverPoint: null,       // where mouse is hovering on ocean
  arrivedAtManual: false  // prevents arrival log spam
};

/* ═══════════════════════════════════════════════════════
   DOM ELEMENTS
   ═══════════════════════════════════════════════════════ */
const $box      = document.getElementById('target-box');
const $info     = document.getElementById('target-info');
const $tgtClass = document.getElementById('tgt-class');
const $tgtData  = document.getElementById('tgt-data');
const $log      = document.getElementById('log-panel');
const $valAlt   = document.getElementById('val-alt');
const $valSpd   = document.getElementById('val-spd');
const $valBat   = document.getElementById('val-bat');
const $valGps   = document.getElementById('val-gps');
const $valTime  = document.getElementById('val-time');
const $blockMpa = document.getElementById('block-mpa');
const $valMpa   = document.getElementById('val-mpa');

function addLog(msg, type = '') {
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  div.textContent = `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}] ${msg}`;
  $log.prepend(div);
  if ($log.children.length > 14) $log.lastChild.remove();
}

/* ═══════════════════════════════════════════════════════
   RENDERER
   ═══════════════════════════════════════════════════════ */
const canvas = document.getElementById('sim-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7eb8d0, 0.0006);

/* ═══════════════════════════════════════════════════════
   CAMERA  – wider FOV for surveillance feel
   ═══════════════════════════════════════════════════════ */
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 1, 6000);
camera.position.set(0, 120, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 50;
controls.maxDistance = 1200;

/* ═══════════════════════════════════════════════════════
   SKY – Gradient Hemisphere + Sun Disc
   ═══════════════════════════════════════════════════════ */
const skyGeo = new THREE.SphereGeometry(3000, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uSunPos: { value: new THREE.Vector3(400, 300, -600) } },
  vertexShader: `
    varying vec3 vWP;
    void main(){
      vWP = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWP,1.0);
    }`,
  fragmentShader: `
    uniform vec3 uSunPos;
    varying vec3 vWP;
    void main(){
      vec3 dir = normalize(vWP);
      float y = dir.y * 0.5 + 0.5;
      vec3 zenith = vec3(0.15, 0.4, 0.75);
      vec3 horizon = vec3(0.6, 0.8, 0.95);
      vec3 col = mix(horizon, zenith, pow(y, 0.6));
      vec3 sunDir = normalize(uSunPos);
      float sunDot = max(0.0, dot(dir, sunDir));
      col += vec3(1.0, 0.95, 0.8) * pow(sunDot, 200.0) * 2.0;
      col += vec3(1.0, 0.85, 0.6) * pow(sunDot, 8.0) * 0.3;
      col = mix(col, vec3(0.85, 0.9, 0.95), pow(1.0 - y, 12.0));
      gl_FragColor = vec4(col, 1.0);
    }`
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

/* ═══════════════════════════════════════════════════════
   LIGHTING
   ═══════════════════════════════════════════════════════ */
scene.add(new THREE.AmbientLight(0x8cb4d0, 0.6));
const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
sun.position.set(400, 300, -600);
sun.castShadow = true;
sun.shadow.camera.left = -600;
sun.shadow.camera.right = 600;
sun.shadow.camera.top = 600;
sun.shadow.camera.bottom = -600;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1500;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x44aa88, 0.4));

/* ═══════════════════════════════════════════════════════
   OCEAN – Advanced Shader
   ═══════════════════════════════════════════════════════ */
const oceanMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSunPos: { value: sun.position } },
  vertexShader: `
    uniform float uTime;
    varying vec3 vWP;
    varying vec3 vNormal;
    varying vec2 vUv;
    void main(){
      vec3 p = position;
      float w1 = sin(p.x * 0.015 + uTime * 0.8) * 2.5;
      float w2 = cos(p.y * 0.012 + uTime * 0.6) * 2.0;
      float w3 = sin((p.x + p.y) * 0.01 + uTime * 1.2) * 1.5;
      float w4 = cos(p.x * 0.03 - uTime * 0.5) * sin(p.y * 0.03 + uTime * 0.7) * 1.0;
      p.z = w1 + w2 + w3 + w4;
      float dx = 0.015 * cos(p.x * 0.015 + uTime * 0.8) * 2.5
               - 0.01 * sin((p.x + p.y) * 0.01 + uTime * 1.2) * 1.5
               + 0.03 * cos(p.x * 0.03 - uTime * 0.5) * sin(p.y * 0.03 + uTime * 0.7) * 1.0;
      float dy = -0.012 * sin(p.y * 0.012 + uTime * 0.6) * 2.0
               - 0.01 * sin((p.x + p.y) * 0.01 + uTime * 1.2) * 1.5
               + cos(p.x * 0.03 - uTime * 0.5) * 0.03 * cos(p.y * 0.03 + uTime * 0.7) * 1.0;
      vNormal = normalize(vec3(-dx, 1.0, -dy));
      vWP = (modelMatrix * vec4(p, 1.0)).xyz;
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uSunPos;
    varying vec3 vWP;
    varying vec3 vNormal;
    varying vec2 vUv;
    void main(){
      vec3 shallow = vec3(0.05, 0.55, 0.65);
      vec3 deep    = vec3(0.01, 0.08, 0.25);
      vec3 foam    = vec3(0.85, 0.95, 1.0);
      float depthFactor = smoothstep(-3.0, 5.0, vWP.y);
      vec3 col = mix(deep, shallow, depthFactor);
      vec3 sunDir = normalize(uSunPos - vWP);
      vec3 viewDir = normalize(cameraPosition - vWP);
      vec3 halfDir = normalize(sunDir + viewDir);
      float spec = pow(max(0.0, dot(vNormal, halfDir)), 120.0);
      col += vec3(1.0, 0.95, 0.85) * spec * 0.8;
      float spec2 = pow(max(0.0, dot(vNormal, halfDir)), 20.0);
      col += vec3(0.6, 0.75, 0.85) * spec2 * 0.15;
      float wave = sin(vWP.x * 0.04 + uTime) * cos(vWP.z * 0.04 + uTime * 0.7);
      col = mix(col, foam, smoothstep(0.6, 0.9, wave) * 0.25);
      float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 3.0);
      col = mix(col, vec3(0.4, 0.65, 0.8), fresnel * 0.35);
      gl_FragColor = vec4(col, 0.9);
    }`,
  transparent: true,
  side: THREE.DoubleSide
});
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 160, 160), oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.receiveShadow = true;
scene.add(ocean);

/* ═══════════════════════════════════════════════════════
   ENVIRONMENT – Tropical Islands
   ═══════════════════════════════════════════════════════ */
const islandGreen = new THREE.MeshStandardMaterial({ color: 0x1a6b2a, roughness: 0.85 });
const sandMat = new THREE.MeshStandardMaterial({ color: 0xf0dca0, roughness: 1.0 });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.95 });
const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x1a8b3a, side: THREE.DoubleSide });

function makePalmTree(parent, x, y, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 8, 6),
    palmTrunkMat
  );
  trunk.position.set(x, y + 4, z);
  trunk.rotation.x = (Math.random() - 0.5) * 0.2;
  trunk.rotation.z = (Math.random() - 0.5) * 0.2;
  trunk.castShadow = true;
  parent.add(trunk);

  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 5, 4),
      palmLeafMat
    );
    leaf.position.set(x + Math.cos(angle) * 1.5, y + 8.5, z + Math.sin(angle) * 1.5);
    leaf.rotation.z = Math.cos(angle) * 0.8;
    leaf.rotation.x = Math.sin(angle) * 0.8;
    leaf.castShadow = true;
    parent.add(leaf);
  }
}

function makeIsland(x, z, radius, height) {
  const grp = new THREE.Group();
  grp.position.set(x, -2, z);

  const shelf = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 20, radius + 40, 3, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a8898, transparent: true, opacity: 0.5 })
  );
  shelf.position.y = -1;
  grp.add(shelf);

  const beach = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 8, radius + 18, 2, 20),
    sandMat
  );
  beach.position.y = 0.5;
  beach.receiveShadow = true;
  grp.add(beach);

  const body = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 16),
    islandGreen
  );
  body.position.y = height / 2 + 1;
  body.castShadow = true;
  body.receiveShadow = true;
  grp.add(body);

  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(Math.random() * 3 + 2, 1),
      rockMat
    );
    rock.position.set(Math.cos(a) * (radius - 2), 2, Math.sin(a) * (radius - 2));
    rock.castShadow = true;
    grp.add(rock);
  }

  const treeCount = Math.floor(radius * 0.4);
  for (let i = 0; i < treeCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = Math.random() * (radius - 5) * 0.6;
    makePalmTree(grp, Math.cos(a) * dist, 2, Math.sin(a) * dist);
  }

  scene.add(grp);
  return grp;
}

makeIsland(-200, -150, 50, 30);
makeIsland(300, 80, 70, 40);
makeIsland(120, 350, 40, 22);
makeIsland(-350, 200, 45, 25);
makeIsland(450, -300, 55, 35);

function makeRock(x, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(
      new THREE.DodecahedronGeometry(Math.random() * 8 + 4, 1),
      rockMat
    );
    r.position.set(Math.random() * 10 - 5, Math.random() * 5, Math.random() * 10 - 5);
    r.castShadow = true;
    g.add(r);
  }
  g.position.set(x, -1, z);
  scene.add(g);
}
makeRock(-400, -400);
makeRock(500, 200);
makeRock(-100, 500);

/* ═══════════════════════════════════════════════════════
   CLOUDS
   ═══════════════════════════════════════════════════════ */
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.7,
  roughness: 1,
  emissive: 0xffffff,
  emissiveIntensity: 0.1
});
const clouds = [];
for (let i = 0; i < 20; i++) {
  const cg = new THREE.Group();
  const puffs = 3 + Math.floor(Math.random() * 4);
  for (let j = 0; j < puffs; j++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(Math.random() * 15 + 8, 8, 6),
      cloudMat
    );
    puff.position.set(Math.random() * 30 - 15, Math.random() * 6, Math.random() * 20 - 10);
    puff.scale.y = 0.4;
    cg.add(puff);
  }
  cg.position.set(
    Math.random() * 3000 - 1500,
    150 + Math.random() * 200,
    Math.random() * 3000 - 1500
  );
  cg.userData.speed = (Math.random() * 0.5 + 0.1);
  scene.add(cg);
  clouds.push(cg);
}

/* ═══════════════════════════════════════════════════════
   SEABIRDS
   ═══════════════════════════════════════════════════════ */
const birdMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const birds = [];
for (let i = 0; i < 8; i++) {
  const bg = new THREE.Group();
  const wingL = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), birdMat);
  wingL.position.x = -1.2;
  const wingR = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), birdMat);
  wingR.position.x = 1.2;
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2, 4), birdMat);
  body.rotation.x = Math.PI / 2;
  bg.add(wingL, wingR, body);
  bg.position.set(
    Math.random() * 600 - 300,
    80 + Math.random() * 60,
    Math.random() * 600 - 300
  );
  bg.userData = { baseY: bg.position.y, angle: Math.random() * Math.PI * 2, radius: 80 + Math.random() * 100, speed: 0.3 + Math.random() * 0.3, wingL, wingR };
  scene.add(bg);
  birds.push(bg);
}

/* ═══════════════════════════════════════════════════════
   MARINE PROTECTED AREA (MPA)
   ═══════════════════════════════════════════════════════ */
const MPA_CENTER = new THREE.Vector3(50, 0, -80);
const MPA_RADIUS = 150;

const ringGeo = new THREE.RingGeometry(MPA_RADIUS - 3, MPA_RADIUS, 64);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x00ffcc,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide
});
const mpaRing = new THREE.Mesh(ringGeo, ringMat);
mpaRing.rotation.x = -Math.PI / 2;
mpaRing.position.copy(MPA_CENTER);
mpaRing.position.y = 0.6;
scene.add(mpaRing);

const innerRing = new THREE.Mesh(
  new THREE.RingGeometry(MPA_RADIUS - 15, MPA_RADIUS - 3, 64),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
);
innerRing.rotation.x = -Math.PI / 2;
innerRing.position.copy(MPA_CENTER);
innerRing.position.y = 0.5;
scene.add(innerRing);

for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const buoy = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.3 })
  );
  buoy.position.set(
    MPA_CENTER.x + Math.cos(a) * MPA_RADIUS,
    1.5,
    MPA_CENTER.z + Math.sin(a) * MPA_RADIUS
  );
  buoy.castShadow = true;
  scene.add(buoy);
}

/* ═══════════════════════════════════════════════════════
   DRONE MODEL
   ═══════════════════════════════════════════════════════ */
const droneGroup = new THREE.Group();
const droneBody = new THREE.Mesh(
  new THREE.BoxGeometry(4, 1.5, 6),
  new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 })
);
droneBody.castShadow = true;
droneGroup.add(droneBody);

const armMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });
const rotorMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 });
const armOffsets = [
  [-4, 0, -3], [4, 0, -3], [-4, 0, 3], [4, 0, 3]
];
const rotors = [];
armOffsets.forEach(([ax, ay, az]) => {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 0.4), armMat);
  arm.position.set(ax / 2, ay, az);
  droneGroup.add(arm);
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.1, 16), rotorMat);
  rotor.position.set(ax, ay + 0.8, az);
  droneGroup.add(rotor);
  rotors.push(rotor);
});

const lens = new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 1, roughness: 0.1 })
);
lens.position.set(0, -0.8, -2);
droneGroup.add(lens);

const droneLight = new THREE.PointLight(0x00ffcc, 2, 30);
droneLight.position.set(0, -1, 0);
droneGroup.add(droneLight);

// Scan beam cone (visible from drone)
const scanBeamGeo = new THREE.ConeGeometry(35, 80, 16, 1, true);
const scanBeamMat = new THREE.MeshBasicMaterial({
  color: 0x00ffcc,
  transparent: true,
  opacity: 0.04,
  side: THREE.DoubleSide,
  depthWrite: false
});
const scanBeam = new THREE.Mesh(scanBeamGeo, scanBeamMat);
scanBeam.position.y = -45;
droneGroup.add(scanBeam);

droneGroup.position.copy(state.uavPos);
scene.add(droneGroup);

/* ═══════════════════════════════════════════════════════
   CLICK WAYPOINT MARKER – glowing beacon on ocean
   ═══════════════════════════════════════════════════════ */
const wpMarkerGroup = new THREE.Group();
wpMarkerGroup.visible = false;

// Vertical beam
const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 120, 8);
const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.35 });
const wpBeam = new THREE.Mesh(beamGeo, beamMat);
wpBeam.position.y = 60;
wpMarkerGroup.add(wpBeam);

// Pulsing ground ring
const wpRingGeo = new THREE.RingGeometry(8, 10, 32);
const wpRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
const wpRing = new THREE.Mesh(wpRingGeo, wpRingMat);
wpRing.rotation.x = -Math.PI / 2;
wpRing.position.y = 1;
wpMarkerGroup.add(wpRing);

// Inner pulsing ring
const wpRingInner = new THREE.Mesh(
  new THREE.RingGeometry(3, 5, 32),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
);
wpRingInner.rotation.x = -Math.PI / 2;
wpRingInner.position.y = 1.2;
wpMarkerGroup.add(wpRingInner);

// Outer expanding ring (animated)
const wpRingOuter = new THREE.Mesh(
  new THREE.RingGeometry(12, 13, 32),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
);
wpRingOuter.rotation.x = -Math.PI / 2;
wpRingOuter.position.y = 0.8;
wpMarkerGroup.add(wpRingOuter);

// Diamond marker floating above
const wpDiamondGeo = new THREE.OctahedronGeometry(2, 0);
const wpDiamondMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.2 });
const wpDiamond = new THREE.Mesh(wpDiamondGeo, wpDiamondMat);
wpDiamond.position.y = 20;
wpMarkerGroup.add(wpDiamond);

scene.add(wpMarkerGroup);

// Hover cursor ring – follows mouse on ocean surface
const hoverRingGroup = new THREE.Group();
hoverRingGroup.visible = false;
const hoverRingGeo = new THREE.RingGeometry(5, 6.5, 32);
const hoverRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
const hoverRing = new THREE.Mesh(hoverRingGeo, hoverRingMat);
hoverRing.rotation.x = -Math.PI / 2;
hoverRing.position.y = 1;
hoverRingGroup.add(hoverRing);

const hoverCross1 = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 0.5),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
);
hoverCross1.rotation.x = -Math.PI / 2;
hoverCross1.position.y = 1.1;
hoverRingGroup.add(hoverCross1);

const hoverCross2 = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 12),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
);
hoverCross2.rotation.x = -Math.PI / 2;
hoverCross2.position.y = 1.1;
hoverRingGroup.add(hoverCross2);

scene.add(hoverRingGroup);

/* ═══════════════════════════════════════════════════════
   TARGETS – Ships, Plastics, Marine Life
   ═══════════════════════════════════════════════════════ */
const targets = [];
let targetIdCounter = 0;

function inMPA(pos) {
  return new THREE.Vector2(pos.x, pos.z).distanceTo(new THREE.Vector2(MPA_CENTER.x, MPA_CENTER.z)) < MPA_RADIUS;
}

// ──── Fishing Boats ────
function spawnBoat(x, z) {
  const g = new THREE.Group();

  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.5, 18),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.2 })
  );
  hull.position.y = 1;
  hull.castShadow = true;
  g.add(hull);

  const keel = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.2, 17),
    new THREE.MeshStandardMaterial({ color: 0xaa2222 })
  );
  keel.position.y = -0.2;
  g.add(keel);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x3366cc, roughness: 0.3 })
  );
  cabin.position.set(0, 3.5, 3);
  cabin.castShadow = true;
  g.add(cabin);

  const windowMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, emissive: 0x4488aa, emissiveIntensity: 0.3 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.2), windowMat);
  win.position.set(0, 4.2, 0);
  cabin.add(win);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 })
  );
  mast.position.set(0, 7, 3);
  mast.castShadow = true;
  g.add(mast);

  const navLight = new THREE.PointLight(0xff4444, 1, 15);
  navLight.position.set(0, 11, 3);
  g.add(navLight);

  g.position.set(x, 0, z);
  const vx = (Math.random() - 0.5) * 10;
  const vz = (Math.random() - 0.5) * 10;
  g.lookAt(x + vx, 0, z + vz);

  g.userData = {
    id: targetIdCounter++,
    type: 'ship',
    name: 'COMMERCIAL TRAWLER',
    vel: new THREE.Vector3(vx, 0, vz).normalize().multiplyScalar(0.15),
    mass: Math.floor(Math.random() * 300 + 300) + ' Tons',
    speed: Math.floor(Math.random() * 8 + 5) + ' kn',
    detected: false
  };

  targets.push(g);
  scene.add(g);
  return g;
}

spawnBoat(250, -250);
spawnBoat(35, -55);
spawnBoat(75, -110);
spawnBoat(-180, 120);
spawnBoat(400, 150);

// ──── Plastic Patches ────
function spawnPlastic(x, z) {
  const g = new THREE.Group();
  const colors = [0xffffff, 0xff6666, 0x66aaff, 0xffcc00, 0x88ff88, 0xff88cc];
  for (let i = 0; i < 100; i++) {
    const type = Math.random();
    let mesh;
    if (type < 0.3) {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.3, transparent: true, opacity: 0.8 })
      );
    } else if (type < 0.6) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.random() * 2 + 0.5, Math.random() * 2 + 0.5),
        new THREE.MeshStandardMaterial({ color: 0xeeeedd, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.random() * 1.5 + 0.3, 0.2, Math.random() * 1.5 + 0.3),
        new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.8 })
      );
    }
    mesh.position.set((Math.random() - 0.5) * 40, 0.15, (Math.random() - 0.5) * 40);
    mesh.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
    g.add(mesh);
  }
  g.position.set(x, 0, z);
  g.userData = {
    id: targetIdCounter++,
    type: 'plastic',
    name: 'PLASTIC DEBRIS PATCH',
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03),
    mass: Math.floor(Math.random() * 800 + 200) + ' kg',
    toxicity: ['HIGH', 'CRITICAL', 'MODERATE'][Math.floor(Math.random() * 3)],
    detected: false
  };
  targets.push(g);
  scene.add(g);
}
spawnPlastic(-80, 180);
spawnPlastic(150, -30);
spawnPlastic(-120, -60);
spawnPlastic(300, -180);

// ──── Marine Life ────
function spawnBioCluster(x, z) {
  const g = new THREE.Group();
  const fishMat = new THREE.MeshStandardMaterial({ color: 0x88bbff, metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 25; i++) {
    const fish = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.5, 4), fishMat);
    fish.position.set((Math.random() - 0.5) * 20, -1 + Math.random() * 2, (Math.random() - 0.5) * 20);
    fish.rotation.y = Math.random() * Math.PI * 2;
    g.add(fish);
  }
  for (let i = 0; i < 3; i++) {
    const dolphin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.8, 3, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x5577aa, roughness: 0.3, metalness: 0.4 })
    );
    dolphin.position.set((Math.random() - 0.5) * 15, 0.5, (Math.random() - 0.5) * 15);
    dolphin.rotation.z = Math.PI / 2;
    g.add(dolphin);
  }
  g.position.set(x, 0, z);
  g.userData = {
    id: targetIdCounter++,
    type: 'bio',
    name: 'MARINE LIFE CLUSTER',
    vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08),
    mass: '~' + Math.floor(Math.random() * 50 + 10) + ' specimens',
    species: ['Bottlenose Dolphin Pod', 'Tuna School', 'Sea Turtle Group'][Math.floor(Math.random() * 3)],
    detected: false
  };
  targets.push(g);
  scene.add(g);
}
spawnBioCluster(-60, 80);
spawnBioCluster(100, 200);
spawnBioCluster(30, -180);

/* ═══════════════════════════════════════════════════════
   PATROL WAYPOINTS – drone visits actual target positions
   so detection is FAST and guaranteed
   ═══════════════════════════════════════════════════════ */
function buildWaypoints() {
  // Hit every target directly, then loop
  const pts = targets.map(t => t.position.clone());
  // Add some intermediate patrol sweep points for variety
  pts.push(new THREE.Vector3(0, 0, 0));
  pts.push(new THREE.Vector3(-300, 0, -300));
  pts.push(new THREE.Vector3(300, 0, 300));
  pts.push(new THREE.Vector3(-200, 0, 200));
  // Shuffle for a natural patrol feel
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return pts;
}

let waypoints = buildWaypoints();
let wpTarget = waypoints[0].clone();
wpTarget.y = 0; // ground-level reference

/* ═══════════════════════════════════════════════════════
   RAYCASTING – Click-to-fly & hover cursor
   ═══════════════════════════════════════════════════════ */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const oceanPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane

function getOceanHit(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hitPt = new THREE.Vector3();
  raycaster.ray.intersectPlane(oceanPlane, hitPt);
  return hitPt;
}

// Click listener – set manual target
canvas.addEventListener('click', (e) => {
  // Ignore clicks on UI buttons
  if (e.target !== canvas) return;

  // First try intersecting with targets 
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(targets, true);
  if (intersects.length > 0) {
    let obj = intersects[0].object;
    // Find the root group that has userData.id
    while (obj.parent && typeof obj.userData.id === 'undefined') {
      obj = obj.parent;
    }
    
    // Found a valid target
    if (typeof obj.userData.id !== 'undefined') {
      state.manualTarget = obj;
      state.manualMode = true;
      state.arrivedAtManual = false;
      
      // Update target mode depending on object type
      state.mode = obj.userData.type; 
      state.target = obj;
      
      wpTarget = obj.position.clone();
      wpTarget.y = 0;
      
      wpMarkerGroup.position.set(wpTarget.x, 0, wpTarget.z);
      wpMarkerGroup.visible = true;

      // Auto-mark as detected to show scan line immediately
      if (!obj.userData.detected) {
        obj.userData.detected = true;
        state.detectedSet.add(obj.userData.id);
      }
      
      addLog(`MANUAL OVERRIDE: TRACKING ${obj.userData.name}`, 'alert');
      return; 
    }
  }

  // Fallback to ocean plane waypoint
  const hit = getOceanHit(e);
  if (!hit) return;

  state.manualTarget = hit.clone();
  state.manualMode = true;
  state.arrivedAtManual = false; // reset so arrival fires at new point

  // Place waypoint marker
  wpMarkerGroup.position.set(hit.x, 0, hit.z);
  wpMarkerGroup.visible = true;

  // Override patrol waypoint
  wpTarget = hit.clone();
  wpTarget.y = 0;

  // Scan ALL types at destination (switch to universal scan)
  addLog(`MANUAL TARGET SET → [${hit.x.toFixed(0)}, ${hit.z.toFixed(0)}]`, '');
  addLog('DRONE REDIRECTING TO TARGET POINT...', '');
});

// Double-click to resume patrol
canvas.addEventListener('dblclick', (e) => {
  if (e.target !== canvas) return;
  state.manualMode = false;
  state.manualTarget = null;
  wpMarkerGroup.visible = false;
  state.waypointIndex = 0;
  waypoints = buildWaypoints();
  wpTarget = waypoints[0].clone();
  wpTarget.y = 0;
  addLog('PATROL MODE RESUMED', '');
});

// Mouse move – hover cursor on ocean
canvas.addEventListener('mousemove', (e) => {
  const hit = getOceanHit(e);
  if (hit) {
    state.hoverPoint = hit.clone();
    hoverRingGroup.position.set(hit.x, 0, hit.z);
    hoverRingGroup.visible = true;
  } else {
    hoverRingGroup.visible = false;
  }
});

canvas.addEventListener('mouseleave', () => {
  hoverRingGroup.visible = false;
});

/* ═══════════════════════════════════════════════════════
   MINIMAP
   ═══════════════════════════════════════════════════════ */
const mmCanvas = document.getElementById('minimap-canvas');
const mmCtx = mmCanvas.getContext('2d');
const MM_RANGE = 700;

function drawMinimap() {
  const w = mmCanvas.width, h = mmCanvas.height;
  mmCtx.fillStyle = 'rgba(0, 18, 32, 0.9)';
  mmCtx.fillRect(0, 0, w, h);

  // MPA zone
  const mx = (MPA_CENTER.x / MM_RANGE + 0.5) * w;
  const mz = (MPA_CENTER.z / MM_RANGE + 0.5) * h;
  const mr = (MPA_RADIUS / MM_RANGE) * w;
  mmCtx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.arc(mx, mz, mr, 0, Math.PI * 2);
  mmCtx.stroke();

  // Targets
  targets.forEach(t => {
    const tx = (t.position.x / MM_RANGE + 0.5) * w;
    const tz = (t.position.z / MM_RANGE + 0.5) * h;
    mmCtx.fillStyle = t.userData.type === 'ship' ? '#ff4444' : t.userData.type === 'plastic' ? '#ffaa00' : '#00ff88';
    mmCtx.beginPath();
    mmCtx.arc(tx, tz, 3, 0, Math.PI * 2);
    mmCtx.fill();
    // Detection ring if detected
    if (t.userData.detected) {
      mmCtx.strokeStyle = mmCtx.fillStyle;
      mmCtx.lineWidth = 0.5;
      mmCtx.beginPath();
      mmCtx.arc(tx, tz, 6, 0, Math.PI * 2);
      mmCtx.stroke();
    }
  });

  // Drone
  const dx = (state.uavPos.x / MM_RANGE + 0.5) * w;
  const dz = (state.uavPos.z / MM_RANGE + 0.5) * h;
  // Scan radius on minimap
  const sr = (250 / MM_RANGE) * w;
  mmCtx.strokeStyle = 'rgba(0,255,204,0.08)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.arc(dx, dz, sr, 0, Math.PI * 2);
  mmCtx.stroke();

  mmCtx.fillStyle = '#00ffcc';
  mmCtx.beginPath();
  mmCtx.arc(dx, dz, 4, 0, Math.PI * 2);
  mmCtx.fill();

  // Direction line to current waypoint
  const wTx = (wpTarget.x / MM_RANGE + 0.5) * w;
  const wTz = (wpTarget.z / MM_RANGE + 0.5) * h;
  mmCtx.strokeStyle = state.manualMode ? 'rgba(255,200,0,0.5)' : 'rgba(0,255,204,0.3)';
  mmCtx.setLineDash([3, 4]);
  mmCtx.beginPath();
  mmCtx.moveTo(dx, dz);
  mmCtx.lineTo(wTx, wTz);
  mmCtx.stroke();
  mmCtx.setLineDash([]);

  // Manual target marker on minimap
  if (state.manualMode && state.manualTarget) {
    const mtx = (state.manualTarget.x / MM_RANGE + 0.5) * w;
    const mtz = (state.manualTarget.z / MM_RANGE + 0.5) * h;
    // Pulsing target circle
    const pR = 6 + Math.sin(state.time * 4) * 2;
    mmCtx.strokeStyle = 'rgba(255,200,0,0.8)';
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.arc(mtx, mtz, pR, 0, Math.PI * 2);
    mmCtx.stroke();
    // Crosshair
    mmCtx.strokeStyle = 'rgba(255,200,0,0.5)';
    mmCtx.lineWidth = 0.5;
    mmCtx.beginPath();
    mmCtx.moveTo(mtx - 10, mtz); mmCtx.lineTo(mtx + 10, mtz);
    mmCtx.moveTo(mtx, mtz - 10); mmCtx.lineTo(mtx, mtz + 10);
    mmCtx.stroke();
  }

  // Rotating scan line
  const scanAngle = state.time * 3;
  const scanLX = dx + Math.cos(scanAngle) * sr;
  const scanLZ = dz + Math.sin(scanAngle) * sr;
  mmCtx.strokeStyle = 'rgba(0,255,204,0.25)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(dx, dz);
  mmCtx.lineTo(scanLX, scanLZ);
  mmCtx.stroke();
}

/* ═══════════════════════════════════════════════════════
   INTERACTIONS
   ═══════════════════════════════════════════════════════ */
let activeCam = 'drone';
const $btnDrone = document.getElementById('btn-cam-drone');
const $btnOrbit = document.getElementById('btn-cam-orbit');
const $btnTraffic = document.getElementById('btn-scan-fish');
const $btnPollution = document.getElementById('btn-scan-plastic');
const $btnBio = document.getElementById('btn-scan-bio');

function rstMode() { [$btnTraffic, $btnPollution, $btnBio].forEach(b => b && b.classList.remove('active')); }

$btnTraffic.onclick = () => {
  rstMode(); $btnTraffic.classList.add('active');
  state.mode = 'ship'; state.target = null;
  addLog('INITIATING MARITIME TRAFFIC SCAN...', '');
};
$btnPollution.onclick = () => {
  rstMode(); $btnPollution.classList.add('active');
  state.mode = 'plastic'; state.target = null;
  addLog('SCANNING FOR OCEAN PLASTIC DEBRIS...', 'plastic');
};
$btnBio.onclick = () => {
  rstMode(); $btnBio.classList.add('active');
  state.mode = 'bio'; state.target = null;
  addLog('BIODIVERSITY SCANNER ACTIVATED...', 'bio');
};

function rstCam() { [$btnDrone, $btnOrbit].forEach(b => b && b.classList.remove('active')); }
$btnDrone.onclick = () => {
  activeCam = 'drone'; rstCam(); $btnDrone.classList.add('active');
  controls.enabled = false;
  document.querySelector('.overlay-vignette').style.display = 'block';
  addLog('DRONE CAM ENGAGED');
};
$btnOrbit.onclick = () => {
  activeCam = 'orbit'; rstCam(); $btnOrbit.classList.add('active');
  controls.enabled = true;
  camera.position.set(300, 400, 500);
  controls.target.set(0, 0, 0);
  document.querySelector('.overlay-vignette').style.display = 'none';
  hideBox();
  addLog('OVERVIEW MODE – FREE CAMERA');
};

function hideBox() {
  $box.style.display = 'none';
  $blockMpa.className = 'data-block';
  $valMpa.textContent = 'CLEAR';
  $valMpa.style.color = '#00ffcc';
}

/* ═══════════════════════════════════════════════════════
   SCAN BEAM – 3D visualization lines from drone to targets
   ═══════════════════════════════════════════════════════ */
const scanLines = [];
const scanLineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.35 });

function addScanLine(target) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    state.uavPos.clone(),
    target.position.clone()
  ]);
  const line = new THREE.Line(geo, scanLineMat);
  line.userData.target = target;
  line.userData.life = 1.5;
  scene.add(line);
  scanLines.push(line);
}

/* ═══════════════════════════════════════════════════════
   ANIMATION LOOP
   ═══════════════════════════════════════════════════════ */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp delta
  state.time += dt;

  // Shader time
  oceanMat.uniforms.uTime.value = state.time;

  // MPA ring pulse
  ringMat.opacity = 0.25 + Math.sin(state.time * 2) * 0.1;

  // Animate clouds
  clouds.forEach(c => {
    c.position.x += c.userData.speed * dt * 5;
    if (c.position.x > 1500) c.position.x = -1500;
  });

  // Animate birds
  birds.forEach(b => {
    b.userData.angle += dt * b.userData.speed;
    b.position.x = Math.cos(b.userData.angle) * b.userData.radius;
    b.position.z = Math.sin(b.userData.angle) * b.userData.radius;
    b.position.y = b.userData.baseY + Math.sin(state.time * 2 + b.userData.angle) * 3;
    b.lookAt(
      b.position.x + Math.cos(b.userData.angle + 0.1) * 10,
      b.position.y,
      b.position.z + Math.sin(b.userData.angle + 0.1) * 10
    );
    b.userData.wingL.rotation.z = Math.sin(state.time * 5 + b.userData.angle) * 0.4;
    b.userData.wingR.rotation.z = -Math.sin(state.time * 5 + b.userData.angle) * 0.4;
  });

  // Move targets
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    t.position.add(t.userData.vel);
    t.position.y = Math.sin(state.time + t.position.x * 0.05) * 0.8
                  + Math.cos(state.time * 0.7 + t.position.z * 0.05) * 0.5;
    if (t.userData.type === 'ship') {
      t.rotation.z = Math.sin(state.time + t.position.x * 0.1) * 0.03;
      t.rotation.x = Math.cos(state.time * 0.8 + t.position.z * 0.1) * 0.02;
    }
    
    // Despawn if out of bounds to keep performance and cycle fresh targets
    if (Math.abs(t.position.x) > 2000 || Math.abs(t.position.z) > 2000) {
      if (state.manualTarget === t) {
        state.manualMode = false;
        wpMarkerGroup.visible = false;
      }
      scene.remove(t);
      targets.splice(i, 1);
    }
  }

  // Continuously spawn new objects to maintain a busy ocean
  if (Math.random() < 0.02 && targets.filter(t => t.userData.type === 'ship').length < 25) {
     spawnBoat((Math.random() - 0.5) * 3000, (Math.random() - 0.5) * 3000);
  }
  if (Math.random() < 0.005 && targets.filter(t => t.userData.type === 'plastic').length < 10) {
     spawnPlastic((Math.random() - 0.5) * 3000, (Math.random() - 0.5) * 3000);
  }
  if (Math.random() < 0.01 && targets.filter(t => t.userData.type === 'bio').length < 10) {
     spawnBioCluster((Math.random() - 0.5) * 3000, (Math.random() - 0.5) * 3000);
  }

  // ── DRONE FLIGHT – manual click-to-fly OR patrol ──
  const droneAlt = 100 + Math.sin(state.time * 0.5) * 15;
  
  if (state.manualMode && state.manualTarget instanceof THREE.Group) {
      // Dynamic waypoint follows the target
      wpTarget = state.manualTarget.position.clone();
      wpTarget.y = 0;
      wpMarkerGroup.position.set(wpTarget.x, 0, wpTarget.z);
  }

  const wpFlat = new THREE.Vector3(wpTarget.x, 0, wpTarget.z);
  const uavFlat = new THREE.Vector3(state.uavPos.x, 0, state.uavPos.z);
  const distToWP = uavFlat.distanceTo(wpFlat);

  if (state.manualMode) {
    // Flying to manual click point
    if (distToWP < 25 && !state.arrivedAtManual) {
      state.arrivedAtManual = true;
      // Arrived at manual target – hover and scan
      addLog('ARRIVED AT TARGET POINT – SCANNING AREA...', '');
      // Force re-detect everything in range when arriving
      targets.forEach(t => {
        const dst = t.position.distanceTo(state.uavPos);
        if (dst < 300 && !t.userData.detected) {
          t.userData.detected = true;
          state.detectedSet.add(t.userData.id);
          const conf = Math.floor(Math.random() * 3 + 97);
          if (t.userData.type === 'ship') {
            const illegal = inMPA(t.position);
            addLog(`TARGET ACQUIRED: ${t.userData.name} [${conf}%]${illegal ? ' ⚠ IN MPA!' : ''}`, illegal ? 'alert' : '');
          } else if (t.userData.type === 'plastic') {
            addLog(`DETECTED: ${t.userData.name} – ${t.userData.toxicity} [${conf}%]`, 'plastic');
          } else {
            addLog(`DETECTED: ${t.userData.name} – ${t.userData.species} [${conf}%]`, 'bio');
          }
          addScanLine(t);
        }
      });
      // Stay hovering – don't resume patrol until double-click
      wpMarkerGroup.visible = true;
    }
  } else {
    // Standard patrol mode
    if (distToWP < 30) {
      state.waypointIndex = (state.waypointIndex + 1) % waypoints.length;
      if (state.waypointIndex === 0) {
        waypoints = buildWaypoints();
      }
      wpTarget = waypoints[state.waypointIndex].clone();
      wpTarget.y = 0;
    }
  }

  // Fly towards waypoint (both manual and patrol)
  const flyDir = new THREE.Vector3().subVectors(wpFlat, uavFlat);
  const distFlat = flyDir.length();
  flyDir.normalize();
  // Faster speed when in manual mode (urgent response)
  const baseSpeed = state.manualMode ? 100 : 60;
  // Slow down when approaching target for smooth arrival
  const approachFactor = state.manualMode ? Math.min(1, distFlat / 50) : 1;
  const flySpeed = baseSpeed * approachFactor * dt;
  
  if (distFlat > 2) { // only move if not already there
    state.uavPos.x += flyDir.x * flySpeed;
    state.uavPos.z += flyDir.z * flySpeed;
  }
  state.uavPos.y = droneAlt;

  // Update drone model
  droneGroup.position.copy(state.uavPos);
  const lookAhead = state.uavPos.clone().add(flyDir.clone().multiplyScalar(30));
  lookAhead.y = state.uavPos.y;
  droneGroup.lookAt(lookAhead);
  rotors.forEach(r => r.rotation.y += dt * 30);

  // Animate waypoint marker
  if (wpMarkerGroup.visible) {
    wpDiamond.rotation.y += dt * 2;
    wpDiamond.position.y = 20 + Math.sin(state.time * 3) * 3;
    beamMat.opacity = 0.2 + Math.sin(state.time * 4) * 0.15;
    const pulseScale = 1 + Math.sin(state.time * 2) * 0.3;
    wpRingOuter.scale.set(pulseScale, pulseScale, 1);
    wpRingOuter.material.opacity = 0.25 * (1 - (pulseScale - 1) / 0.3);
    wpRingInner.material.opacity = 0.5 + Math.sin(state.time * 5) * 0.2;
  }

  // Animate hover cursor
  if (hoverRingGroup.visible) {
    hoverRingMat.opacity = 0.15 + Math.sin(state.time * 4) * 0.05;
    hoverRing.scale.set(
      1 + Math.sin(state.time * 3) * 0.1,
      1 + Math.sin(state.time * 3) * 0.1,
      1
    );
  }

  // Scan beam pulse
  scanBeamMat.opacity = 0.02 + Math.sin(state.time * 3) * 0.02;

  // ── SCAN LOGIC – INSTANT detection within range ──
  const SCAN_RANGE = 250; // generous range
  if (state.mode) {
    let closest = null;
    let bestDist = Infinity;

    targets.forEach(t => {
      // Always scan all matching types regardless of camera mode
      if (t.userData.type === state.mode || !state.mode) {
        const dst = t.position.distanceTo(state.uavPos);

        // INSTANT detection when in range
        if (dst < SCAN_RANGE && !t.userData.detected) {
          t.userData.detected = true;
          state.detectedSet.add(t.userData.id);
          const conf = Math.floor(Math.random() * 3 + 97);

          if (t.userData.type === 'ship') {
            const illegal = inMPA(t.position);
            addLog(`TARGET ACQUIRED: ${t.userData.name} [${conf}%]${illegal ? ' ⚠ IN MPA!' : ''}`, illegal ? 'alert' : '');
          } else if (t.userData.type === 'plastic') {
            addLog(`DETECTED: ${t.userData.name} – ${t.userData.toxicity} [${conf}%]`, 'plastic');
          } else {
            addLog(`DETECTED: ${t.userData.name} – ${t.userData.species} [${conf}%]`, 'bio');
          }

          // Visual scan line
          addScanLine(t);
        }

        // Track closest for targeting box
        if (dst < SCAN_RANGE && t.userData.type === state.mode && dst < bestDist) {
          bestDist = dst;
          closest = t;
        }
      }
    });

    state.target = closest;
    if (!closest) {
      if (activeCam === 'drone') hideBox();
    }
  }

  // Update scan lines
  for (let i = scanLines.length - 1; i >= 0; i--) {
    const sl = scanLines[i];
    sl.userData.life -= dt;
    sl.material.opacity = Math.max(0, sl.userData.life * 0.3);
    // Update positions
    const pts = [state.uavPos.clone(), sl.userData.target.position.clone()];
    sl.geometry.setFromPoints(pts);
    if (sl.userData.life <= 0) {
      scene.remove(sl);
      sl.geometry.dispose();
      scanLines.splice(i, 1);
    }
  }

  // ── Camera – smooth tracking behind and above drone ──
  if (activeCam === 'drone') {
    // Camera positioned behind & above drone, looking ahead/down at targets
    const camOffset = flyDir.clone().multiplyScalar(-50); // behind drone
    camOffset.y = 40; // above drone altitude offset
    const desiredCamPos = state.uavPos.clone().add(camOffset);
    desiredCamPos.y = state.uavPos.y + 40;

    camera.position.lerp(desiredCamPos, 0.12);

    // Look target: if tracking a target, look at it; otherwise look ahead and slightly down
    let lookPt;
    if (state.target) {
      lookPt = state.target.position.clone();
      lookPt.y = Math.max(lookPt.y, 0); // don't look underground
    } else {
      lookPt = lookAhead.clone();
      lookPt.y = 0; // look at ocean surface ahead
    }

    if (!camera.userData.lookPt) camera.userData.lookPt = lookPt.clone();
    camera.userData.lookPt.lerp(lookPt, 0.12);
    camera.lookAt(camera.userData.lookPt);
    camera.rotation.z = Math.sin(state.time * 0.8) * 0.008; // very subtle roll

    // Telemetry
    $valAlt.textContent = Math.round(state.uavPos.y) + ' M';
    $valSpd.textContent = Math.round(state.droneSpeed + Math.sin(state.time) * 8) + ' KM/H';
    $valGps.textContent = `N ${(14 + state.uavPos.x * 0.003).toFixed(1)}° W ${(65 + state.uavPos.z * 0.003).toFixed(1)}°`;

    // Battery drain
    state.battery = Math.max(5, 98 - state.time * 0.03);
    $valBat.textContent = Math.round(state.battery) + '%';
    $valBat.className = state.battery < 20 ? 'val alert' : 'val ok';
  }

  // Time display
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  $valTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  // ── Draw HUD Bounding Box ──
  if (activeCam === 'drone' && state.mode && state.target) {
    const tempV = state.target.position.clone();
    tempV.project(camera);

    if (tempV.z < 1 && tempV.x > -1.3 && tempV.x < 1.3 && tempV.y > -1.3 && tempV.y < 1.3) {
      const sx = (tempV.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (tempV.y * -0.5 + 0.5) * window.innerHeight;

      const dist = state.target.position.distanceTo(camera.position);
      const baseSize = Math.max(70, Math.min(250, 18000 / dist));
      const pulse = Math.sin(state.time * 5) * 3;
      const boxW = baseSize * 1.4 + pulse;
      const boxH = baseSize + pulse;

      $box.style.display = 'block';
      $box.style.left = (sx - boxW / 2) + 'px';
      $box.style.top = (sy - boxH / 2) + 'px';
      $box.style.width = boxW + 'px';
      $box.style.height = boxH + 'px';

      $tgtClass.textContent = state.target.userData.name;

      if (state.target.userData.type === 'ship') {
        const illegal = inMPA(state.target.position);
        $tgtData.innerHTML = `MASS: ${state.target.userData.mass} | SPD: ${state.target.userData.speed}<br/>STATUS: ${illegal ? '⚠ ILLEGAL TRAWLING IN MPA' : '✓ AUTHORIZED'}`;
        $box.className = illegal ? 'illegal' : '';

        if (illegal) {
          $blockMpa.className = 'data-block alert';
          $valMpa.textContent = '⚠ VIOLATION';
          $valMpa.className = 'val alert';
        } else {
          $blockMpa.className = 'data-block';
          $valMpa.textContent = 'CLEAR';
          $valMpa.className = 'val ok';
        }
      } else if (state.target.userData.type === 'plastic') {
        $tgtData.innerHTML = `EST. MASS: ${state.target.userData.mass}<br/>TOXICITY: ${state.target.userData.toxicity} | TYPE: MIXED`;
        $box.className = 'plastic';
        $blockMpa.className = 'data-block';
        $valMpa.textContent = 'CLEAR';
        $valMpa.className = 'val ok';
      } else {
        $tgtData.innerHTML = `COUNT: ${state.target.userData.mass}<br/>SPECIES: ${state.target.userData.species}`;
        $box.className = '';
        $box.style.borderColor = '#00ff88';
        $blockMpa.className = 'data-block';
        $valMpa.textContent = 'CLEAR';
        $valMpa.className = 'val ok';
      }
    } else {
      hideBox();
    }
  } else if (activeCam === 'drone' && !state.mode) {
    hideBox();
  }

  // Draw minimap every few frames
  if (Math.floor(state.time * 10) % 2 === 0) drawMinimap();

  controls.update();
  renderer.render(scene, camera);
}

/* ═══════════════════════════════════════════════════════
   RESIZE
   ═══════════════════════════════════════════════════════ */
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ═══════════════════════════════════════════════════════
   BOOT – auto-start scanning
   ═══════════════════════════════════════════════════════ */
addLog('SYSTEM ONLINE – SENSORS NOMINAL', '');
addLog('AUTO-SCAN: MARITIME TRAFFIC MODE', '');
addLog('PATROL ROUTE INITIALIZED – 12 WAYPOINTS', '');

// Auto-activate boat scan button on load
$btnTraffic.classList.add('active');

setTimeout(() => {
  document.getElementById('loading-screen').style.opacity = '0';
  setTimeout(() => document.getElementById('loading-screen').remove(), 1000);
}, 2200);

animate();
