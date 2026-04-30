import * as THREE from 'three';

// ============================================================
// OCEAN CLEANUP 3D SIMULATION — v2
// Brighter sky, bigger boom, multiple cameras, graphs, hover tags
// ============================================================

// ----- GLOBALS -----
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let clock: THREE.Clock;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;

// Camera modes
type CameraMode = 'orbit' | 'top' | 'side' | 'boom' | 'ship' | 'free';
let cameraMode: CameraMode = 'orbit';
let freeCamRotX = 0;
let freeCamRotY = 0.3;
let freeCamDist = 120;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Simulation state
const state = {
  paused: false,
  speed: 1,
  simTime: 0,
  plasticCollected: 0,
  bottles: 0,
  bags: 0,
  containers: 0,
  otherDebris: 0,
  shipCapacity: 0,
  maxCapacity: 500,
  windSpeed: 12.4,
  windDir: 'NW',
  waveHeight: 1.2,
  tideRising: true,
  tidePhase: 0,
  currentSpeed: 0.8,
  waterTemp: 18.3,
  shipArriving: false,
  shipCollecting: false,
  shipDeparting: false,
  collectionCycles: 0,
};

// Graph data history
const graphData = {
  plastic: [] as number[],
  capacity: [] as number[],
  wind: [] as number[],
  wave: [] as number[],
  maxPoints: 120,
  sampleInterval: 0.5,
  lastSampleTime: 0,
};

// Object groups
let ocean: THREE.Mesh;
let boatLeft: THREE.Group;
let boatRight: THREE.Group;
let collectionShip: THREE.Group;
let skyDome: THREE.Mesh;

// Boom geometry references for labeling
let boomMesh: THREE.Mesh;
let netGroup: THREE.Group;

// Debris items
interface DebrisItem {
  mesh: THREE.Mesh;
  type: string;
  weight: number;
  velocity: THREE.Vector3;
  collected: boolean;
  floatOffset: number;
  floatSpeed: number;
}

const debrisItems: DebrisItem[] = [];
const collectedInBoom: DebrisItem[] = [];

// Hover labels registry: mesh -> { title, description }
const labelRegistry = new Map<THREE.Object3D, { title: string; desc: string }>();

// Activity log
const activities: string[] = [];

// ============================================================
// INITIALIZATION
// ============================================================
function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6eaac8, 0.0025);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(0, 55, 110);
  camera.lookAt(0, 0, -10);

  const canvas = document.getElementById('simulation-canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2(-999, -999);

  setupLighting();
  createSky();
  createOcean();
  createBoomSystem();
  createCollectionShip();

  for (let i = 0; i < 80; i++) {
    spawnDebris();
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel);
  setupUI();

  logActivity('Boom system deployed. Floating barriers active.');
  logActivity('Ocean currents directing debris toward collection zone.');

  animate();
}

// ============================================================
// LIGHTING — brighter, sunnier
// ============================================================
function setupLighting() {
  const ambient = new THREE.AmbientLight(0x88bbdd, 0.8);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
  sun.position.set(150, 120, -80);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xaaddff, 0x446688, 0.9);
  scene.add(hemi);

  const fill = new THREE.DirectionalLight(0x88ccff, 0.6);
  fill.position.set(-100, 40, 80);
  scene.add(fill);

  const backLight = new THREE.DirectionalLight(0xffdda0, 0.4);
  backLight.position.set(0, 60, 120);
  scene.add(backLight);
}

// ============================================================
// SKY — much brighter, sunny tropical feel
// ============================================================
function createSky() {
  const skyGeo = new THREE.SphereGeometry(1200, 48, 48);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      uniform float uTime;
      void main() {
        float h = normalize(vWorldPosition).y;
        // Bright tropical sky gradients
        vec3 zenith   = vec3(0.28, 0.55, 0.92);     // bright blue
        vec3 mid      = vec3(0.50, 0.72, 0.95);
        vec3 horizon  = vec3(0.75, 0.88, 0.98);     // almost white horizon
        vec3 belowH   = vec3(0.40, 0.60, 0.78);

        vec3 color;
        if (h > 0.3) {
          color = mix(mid, zenith, smoothstep(0.3, 0.9, h));
        } else if (h > 0.0) {
          color = mix(horizon, mid, smoothstep(0.0, 0.3, h));
        } else {
          color = mix(belowH, horizon, smoothstep(-0.2, 0.0, h));
        }

        // Bright sun glow
        vec3 sunDir = normalize(vec3(0.5, 0.45, -0.3));
        float sunDot = max(dot(normalize(vWorldPosition), sunDir), 0.0);
        // Sun disk
        color += vec3(1.0, 0.97, 0.85) * pow(sunDot, 256.0) * 3.0;
        // Inner glow
        color += vec3(1.0, 0.92, 0.6) * pow(sunDot, 32.0) * 0.6;
        // Outer glow / haze
        color += vec3(1.0, 0.85, 0.5) * pow(sunDot, 6.0) * 0.15;

        // Soft clouds (faked with noise-like pattern)
        float cloud = pow(sunDot, 2.0) * 0.08;
        color += vec3(cloud);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
}

// ============================================================
// OCEAN — bigger, more beautiful
// ============================================================
function createOcean() {
  const oceanGeo = new THREE.PlaneGeometry(1200, 1200, 300, 300);
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0x0077aa) },
      uColor2: { value: new THREE.Color(0x10a5c8) },
      uColor3: { value: new THREE.Color(0x044a6b) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vElevation;
      varying vec3 vNormal;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i); float b = hash(i + vec2(1,0));
        float c = hash(i + vec2(0,1)); float d = hash(i + vec2(1,1));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
      }
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec2 uv = position.xy;
        float wave1 = sin(uv.x * 0.06 + uTime * 0.5) * 1.5;
        float wave2 = sin(uv.y * 0.045 + uTime * 0.35 + 1.5) * 1.0;
        float wave3 = sin((uv.x + uv.y) * 0.09 + uTime * 0.7) * 0.6;
        float wave4 = sin(uv.x * 0.15 - uTime * 0.9) * 0.3;
        float n = noise(uv * 0.02 + uTime * 0.08) * 2.5;
        float elevation = wave1 + wave2 + wave3 + wave4 + n;
        vElevation = elevation;
        vec3 pos = position;
        pos.z = elevation;
        float eps = 0.5;
        float hx1 = sin((uv.x+eps)*0.06+uTime*0.5)*1.5 + sin(uv.y*0.045+uTime*0.35+1.5)*1.0;
        float hx2 = sin((uv.x-eps)*0.06+uTime*0.5)*1.5 + sin(uv.y*0.045+uTime*0.35+1.5)*1.0;
        float hy1 = sin(uv.x*0.06+uTime*0.5)*1.5 + sin((uv.y+eps)*0.045+uTime*0.35+1.5)*1.0;
        float hy2 = sin(uv.x*0.06+uTime*0.5)*1.5 + sin((uv.y-eps)*0.045+uTime*0.35+1.5)*1.0;
        vNormal = normalize(vec3(hx2 - hx1, hy2 - hy1, 2.0 * eps));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      varying vec3 vWorldPos;
      varying float vElevation;
      varying vec3 vNormal;
      void main() {
        float t = (vElevation + 4.0) / 8.0;
        vec3 color = mix(uColor3, uColor1, t);
        color = mix(color, uColor2, smoothstep(0.55, 1.0, t));
        // Sun specular
        vec3 sunDir = normalize(vec3(0.5, 0.45, -0.3));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfDir = normalize(sunDir + viewDir);
        float spec = pow(max(dot(vNormal, halfDir), 0.0), 200.0);
        color += vec3(1.0, 0.95, 0.75) * spec * 1.2;
        // Broader specular
        float spec2 = pow(max(dot(vNormal, halfDir), 0.0), 20.0);
        color += vec3(0.6, 0.75, 0.9) * spec2 * 0.15;
        // Fresnel
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 4.0);
        color += vec3(0.35, 0.55, 0.75) * fresnel * 0.35;
        // Foam on crests
        float foam = smoothstep(2.0, 3.5, vElevation);
        color = mix(color, vec3(0.9, 0.95, 1.0), foam * 0.5);
        // Sky reflection
        color += vec3(0.15, 0.25, 0.4) * max(vNormal.z, 0.0) * 0.2;
        gl_FragColor = vec4(color, 0.93);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });

  ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0;
  scene.add(ocean);
}

// ============================================================
// BOOM SYSTEM — MUCH BIGGER, floats clearly above water
// ============================================================
const BOOM_RADIUS_X = 45;   // width of the U
const BOOM_DEPTH_Z = 50;    // how far the U extends
const BOOM_Y = 3.0;         // height above water — sits ON TOP

function createBoomSystem() {
  const boomGroup = new THREE.Group();

  // Left tow-boat
  boatLeft = createBoat('left');
  boatLeft.position.set(-BOOM_RADIUS_X, BOOM_Y, 0);
  boomGroup.add(boatLeft);
  labelRegistry.set(boatLeft, {
    title: 'Tow Boat (Port)',
    desc: 'One of two vessels towing the floating boom barrier. It maintains the U-shape formation while drifting with the current.',
  });

  // Right tow-boat
  boatRight = createBoat('right');
  boatRight.position.set(BOOM_RADIUS_X, BOOM_Y, 0);
  boatRight.scale.x = -1;
  boomGroup.add(boatRight);
  labelRegistry.set(boatRight, {
    title: 'Tow Boat (Starboard)',
    desc: 'The second tow vessel holding the boom. Together with its partner, they create the U-shaped catch formation.',
  });

  // U-shaped floating boom (big, visible tubular barrier)
  const boomPoints: THREE.Vector3[] = [];
  const segments = 50;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = Math.PI * t;
    const x = Math.cos(angle) * BOOM_RADIUS_X;
    const z = -Math.sin(angle) * BOOM_DEPTH_Z;
    boomPoints.push(new THREE.Vector3(x, BOOM_Y, z));
  }

  const boomCurve = new THREE.CatmullRomCurve3(boomPoints);
  const boomGeo = new THREE.TubeGeometry(boomCurve, 80, 1.2, 12, false);
  const boomMat = new THREE.MeshStandardMaterial({
    color: 0xff7700,
    roughness: 0.35,
    metalness: 0.3,
    emissive: 0xff5500,
    emissiveIntensity: 0.12,
  });
  boomMesh = new THREE.Mesh(boomGeo, boomMat);
  boomGroup.add(boomMesh);
  labelRegistry.set(boomMesh, {
    title: 'Floating Boom Barrier',
    desc: 'A buoyant orange tube that stays on the water surface. It funnels floating plastic debris toward the center of the U-shape for collection.',
  });

  // Large orange floats along the boom
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const angle = Math.PI * t;
    const x = Math.cos(angle) * BOOM_RADIUS_X;
    const z = -Math.sin(angle) * BOOM_DEPTH_Z;
    const floatGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.8, 10);
    const floatMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.4 });
    const floatMesh = new THREE.Mesh(floatGeo, floatMat);
    floatMesh.position.set(x, BOOM_Y, z);
    boomGroup.add(floatMesh);
  }

  // Net below the boom
  netGroup = new THREE.Group();
  createNet(netGroup, boomPoints);
  boomGroup.add(netGroup);
  labelRegistry.set(netGroup, {
    title: 'Collection Net (Skirt)',
    desc: 'A mesh net hanging 5m below the floating boom. It prevents plastic from escaping underneath while allowing marine life to swim below.',
  });

  scene.add(boomGroup);
}

function createNet(parent: THREE.Group, boomPoints: THREE.Vector3[]) {
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x5588aa,
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  const netDepth = 6;
  const stepSize = 2;

  // Panels
  for (let i = 0; i < boomPoints.length - 1; i += stepSize) {
    const p1 = boomPoints[i];
    const p2 = boomPoints[Math.min(i + stepSize, boomPoints.length - 1)];
    const shape = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p2.x, p2.y - netDepth, p2.z,
      p1.x, p1.y, p1.z,
      p2.x, p2.y - netDepth, p2.z,
      p1.x, p1.y - netDepth, p1.z,
    ]);
    shape.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    shape.computeVertexNormals();
    parent.add(new THREE.Mesh(shape, netMat));
  }

  // Horizontal rope lines
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x6699aa, roughness: 0.8 });
  for (let depth = 0; depth <= netDepth; depth += 1.5) {
    const pts: THREE.Vector3[] = boomPoints.map(p => new THREE.Vector3(p.x, p.y - depth, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 50, 0.08, 4, false);
    parent.add(new THREE.Mesh(geo, ropeMat));
  }

  // Vertical rope lines
  for (let i = 0; i < boomPoints.length; i += 4) {
    const p = boomPoints[i];
    const lineGeo = new THREE.CylinderGeometry(0.06, 0.06, netDepth, 4);
    const line = new THREE.Mesh(lineGeo, ropeMat);
    line.position.set(p.x, p.y - netDepth / 2, p.z);
    parent.add(line);
  }
}

function createBoat(side: string): THREE.Group {
  const boat = new THREE.Group();

  // Hull
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0);
  hullShape.lineTo(5, 0);
  hullShape.lineTo(4.2, 2.5);
  hullShape.lineTo(0.8, 2.5);
  hullShape.closePath();
  const extOpts = { depth: 10, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 3 };
  const hull = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hullShape, extOpts),
    new THREE.MeshStandardMaterial({ color: 0x667788, roughness: 0.35, metalness: 0.6 })
  );
  hull.rotation.y = Math.PI / 2;
  hull.position.set(-5, -1.5, -2.5);
  boat.add(hull);

  // Cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 5),
    new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.3, metalness: 0.4 })
  );
  cabin.position.set(0, 3, 0);
  boat.add(cabin);

  // Mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.7, roughness: 0.3 })
  );
  mast.position.set(0, 7, 0);
  boat.add(mast);

  // Warning light
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 2 })
  );
  light.position.set(0, 10.5, 0);
  boat.add(light);

  boat.scale.set(0.85, 0.85, 0.85);
  return boat;
}

// ============================================================
// COLLECTION SHIP
// ============================================================
function createCollectionShip(): void {
  collectionShip = new THREE.Group();

  // Large hull
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(16, 8, 45),
    new THREE.MeshStandardMaterial({ color: 0x3a4d5e, roughness: 0.35, metalness: 0.6 })
  );
  hull.position.y = 2;
  collectionShip.add(hull);

  // Red bottom
  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(14, 3, 43),
    new THREE.MeshStandardMaterial({ color: 0x993322, roughness: 0.5, metalness: 0.3 })
  );
  bottom.position.y = -3;
  collectionShip.add(bottom);

  // Bridge
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8d8e8, roughness: 0.3, metalness: 0.4 })
  );
  bridge.position.set(0, 11, -12);
  collectionShip.add(bridge);

  // Windows
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff, emissive: 0x44aaff, emissiveIntensity: 0.5, transparent: true, opacity: 0.8,
  });
  for (let i = -4; i <= 4; i += 2) {
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), winMat);
    w1.position.set(5.01, 12, -12 + i);
    w1.rotation.y = Math.PI / 2;
    collectionShip.add(w1);
    const w2 = w1.clone();
    w2.position.x = -5.01;
    w2.rotation.y = -Math.PI / 2;
    collectionShip.add(w2);
  }

  // Funnel
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.6, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.5 })
  );
  funnel.position.set(0, 19, -14);
  collectionShip.add(funnel);

  // Crane
  const craneYellow = new THREE.MeshStandardMaterial({ color: 0xeeaa00, roughness: 0.4, metalness: 0.5 });
  const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 10, 6), craneYellow);
  craneBase.position.set(4, 11, 8);
  collectionShip.add(craneBase);
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 18), craneYellow);
  craneArm.position.set(4, 16, 15);
  craneArm.rotation.x = -0.15;
  collectionShip.add(craneArm);

  // Cargo hold
  const hold = new THREE.Mesh(
    new THREE.BoxGeometry(10, 4, 18),
    new THREE.MeshStandardMaterial({ color: 0x2a5040, roughness: 0.6, metalness: 0.2 })
  );
  hold.position.set(0, 7.5, 5);
  collectionShip.add(hold);

  collectionShip.position.set(200, 0, -80);
  collectionShip.scale.set(1.0, 1.0, 1.0);
  scene.add(collectionShip);

  labelRegistry.set(collectionShip, {
    title: 'Collection Vessel',
    desc: 'A large ship equipped with cranes that periodically arrives to extract accumulated plastic from the boom and transport it to port for recycling.',
  });
}

// ============================================================
// PLASTIC DEBRIS
// ============================================================
function spawnDebris() {
  const types = ['bottle', 'bag', 'container', 'other'];
  const type = types[Math.floor(Math.random() * types.length)];
  let mesh: THREE.Mesh;
  let weight: number;

  const colors = [0xddddee, 0xaaccee, 0xffccaa, 0xccffcc, 0xffaaaa, 0xeeddff, 0xaaddcc, 0xffddbb, 0xbbddff];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const typeDescriptions: Record<string, { title: string; desc: string }> = {
    bottle: { title: 'Plastic Bottle', desc: 'A discarded plastic bottle floating on the surface. Weight: 20-50g. Takes 450+ years to decompose.' },
    bag: { title: 'Plastic Bag', desc: 'A thin plastic bag drifting with the current. Often mistaken for jellyfish by marine life.' },
    container: { title: 'Food Container', desc: 'A rigid plastic food container. One of the most common types of ocean debris found worldwide.' },
    other: { title: 'Plastic Fragment', desc: 'Broken piece of larger plastic item. These fragments eventually break into microplastics if not collected.' },
  };

  switch (type) {
    case 'bottle':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 })
      );
      weight = 0.02 + Math.random() * 0.03;
      break;
    case 'bag':
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 5),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true, opacity: 0.55 })
      );
      mesh.scale.set(1, 0.25, 1.3);
      weight = 0.005 + Math.random() * 0.01;
      break;
    case 'container':
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.9),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 })
      );
      weight = 0.05 + Math.random() * 0.05;
      break;
    default:
      const geos = [new THREE.TetrahedronGeometry(0.45), new THREE.DodecahedronGeometry(0.35), new THREE.IcosahedronGeometry(0.35)];
      mesh = new THREE.Mesh(
        geos[Math.floor(Math.random() * geos.length)],
        new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
      );
      weight = 0.01 + Math.random() * 0.04;
      break;
  }

  const angle = Math.random() * Math.PI * 2;
  const dist = 80 + Math.random() * 140;
  mesh.position.set(Math.cos(angle) * dist, BOOM_Y - 0.5 + Math.random() * 0.5, Math.sin(angle) * dist - 40);
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

  const item: DebrisItem = {
    mesh, type, weight,
    velocity: new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, -0.02 - Math.random() * 0.03),
    collected: false,
    floatOffset: Math.random() * Math.PI * 2,
    floatSpeed: 1 + Math.random() * 0.5,
  };

  // Register hover label
  labelRegistry.set(mesh, typeDescriptions[type]);

  debrisItems.push(item);
  scene.add(mesh);
}

// ============================================================
// ANIMATION LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  if (state.paused) {
    renderer.render(scene, camera);
    return;
  }

  const dt = delta * state.speed;
  state.simTime += dt;

  updateOcean(state.simTime);
  updateDebris(dt, state.simTime);
  updateBoomSystem(state.simTime);
  updateCollectionShip(dt);
  updateEnvironmentData(state.simTime);
  updateCamera(state.simTime, dt);
  updateHoverTooltip();
  updateHUD();
  sampleGraphData();

  // Spawn new debris
  if (Math.random() < 0.04 * state.speed) {
    spawnDebris();
  }

  // Trigger ship
  if (collectedInBoom.length > 20 && !state.shipArriving && !state.shipCollecting && !state.shipDeparting) {
    state.shipArriving = true;
    logActivity('Collection ship dispatched. ETA approaching...');
  }

  renderer.render(scene, camera);
}

// ============================================================
// UPDATE FUNCTIONS
// ============================================================
function updateOcean(time: number) {
  (ocean.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  (skyDome.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
}

function updateDebris(dt: number, time: number) {
  const boomCenter = new THREE.Vector3(0, 0, -25);

  for (const item of debrisItems) {
    if (item.collected) continue;

    // Float
    item.mesh.position.y = BOOM_Y - 0.8 + Math.sin(time * item.floatSpeed + item.floatOffset) * 0.4;
    item.mesh.rotation.y += dt * 0.3;
    item.mesh.rotation.x += dt * 0.1;

    // Drift toward boom
    const toBoom = new THREE.Vector3().subVectors(boomCenter, item.mesh.position);
    const distToBoom = toBoom.length();

    if (distToBoom > 8) {
      toBoom.normalize();
      item.velocity.x += toBoom.x * 0.004 * dt * state.speed;
      item.velocity.z += toBoom.z * 0.004 * dt * state.speed;
    }

    item.mesh.position.x += item.velocity.x * dt * 30;
    item.mesh.position.z += item.velocity.z * dt * 30;
    item.velocity.multiplyScalar(0.998);

    // Check boom capture
    const dx = item.mesh.position.x;
    const dz = item.mesh.position.z;
    const distFromCenter = Math.sqrt(dx * dx + (dz + 25) * (dz + 25));

    if (distFromCenter < BOOM_RADIUS_X && dz < 2 && dz > -BOOM_DEPTH_Z - 5) {
      item.velocity.multiplyScalar(0.94);

      if (distFromCenter < BOOM_RADIUS_X - 10 && dz < -8) {
        item.collected = true;
        collectedInBoom.push(item);

        state.plasticCollected += item.weight;
        switch (item.type) {
          case 'bottle': state.bottles++; break;
          case 'bag': state.bags++; break;
          case 'container': state.containers++; break;
          default: state.otherDebris++; break;
        }

        item.mesh.position.set(
          (Math.random() - 0.5) * 20,
          BOOM_Y - 0.5 + Math.random() * 0.3,
          -20 - Math.random() * 15
        );

        if (collectedInBoom.length % 5 === 0) {
          logActivity(`${collectedInBoom.length} debris items trapped in boom system.`);
        }
      }
    }

    // Respawn far debris
    if (distToBoom > 280) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 80;
      item.mesh.position.set(Math.cos(angle) * dist, BOOM_Y - 0.5, Math.sin(angle) * dist - 40);
      item.velocity.set((Math.random() - 0.5) * 0.02, 0, -0.02 - Math.random() * 0.03);
    }
  }
}

function updateBoomSystem(time: number) {
  const bob = 0.5;
  const speed = 0.6;
  if (boatLeft) {
    boatLeft.position.y = BOOM_Y + Math.sin(time * speed) * bob;
    boatLeft.rotation.z = Math.sin(time * speed * 0.8) * 0.04;
    boatLeft.rotation.x = Math.sin(time * speed * 0.5 + 1) * 0.03;
  }
  if (boatRight) {
    boatRight.position.y = BOOM_Y + Math.sin(time * speed + 1.5) * bob;
    boatRight.rotation.z = Math.sin(time * speed * 0.8 + 1.5) * 0.04;
    boatRight.rotation.x = Math.sin(time * speed * 0.5 + 2.5) * 0.03;
  }
}

function updateCollectionShip(dt: number) {
  if (!collectionShip) return;

  collectionShip.position.y = Math.sin(state.simTime * 0.25) * 1.2;
  collectionShip.rotation.z = Math.sin(state.simTime * 0.2) * 0.015;

  if (state.shipArriving) {
    const target = new THREE.Vector3(0, 0, -BOOM_DEPTH_Z - 20);
    const dir = target.clone().sub(collectionShip.position);
    const dist = dir.length();
    if (dist > 5) {
      dir.normalize();
      collectionShip.position.x += dir.x * dt * 10;
      collectionShip.position.z += dir.z * dt * 10;
      collectionShip.rotation.y = Math.atan2(dir.x, dir.z);
    } else {
      state.shipArriving = false;
      state.shipCollecting = true;
      logActivity('Collection ship arrived. Beginning plastic extraction...');
    }
  }

  if (state.shipCollecting) {
    if (collectedInBoom.length > 0 && Math.random() < 0.06 * state.speed) {
      const item = collectedInBoom.pop()!;
      scene.remove(item.mesh);
      state.shipCapacity += item.weight;
      if (collectedInBoom.length % 3 === 0) {
        logActivity(`Ship crane extracting debris... ${collectedInBoom.length} items remaining.`);
      }
      if (collectedInBoom.length === 0) {
        state.shipCollecting = false;
        state.shipDeparting = true;
        state.collectionCycles++;
        logActivity(`Collection complete! Cycle #${state.collectionCycles}. Ship departing for port.`);
      }
    }
  }

  if (state.shipDeparting) {
    collectionShip.position.x += dt * 8;
    collectionShip.position.z -= dt * 4;
    const dist = Math.sqrt(collectionShip.position.x ** 2 + collectionShip.position.z ** 2);
    if (dist > 250) {
      state.shipDeparting = false;
      collectionShip.position.set(200, 0, -80);
      logActivity('Ship departed to port for recycling. Boom system continues collection.');
    }
  }
}

function updateEnvironmentData(time: number) {
  state.windSpeed = 10 + Math.sin(time * 0.1) * 4 + Math.sin(time * 0.03) * 2;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  state.windDir = dirs[Math.floor((Math.sin(time * 0.02) + 1) * 4) % 8];
  state.waveHeight = 1.0 + Math.sin(time * 0.08) * 0.5 + Math.sin(time * 0.15) * 0.3;
  state.tidePhase = time * 0.02;
  state.tideRising = Math.sin(state.tidePhase) > 0;
  state.currentSpeed = 0.5 + Math.sin(time * 0.05) * 0.3 + Math.abs(Math.sin(time * 0.12)) * 0.2;
  state.waterTemp = 17 + Math.sin(time * 0.01) * 2;
}

// ============================================================
// CAMERA SYSTEM — Multiple Angles
// ============================================================
function updateCamera(time: number, _dt: number) {
  switch (cameraMode) {
    case 'orbit': {
      const r = 120;
      const h = 55;
      const speed = 0.018;
      camera.position.x = Math.sin(time * speed) * r;
      camera.position.z = Math.cos(time * speed) * r - 10;
      camera.position.y = h + Math.sin(time * 0.04) * 6;
      camera.lookAt(0, 0, -20);
      break;
    }
    case 'top': {
      camera.position.set(0, 160, -20);
      camera.lookAt(0, 0, -25);
      break;
    }
    case 'side': {
      camera.position.set(130, 20, -25);
      camera.lookAt(0, 2, -25);
      break;
    }
    case 'boom': {
      const bx = Math.sin(time * 0.05) * 15;
      camera.position.set(bx, 12, 15);
      camera.lookAt(0, BOOM_Y, -25);
      break;
    }
    case 'ship': {
      const sp = collectionShip.position;
      camera.position.set(sp.x + 30, sp.y + 25, sp.z + 30);
      camera.lookAt(sp.x, sp.y + 5, sp.z);
      break;
    }
    case 'free': {
      camera.position.x = Math.sin(freeCamRotX) * Math.cos(freeCamRotY) * freeCamDist;
      camera.position.y = Math.sin(freeCamRotY) * freeCamDist;
      camera.position.z = Math.cos(freeCamRotX) * Math.cos(freeCamRotY) * freeCamDist - 20;
      camera.lookAt(0, 0, -20);
      break;
    }
  }
}

// ============================================================
// HOVER TOOLTIP (Raycasting)
// ============================================================
function updateHoverTooltip() {
  const tooltip = document.getElementById('hover-tooltip')!;
  const titleEl = document.getElementById('tooltip-title')!;
  const descEl = document.getElementById('tooltip-desc')!;

  raycaster.setFromCamera(mouse, camera);

  // Gather labeled objects
  const labeledObjects: THREE.Object3D[] = [];
  labelRegistry.forEach((_, obj) => {
    // Gather meshes recursively
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        labeledObjects.push(child);
      }
    });
    if ((obj as THREE.Mesh).isMesh) {
      labeledObjects.push(obj);
    }
  });

  const intersects = raycaster.intersectObjects(labeledObjects, false);

  if (intersects.length > 0) {
    const hit = intersects[0].object;

    // Find which registered object this belongs to
    let labelData: { title: string; desc: string } | undefined;
    let current: THREE.Object3D | null = hit;
    while (current) {
      if (labelRegistry.has(current)) {
        labelData = labelRegistry.get(current);
        break;
      }
      current = current.parent;
    }

    if (labelData) {
      // Convert mouse to screen position
      const x = ((mouse.x + 1) / 2) * window.innerWidth;
      const y = ((1 - mouse.y) / 2) * window.innerHeight;
      tooltip.classList.remove('hidden');
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      titleEl.textContent = labelData.title;
      descEl.textContent = labelData.desc;
      return;
    }
  }

  tooltip.classList.add('hidden');
}

// ============================================================
// GRAPH RENDERING
// ============================================================
function sampleGraphData() {
  if (state.simTime - graphData.lastSampleTime < graphData.sampleInterval) return;
  graphData.lastSampleTime = state.simTime;

  graphData.plastic.push(state.plasticCollected * 1000);
  graphData.capacity.push(Math.min(100, (state.shipCapacity / state.maxCapacity) * 100 * 1000));
  graphData.wind.push(state.windSpeed);
  graphData.wave.push(state.waveHeight);

  // Trim
  if (graphData.plastic.length > graphData.maxPoints) {
    graphData.plastic.shift();
    graphData.capacity.shift();
    graphData.wind.shift();
    graphData.wave.shift();
  }

  // Draw graphs
  drawGraph('graph-plastic', graphData.plastic, '#2eaadc', 'rgba(46,170,220,0.15)');
  drawGraph('graph-capacity', graphData.capacity, '#34d399', 'rgba(52,211,153,0.15)');
  drawGraph('graph-wind', graphData.wind, '#fbbf24', 'rgba(251,191,36,0.15)');
  drawGraph('graph-wave', graphData.wave, '#818cf8', 'rgba(129,140,248,0.15)');
}

function drawGraph(canvasId: string, data: number[], strokeColor: string, fillColor: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas || data.length < 2) return;

  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  // Handle DPR
  if (canvas.getAttribute('data-dpr') !== String(dpr)) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.setAttribute('data-dpr', String(dpr));
  }

  const cw = canvas.width;
  const ch = canvas.height;

  ctx.clearRect(0, 0, cw, ch);

  const maxVal = Math.max(...data, 1) * 1.1;
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;

  const stepX = cw / (data.length - 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(46, 170, 220, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const gy = (ch * i) / 3;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(cw, gy);
    ctx.stroke();
  }

  // Fill
  ctx.beginPath();
  ctx.moveTo(0, ch);
  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = ch - ((data[i] - minVal) / range) * (ch - 4);
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo((data.length - 1) * stepX, ch);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = ch - ((data[i] - minVal) / range) * (ch - 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();

  // Latest value label
  const latest = data[data.length - 1];
  ctx.fillStyle = strokeColor;
  ctx.font = `bold ${10 * dpr}px Inter, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(latest.toFixed(1), cw - 4 * dpr, 14 * dpr);
}

// ============================================================
// HUD UPDATE
// ============================================================
function updateHUD() {
  setText('wind-speed', `${state.windSpeed.toFixed(1)} km/h`);
  setText('wind-dir', state.windDir);
  setText('wave-height', `${state.waveHeight.toFixed(1)} m`);
  setText('tide-status', state.tideRising ? '↑ Rising' : '↓ Falling');
  setText('current-speed', `${state.currentSpeed.toFixed(1)} m/s`);
  setText('water-temp', `${state.waterTemp.toFixed(1)}°C`);

  setText('plastic-collected', `${(state.plasticCollected * 1000).toFixed(0)} kg`);
  setText('bottles-count', `${state.bottles}`);
  setText('bags-count', `${state.bags}`);
  setText('containers-count', `${state.containers}`);
  setText('other-count', `${state.otherDebris}`);
  setText('cycles-count', `${state.collectionCycles}`);

  const capacity = Math.min(100, (state.shipCapacity / state.maxCapacity) * 100 * 1000);
  setText('ship-capacity', `${capacity.toFixed(1)}%`);

  const totalSec = Math.floor(state.simTime);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  setText('sim-time', `${pad(hours)}:${pad(mins)}:${pad(secs)}`);

  if (activities.length > 0) {
    setText('activity-text', activities[activities.length - 1]);
  }
}

// ============================================================
// UI SETUP
// ============================================================
function setupUI() {
  const playBtn = document.getElementById('btn-play')!;
  const pauseBtn = document.getElementById('btn-pause')!;
  const speedBtn = document.getElementById('btn-speed')!;
  const resetBtn = document.getElementById('btn-reset')!;
  const infoOverlay = document.getElementById('info-overlay')!;
  const closeInfo = document.getElementById('close-info')!;
  const infoBtn = document.getElementById('btn-info')!;
  const toggleGraphs = document.getElementById('toggle-graphs')!;
  const graphsBody = document.getElementById('graphs-body')!;

  playBtn.addEventListener('click', () => {
    state.paused = false;
    playBtn.classList.add('active');
    pauseBtn.classList.remove('active');
  });

  pauseBtn.addEventListener('click', () => {
    state.paused = true;
    pauseBtn.classList.add('active');
    playBtn.classList.remove('active');
  });

  const speeds = [1, 2, 4, 8];
  const labels = ['1×', '2×', '4×', '8×'];
  speedBtn.addEventListener('click', () => {
    const idx = speeds.indexOf(state.speed);
    const next = (idx + 1) % speeds.length;
    state.speed = speeds[next];
    speedBtn.textContent = labels[next];
    logActivity(`Simulation speed: ${labels[next]}`);
  });

  resetBtn.addEventListener('click', () => {
    for (const item of debrisItems) scene.remove(item.mesh);
    debrisItems.length = 0;
    collectedInBoom.length = 0;
    state.plasticCollected = 0;
    state.bottles = 0;
    state.bags = 0;
    state.containers = 0;
    state.otherDebris = 0;
    state.shipCapacity = 0;
    state.shipArriving = false;
    state.shipCollecting = false;
    state.shipDeparting = false;
    state.simTime = 0;
    state.collectionCycles = 0;
    collectionShip.position.set(200, 0, -80);
    graphData.plastic.length = 0;
    graphData.capacity.length = 0;
    graphData.wind.length = 0;
    graphData.wave.length = 0;
    for (let i = 0; i < 80; i++) spawnDebris();
    logActivity('Simulation reset. New cleanup operation started.');
  });

  closeInfo.addEventListener('click', () => infoOverlay.classList.add('hidden'));
  infoBtn.addEventListener('click', () => infoOverlay.classList.remove('hidden'));

  // Toggle graphs
  let graphsCollapsed = false;
  toggleGraphs.addEventListener('click', () => {
    graphsCollapsed = !graphsCollapsed;
    if (graphsCollapsed) {
      graphsBody.classList.add('collapsed');
      toggleGraphs.textContent = '+';
    } else {
      graphsBody.classList.remove('collapsed');
      toggleGraphs.textContent = '−';
    }
  });

  // Camera mode buttons
  const camModes: { id: string; mode: CameraMode }[] = [
    { id: 'cam-orbit', mode: 'orbit' },
    { id: 'cam-top', mode: 'top' },
    { id: 'cam-side', mode: 'side' },
    { id: 'cam-boom', mode: 'boom' },
    { id: 'cam-ship', mode: 'ship' },
    { id: 'cam-free', mode: 'free' },
  ];
  for (const cm of camModes) {
    const btn = document.getElementById(cm.id);
    if (btn) {
      btn.addEventListener('click', () => {
        cameraMode = cm.mode;
        // Update active state
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        logActivity(`Camera: ${cm.mode === 'free' ? 'Free Look (drag to rotate, scroll to zoom)' : cm.mode.charAt(0).toUpperCase() + cm.mode.slice(1) + ' view'}`);
      });
    }
  }
}

// ============================================================
// MOUSE / INPUT
// ============================================================
function onMouseMove(e: MouseEvent) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (isDragging && cameraMode === 'free') {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    freeCamRotX -= dx * 0.005;
    freeCamRotY += dy * 0.005;
    freeCamRotY = Math.max(-0.2, Math.min(1.4, freeCamRotY));
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
}

function onMouseDown(e: MouseEvent) {
  if (cameraMode === 'free') {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
}

function onMouseUp() {
  isDragging = false;
}

function onWheel(e: WheelEvent) {
  if (cameraMode === 'free') {
    freeCamDist += e.deltaY * 0.1;
    freeCamDist = Math.max(30, Math.min(300, freeCamDist));
  }
}

// ============================================================
// UTILITIES
// ============================================================
function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function logActivity(msg: string) {
  activities.push(msg);
  if (activities.length > 50) activities.shift();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// START
// ============================================================
init();
