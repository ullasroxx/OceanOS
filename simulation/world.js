// ═══════════════════════════════════════════════════════════════
// OceanOS — UNIFIED WORLD SIMULATION
// Combines: Ocean Cleanup, Drone Patrol, Factory Pollution, River
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ═══════════════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════════════
const API = 'http://localhost:3001/api';
let scene, camera, renderer, controls, clock;

const world = {
  time: 0,
  currentZone: 'overview',
  plasticCollected: 0,
  pollutionLevel: 0,
  riverFill: 0,
  droneStatus: 'PATROL',
  debrisItems: [],
  riverPlastics: [],
  oilParticles: [],
  smokeParticles: [],
};

// Zone camera positions
const ZONES = {
  overview:      { pos: [0, 200, 400], target: [0, 0, 0] },
  'ocean-cleanup': { pos: [-300, 80, -200], target: [-300, 0, -300] },
  'drone-patrol':  { pos: [300, 150, 100], target: [300, 0, 0] },
  pollution:     { pos: [0, 60, 500], target: [50, 10, 450] },
  river:         { pos: [-500, 40, 200], target: [-500, 0, 250] },
};

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function init() {
  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1628, 0.0004);

  // Camera
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 8000);
  camera.position.set(0, 200, 400);

  // Renderer
  const canvas = document.getElementById('sim-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Controls
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 30;
  controls.maxDistance = 800;

  clock = new THREE.Clock();

  // Build world
  createLighting();
  createSky();
  createOcean();
  createOceanCleanupZone();
  createDronePatrolZone();
  createPollutionZone();
  createRiverZone();
  createEnvironment();

  // Events
  addEventListener('resize', onResize);
  setupZoneNav();

  // Hide loading
  setTimeout(() => document.getElementById('loading').classList.add('hidden'), 2200);

  animate();
}

// ═══════════════════════════════════════════════════════
// LIGHTING
// ═══════════════════════════════════════════════════════
function createLighting() {
  scene.add(new THREE.AmbientLight(0x8cb4d0, 0.6));

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
  sun.position.set(300, 250, -400);
  sun.castShadow = true;
  sun.shadow.camera.left = -800;
  sun.shadow.camera.right = 800;
  sun.shadow.camera.top = 800;
  sun.shadow.camera.bottom = -800;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0x87ceeb, 0x44aa88, 0.5));

  const fill = new THREE.DirectionalLight(0x88ccff, 0.4);
  fill.position.set(-200, 100, 300);
  scene.add(fill);
}

// ═══════════════════════════════════════════════════════
// SKY
// ═══════════════════════════════════════════════════════
function createSky() {
  const geo = new THREE.SphereGeometry(4000, 48, 48);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: `varying vec3 vWP; void main(){ vWP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWP,1.0); }`,
    fragmentShader: `
      varying vec3 vWP;
      void main(){
        vec3 dir = normalize(vWP);
        float y = dir.y * 0.5 + 0.5;
        vec3 zenith = vec3(0.15, 0.38, 0.82);
        vec3 horizon = vec3(0.55, 0.75, 0.92);
        vec3 col = mix(horizon, zenith, pow(y, 0.5));
        vec3 sunDir = normalize(vec3(0.4, 0.35, -0.5));
        float sunDot = max(0.0, dot(dir, sunDir));
        col += vec3(1.0, 0.95, 0.8) * pow(sunDot, 200.0) * 2.5;
        col += vec3(1.0, 0.85, 0.6) * pow(sunDot, 8.0) * 0.25;
        col = mix(col, vec3(0.8, 0.88, 0.95), pow(1.0 - y, 10.0));
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  scene.add(new THREE.Mesh(geo, mat));
}

// ═══════════════════════════════════════════════════════
// OCEAN
// ═══════════════════════════════════════════════════════
let oceanMat;
function createOcean() {
  const geo = new THREE.PlaneGeometry(6000, 6000, 200, 200);
  oceanMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSunPos: { value: new THREE.Vector3(300, 250, -400) } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWP; varying vec3 vNormal; varying float vElev;
      void main(){
        vec3 p = position;
        float w1 = sin(p.x * 0.008 + uTime * 0.5) * 3.0;
        float w2 = cos(p.y * 0.006 + uTime * 0.35) * 2.5;
        float w3 = sin((p.x+p.y)*0.005+uTime*0.7)*1.5;
        p.z = w1+w2+w3;
        vElev = p.z;
        float eps=1.0;
        float hx = sin((p.x+eps)*0.008+uTime*0.5)*3.0-sin((p.x-eps)*0.008+uTime*0.5)*3.0;
        float hy = cos((p.y+eps)*0.006+uTime*0.35)*2.5-cos((p.y-eps)*0.006+uTime*0.35)*2.5;
        vNormal = normalize(vec3(-hx, 2.0*eps, -hy));
        vWP = (modelMatrix * vec4(p,1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWP,1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunPos;
      varying vec3 vWP; varying vec3 vNormal; varying float vElev;
      void main(){
        vec3 deep = vec3(0.01, 0.06, 0.2);
        vec3 shallow = vec3(0.04, 0.4, 0.55);
        float d = smoothstep(-4.0, 5.0, vElev);
        vec3 col = mix(deep, shallow, d);
        vec3 sunDir = normalize(uSunPos - vWP);
        vec3 viewDir = normalize(cameraPosition - vWP);
        vec3 halfDir = normalize(sunDir + viewDir);
        float spec = pow(max(0.0, dot(vNormal, halfDir)), 150.0);
        col += vec3(1.0, 0.95, 0.85) * spec * 0.9;
        float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 3.0);
        col += vec3(0.3, 0.5, 0.7) * fresnel * 0.3;
        float foam = smoothstep(3.0, 5.0, vElev);
        col = mix(col, vec3(0.85, 0.92, 1.0), foam * 0.3);
        gl_FragColor = vec4(col, 0.92);
      }`,
    transparent: true,
    side: THREE.DoubleSide
  });
  const ocean = new THREE.Mesh(geo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.receiveShadow = true;
  scene.add(ocean);
}

// ═══════════════════════════════════════════════════════
// ZONE 1: OCEAN CLEANUP (centered at -300, 0, -300)
// ═══════════════════════════════════════════════════════
let boomBoatL, boomBoatR;
function createOceanCleanupZone() {
  const OFFSET = new THREE.Vector3(-300, 0, -300);
  const group = new THREE.Group();
  group.position.copy(OFFSET);

  // Boom barrier (U-shape)
  const BOOM_RX = 45, BOOM_DZ = 50, BOOM_Y = 3;
  const points = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50, a = Math.PI * t;
    points.push(new THREE.Vector3(Math.cos(a)*BOOM_RX, BOOM_Y, -Math.sin(a)*BOOM_DZ));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const boomGeo = new THREE.TubeGeometry(curve, 80, 1.2, 10, false);
  const boomMat = new THREE.MeshStandardMaterial({ color: 0xff7700, roughness: 0.35, metalness: 0.3, emissive: 0xff5500, emissiveIntensity: 0.1 });
  group.add(new THREE.Mesh(boomGeo, boomMat));

  // Floats
  for (let i = 0; i <= 50; i += 3) {
    const t = i/50, a = Math.PI*t;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,0.7,8), new THREE.MeshStandardMaterial({color:0xff8800}));
    f.position.set(Math.cos(a)*BOOM_RX, BOOM_Y, -Math.sin(a)*BOOM_DZ);
    group.add(f);
  }

  // Tow boats
  boomBoatL = createSimpleBoat(0x667788);
  boomBoatL.position.set(-BOOM_RX, BOOM_Y, 0);
  group.add(boomBoatL);

  boomBoatR = createSimpleBoat(0x667788);
  boomBoatR.position.set(BOOM_RX, BOOM_Y, 0);
  boomBoatR.scale.x = -1;
  group.add(boomBoatR);

  // Collection ship (parked nearby)
  const ship = createCollectionShip();
  ship.position.set(80, 0, -80);
  group.add(ship);

  // Net (semi-transparent)
  const netMat = new THREE.MeshStandardMaterial({ color: 0x5588aa, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  for (let i = 0; i < points.length - 2; i += 3) {
    const p1 = points[i], p2 = points[Math.min(i+3, points.length-1)];
    const verts = new Float32Array([p1.x,p1.y,p1.z, p2.x,p2.y,p2.z, p2.x,p2.y-5,p2.z, p1.x,p1.y,p1.z, p2.x,p2.y-5,p2.z, p1.x,p1.y-5,p1.z]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, netMat));
  }

  scene.add(group);

  // Spawn debris in ocean cleanup area
  for (let i = 0; i < 60; i++) spawnOceanDebris(OFFSET);
}

function createSimpleBoat(color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(4,2,9), new THREE.MeshStandardMaterial({color, roughness:0.35, metalness:0.6})));
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3,2.5,4), new THREE.MeshStandardMaterial({color:0xeeeeff}));
  cabin.position.y = 2.5;
  g.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.15,5,6), new THREE.MeshStandardMaterial({color:0x888899, metalness:0.7}));
  mast.position.y = 5.5;
  g.add(mast);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.3,8,8), new THREE.MeshStandardMaterial({color:0xff4400, emissive:0xff4400, emissiveIntensity:2}));
  light.position.y = 8;
  g.add(light);
  return g;
}

function createCollectionShip() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(14,7,40), new THREE.MeshStandardMaterial({color:0x3a4d5e, roughness:0.35, metalness:0.6})));
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(9,8,10), new THREE.MeshStandardMaterial({color:0xd8d8e8}));
  bridge.position.set(0,8,-10);
  g.add(bridge);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1,1.4,7,8), new THREE.MeshStandardMaterial({color:0x222233}));
  funnel.position.set(0,15,-12);
  g.add(funnel);
  return g;
}

function spawnOceanDebris(offset) {
  const colors = [0xddddee, 0xaaccee, 0xffccaa, 0xccffcc, 0xffaaaa];
  const color = colors[Math.floor(Math.random()*colors.length)];
  const types = [
    () => new THREE.CylinderGeometry(0.2,0.25,1,8),
    () => { const g = new THREE.SphereGeometry(0.5,6,4); return g; },
    () => new THREE.BoxGeometry(0.6,0.4,0.8),
    () => new THREE.TetrahedronGeometry(0.4)
  ];
  const mesh = new THREE.Mesh(types[Math.floor(Math.random()*types.length)](), new THREE.MeshStandardMaterial({color, roughness:0.4, transparent:true, opacity:0.85}));
  const angle = Math.random()*Math.PI*2, dist = 30+Math.random()*100;
  mesh.position.set(offset.x + Math.cos(angle)*dist, 2.5+Math.random()*0.5, offset.z + Math.sin(angle)*dist);
  mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
  scene.add(mesh);
  world.debrisItems.push({
    mesh, offset,
    vel: new THREE.Vector3((Math.random()-0.5)*0.01, 0, (Math.random()-0.5)*0.01),
    floatOff: Math.random()*Math.PI*2,
    floatSpd: 1+Math.random()*0.5
  });
}

// ═══════════════════════════════════════════════════════
// ZONE 2: DRONE PATROL (centered at 300, 0, 0)
// ═══════════════════════════════════════════════════════
let droneGroup, droneRotors = [];
function createDronePatrolZone() {
  const OFF = new THREE.Vector3(300, 0, 0);

  // MPA Ring
  const ringGeo = new THREE.RingGeometry(120, 123, 64);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:0x00ffcc, transparent:true, opacity:0.3, side:THREE.DoubleSide}));
  ring.rotation.x = -Math.PI/2;
  ring.position.set(OFF.x, 0.5, OFF.z);
  scene.add(ring);

  // Buoys around MPA
  for (let i = 0; i < 10; i++) {
    const a = (i/10)*Math.PI*2;
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(1.2,8,6), new THREE.MeshStandardMaterial({color:0xff6600, emissive:0xff3300, emissiveIntensity:0.3}));
    buoy.position.set(OFF.x+Math.cos(a)*121, 1.5, OFF.z+Math.sin(a)*121);
    scene.add(buoy);
  }

  // Islands
  createIsland(OFF.x-120, OFF.z-100, 35, 20);
  createIsland(OFF.x+150, OFF.z+80, 50, 30);
  createIsland(OFF.x+80, OFF.z-150, 25, 15);

  // Fishing boats in patrol area
  for (let i = 0; i < 4; i++) {
    const boat = createSimpleBoat(0xeeeeee);
    boat.position.set(OFF.x + (Math.random()-0.5)*200, 0, OFF.z + (Math.random()-0.5)*200);
    boat.scale.set(0.7,0.7,0.7);
    scene.add(boat);
  }

  // Plastic patches
  for (let i = 0; i < 3; i++) {
    const patchGroup = new THREE.Group();
    for (let j = 0; j < 40; j++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(Math.random()+0.3, 0.15, Math.random()+0.3),
        new THREE.MeshStandardMaterial({color: [0xffffff,0xff6666,0x66aaff,0xffcc00][Math.floor(Math.random()*4)], roughness:0.8})
      );
      m.position.set((Math.random()-0.5)*25, 0.1, (Math.random()-0.5)*25);
      patchGroup.add(m);
    }
    patchGroup.position.set(OFF.x+(Math.random()-0.5)*180, 0, OFF.z+(Math.random()-0.5)*180);
    scene.add(patchGroup);
  }

  // Drone
  droneGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3,1.2,5), new THREE.MeshStandardMaterial({color:0x222222, metalness:0.8, roughness:0.3}));
  droneGroup.add(body);

  const armMat = new THREE.MeshStandardMaterial({color:0x333333, metalness:0.6});
  const rotorMat = new THREE.MeshStandardMaterial({color:0x00ffcc, transparent:true, opacity:0.5});
  [[-3,0,-2.5],[3,0,-2.5],[-3,0,2.5],[3,0,2.5]].forEach(([ax,ay,az]) => {
    droneGroup.add(new THREE.Mesh(new THREE.BoxGeometry(3,0.3,0.3), armMat));
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,0.08,12), rotorMat);
    rotor.position.set(ax, ay+0.6, az);
    droneGroup.add(rotor);
    droneRotors.push(rotor);
  });

  // Scan beam
  const beam = new THREE.Mesh(new THREE.ConeGeometry(20,60,12,1,true), new THREE.MeshBasicMaterial({color:0x00ffcc, transparent:true, opacity:0.03, side:THREE.DoubleSide, depthWrite:false}));
  beam.position.y = -35;
  droneGroup.add(beam);

  // Drone light
  const dl = new THREE.PointLight(0x00ffcc, 2, 30);
  dl.position.set(0,-1,0);
  droneGroup.add(dl);

  droneGroup.position.set(OFF.x, 100, OFF.z);
  scene.add(droneGroup);
}

function createIsland(x, z, radius, height) {
  const g = new THREE.Group();
  g.position.set(x, -2, z);

  // Shelf
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius+15, radius+25, 3, 20), new THREE.MeshStandardMaterial({color:0x3a8898, transparent:true, opacity:0.4})));

  // Beach
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(radius+6, radius+12, 2, 16), new THREE.MeshStandardMaterial({color:0xf0dca0, roughness:1}));
  beach.position.y = 0.5;
  g.add(beach);

  // Body
  const body = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 12), new THREE.MeshStandardMaterial({color:0x1a6b2a, roughness:0.85}));
  body.position.y = height/2+1;
  body.castShadow = true;
  g.add(body);

  // Trees
  for (let i = 0; i < 5; i++) {
    const a = Math.random()*Math.PI*2, d = Math.random()*(radius-5)*0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.4,6,6), new THREE.MeshStandardMaterial({color:0x6b4226}));
    trunk.position.set(Math.cos(a)*d, height*0.3+3, Math.sin(a)*d);
    g.add(trunk);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(2,4,5), new THREE.MeshStandardMaterial({color:0x1a8b3a, side:THREE.DoubleSide}));
    leaf.position.set(Math.cos(a)*d, height*0.3+7, Math.sin(a)*d);
    g.add(leaf);
  }

  scene.add(g);
}

// ═══════════════════════════════════════════════════════
// ZONE 3: FACTORY / POLLUTION (centered at 50, 0, 450)
// ═══════════════════════════════════════════════════════
let buoyAlert, factoryGroup;
function createPollutionZone() {
  const OFF = new THREE.Vector3(50, 0, 450);

  // Shore / Land
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(100, 200), new THREE.MeshStandardMaterial({color:0x8B7355, roughness:0.9}));
  shore.rotation.x = -Math.PI/2;
  shore.position.set(OFF.x+50, 2, OFF.z);
  shore.receiveShadow = true;
  scene.add(shore);

  const beach = new THREE.Mesh(new THREE.PlaneGeometry(16, 200), new THREE.MeshStandardMaterial({color:0xc2b280, roughness:0.95}));
  beach.rotation.x = -Math.PI/2-0.08;
  beach.position.set(OFF.x+12, 0.8, OFF.z);
  scene.add(beach);

  // Factory
  factoryGroup = new THREE.Group();

  // Foundation
  factoryGroup.add(new THREE.Mesh(new THREE.BoxGeometry(20,4,28), new THREE.MeshStandardMaterial({color:0x555555, roughness:0.9})));

  // Main building
  const bldg = new THREE.Mesh(new THREE.BoxGeometry(14,10,18), new THREE.MeshStandardMaterial({color:0x8899aa, roughness:0.8, metalness:0.2}));
  bldg.position.y = 7;
  bldg.castShadow = true;
  factoryGroup.add(bldg);

  // Accent band
  const accent = new THREE.Mesh(new THREE.BoxGeometry(14.1,2,18.1), new THREE.MeshStandardMaterial({color:0x2266aa}));
  accent.position.y = 3;
  factoryGroup.add(accent);

  // Chimneys
  const chimMat = new THREE.MeshStandardMaterial({color:0xcc5533, roughness:0.85});
  [[-3,-4,8],[3,-4,10],[-3,5,7]].forEach(([cx,cz,ch]) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.1,ch,12), chimMat);
    c.position.set(cx, 12+ch/2, cz);
    c.castShadow = true;
    factoryGroup.add(c);
    // Stripes
    for (let s = 0; s < 2; s++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.95,1.0,0.5,12), new THREE.MeshStandardMaterial({color: s%2===0?0xeeeeee:0xcc2200}));
      b.position.set(cx, 12+ch-1-s*0.7, cz);
      factoryGroup.add(b);
    }
  });

  // Windows
  const winMat = new THREE.MeshStandardMaterial({color:0xffeebb, emissive:0xffcc44, emissiveIntensity:0.6, transparent:true, opacity:0.9});
  [[-7.05,7,3],[-7.05,7,-3],[7.05,7,3],[7.05,7,-3]].forEach(([wx,wy,wz]) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6,2), winMat);
    w.position.set(wx,wy,wz);
    w.rotation.y = wx < 0 ? -Math.PI/2 : Math.PI/2;
    factoryGroup.add(w);
  });

  factoryGroup.position.set(OFF.x+35, 2, OFF.z);
  scene.add(factoryGroup);

  // Oil pipe
  const pipePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(OFF.x+25,4,OFF.z-2), new THREE.Vector3(OFF.x+10,3,OFF.z),
    new THREE.Vector3(OFF.x-2,1.5,OFF.z+2), new THREE.Vector3(OFF.x-8,0.3,OFF.z+3)
  ]);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(pipePath,20,0.45,8,false), new THREE.MeshStandardMaterial({color:0x3a3a3a, metalness:0.7}));
  pipe.castShadow = true;
  scene.add(pipe);

  // Detection buoy
  const buoyG = new THREE.Group();
  buoyG.add(new THREE.Mesh(new THREE.SphereGeometry(1,24,16), new THREE.MeshStandardMaterial({color:0xee8800, roughness:0.3, metalness:0.4})));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,2.5,8), new THREE.MeshStandardMaterial({color:0x888888, metalness:0.8}));
  mast.position.y = 1.5;
  buoyG.add(mast);
  buoyAlert = new THREE.Mesh(new THREE.SphereGeometry(0.3,12,12), new THREE.MeshStandardMaterial({color:0x00ff66, emissive:0x00ff66, emissiveIntensity:1.5}));
  buoyAlert.position.y = 3;
  buoyG.add(buoyAlert);
  buoyG.add(new THREE.PointLight(0x00ff66, 2, 12));
  buoyG.position.set(OFF.x-20, 0.5, OFF.z+8);
  scene.add(buoyG);

  // Storage tanks
  [40,45,42].forEach((tx,i) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2,2,5+i,12), new THREE.MeshStandardMaterial({color:0x666666+i*0x111111, metalness:0.4}));
    t.position.set(OFF.x+tx, 2+(5+i)/2, OFF.z+8-i*4);
    t.castShadow = true;
    scene.add(t);
  });
}

// ═══════════════════════════════════════════════════════
// ZONE 4: RIVER COLLECTION (centered at -500, 0, 200)
// ═══════════════════════════════════════════════════════
let riverWaterMat, netGroup, riverBuoys = [];
function createRiverZone() {
  const OFF = new THREE.Vector3(-500, 0, 200);
  const RIVER_W = 18, RIVER_L = 100;

  // River banks (left)
  const lbGeo = new THREE.PlaneGeometry(25, RIVER_L, 20, 40);
  lbGeo.rotateX(-Math.PI/2);
  const lbPos = lbGeo.attributes.position;
  for (let i = 0; i < lbPos.count; i++) {
    const x = lbPos.getX(i);
    lbPos.setY(i, Math.max(0, (x+12)/25)*3 + Math.random()*0.3);
  }
  lbGeo.computeVertexNormals();
  const bankMat = new THREE.MeshStandardMaterial({color:0x4a7c3f, roughness:0.9, flatShading:true});
  const lb = new THREE.Mesh(lbGeo, bankMat);
  lb.position.set(OFF.x-RIVER_W/2-12, 0, OFF.z);
  lb.receiveShadow = true;
  scene.add(lb);

  // Right bank
  const rbGeo = new THREE.PlaneGeometry(25, RIVER_L, 20, 40);
  rbGeo.rotateX(-Math.PI/2);
  const rbPos = rbGeo.attributes.position;
  for (let i = 0; i < rbPos.count; i++) {
    const x = rbPos.getX(i);
    rbPos.setY(i, Math.max(0, (-x+12)/25)*3 + Math.random()*0.3);
  }
  rbGeo.computeVertexNormals();
  const rb = new THREE.Mesh(rbGeo, bankMat.clone());
  rb.position.set(OFF.x+RIVER_W/2+12, 0, OFF.z);
  rb.receiveShadow = true;
  scene.add(rb);

  // Trees
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 15; i++) {
      const tg = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.2,2+Math.random()*2,6), new THREE.MeshStandardMaterial({color:0x5d4037}));
      tg.add(trunk);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.8+Math.random()*0.6, 2+Math.random(), 6), new THREE.MeshStandardMaterial({color:0x2e7d32+Math.floor(Math.random()*0x001000), flatShading:true}));
      leaf.position.y = 2+Math.random();
      tg.add(leaf);
      tg.position.set(OFF.x+side*(RIVER_W/2+5+Math.random()*15), 1+Math.random(), OFF.z-RIVER_L/2+Math.random()*RIVER_L);
      scene.add(tg);
    }
  }

  // River water
  const wGeo = new THREE.PlaneGeometry(RIVER_W, RIVER_L, 40, 80);
  wGeo.rotateX(-Math.PI/2);
  riverWaterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime; varying vec2 vUv; varying float vElev;
      void main(){ vUv=uv; vec3 p=position;
        p.y = sin(p.z*0.3+uTime*1.5)*0.12 + sin(p.z*0.8+p.x*0.5+uTime*1.0)*0.06;
        vElev=p.y;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying float vElev;
      void main(){
        vec3 c1 = vec3(0.1,0.42,0.54);
        vec3 c2 = vec3(0.18,0.62,0.71);
        float f = sin(vUv.y*20.0+uTime*1.2)*0.5+0.5;
        vec3 col = mix(c1,c2,f);
        col += vElev*0.3;
        float foam = smoothstep(0.85,1.0,abs(vUv.x-0.5)*2.0);
        col = mix(col, vec3(0.85,0.92,0.95), foam*0.4);
        gl_FragColor = vec4(col, 0.9);
      }`,
    transparent: true, side: THREE.DoubleSide
  });
  const water = new THREE.Mesh(wGeo, riverWaterMat);
  water.position.set(OFF.x, -0.3, OFF.z);
  scene.add(water);

  // River bed
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_W, RIVER_L), new THREE.MeshStandardMaterial({color:0x3d5c3a}));
  bed.rotation.x = -Math.PI/2;
  bed.position.set(OFF.x, -1.5, OFF.z);
  scene.add(bed);

  // Net barrier
  netGroup = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({color:0x8a8a8a, roughness:0.3, metalness:0.9});
  const barGeo = new THREE.CylinderGeometry(0.1,0.1,RIVER_W+2,8);
  barGeo.rotateZ(Math.PI/2);
  const topBar = new THREE.Mesh(barGeo, metalMat);
  topBar.position.y = 1.2;
  netGroup.add(topBar);
  const btmBar = new THREE.Mesh(barGeo.clone(), metalMat);
  btmBar.position.y = -0.5;
  netGroup.add(btmBar);

  // Posts
  for (let i = 0; i <= 8; i++) {
    const x = -RIVER_W/2 + (RIVER_W/8)*i;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,1.8,6), metalMat);
    post.position.set(x, 0.35, 0);
    netGroup.add(post);
  }

  // Buoys
  const buoyMat = new THREE.MeshStandardMaterial({color:0xff6f00, emissive:0xff6f00, emissiveIntensity:0.1});
  [-RIVER_W/2, -RIVER_W/4, 0, RIVER_W/4, RIVER_W/2].forEach(x => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.3,0.5,10), buoyMat);
    b.position.set(x, 1.3, 0);
    riverBuoys.push(b);
    netGroup.add(b);
  });

  netGroup.position.set(OFF.x, 0, OFF.z+25);
  scene.add(netGroup);

  // Spawn river plastics
  for (let i = 0; i < 20; i++) spawnRiverPlastic(OFF, RIVER_W, RIVER_L);
}

function spawnRiverPlastic(offset, w, l) {
  const colors = [0x4fc3f7, 0xce93d8, 0xffb74d, 0xf48fb1, 0xa5d6a7];
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 0.5, 6),
    new THREE.MeshStandardMaterial({color: colors[Math.floor(Math.random()*colors.length)], transparent:true, opacity:0.85})
  );
  mesh.position.set(
    offset.x + (Math.random()-0.5)*w*0.8,
    0.1,
    offset.z - l/2 + Math.random()*l*0.6
  );
  mesh.rotation.set(Math.random(), Math.random()*Math.PI, Math.random());
  scene.add(mesh);
  world.riverPlastics.push({
    mesh, offset, w, l,
    vel: new THREE.Vector3((Math.random()-0.5)*0.2, 0, 1.5+Math.random()*0.5),
    bobPhase: Math.random()*Math.PI*2,
    collected: false
  });
}

// ═══════════════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════════════
function createEnvironment() {
  // Clouds
  const cloudMat = new THREE.MeshStandardMaterial({color:0xffffff, transparent:true, opacity:0.5, roughness:1, emissive:0xffffff, emissiveIntensity:0.05});
  for (let i = 0; i < 15; i++) {
    const cg = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(8+Math.random()*12, 7, 5), cloudMat);
      p.position.set(Math.random()*25-12, Math.random()*4, Math.random()*15-7);
      p.scale.y = 0.35;
      cg.add(p);
    }
    cg.position.set(Math.random()*4000-2000, 180+Math.random()*150, Math.random()*4000-2000);
    scene.add(cg);
  }

  // Seabirds
  const birdMat = new THREE.MeshStandardMaterial({color:0x333333});
  for (let i = 0; i < 6; i++) {
    const bg = new THREE.Group();
    bg.add(new THREE.Mesh(new THREE.PlaneGeometry(2,0.4), birdMat));
    bg.add(new THREE.Mesh(new THREE.ConeGeometry(0.2,1.2,3), birdMat));
    bg.position.set(Math.random()*600-300, 60+Math.random()*40, Math.random()*600-300);
    bg.userData = { angle: Math.random()*Math.PI*2, radius: 50+Math.random()*80, speed: 0.2+Math.random()*0.3, baseY: bg.position.y };
    scene.add(bg);
  }

  // Sun sphere
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(20,16,16), new THREE.MeshBasicMaterial({color:0xfff8dd}));
  sunMesh.position.set(300, 250, -400);
  scene.add(sunMesh);
}

// ═══════════════════════════════════════════════════════
// ANIMATION
// ═══════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  world.time += dt;

  // Ocean
  if (oceanMat) oceanMat.uniforms.uTime.value = world.time;
  if (riverWaterMat) riverWaterMat.uniforms.uTime.value = world.time;

  // Ocean cleanup zone animations
  if (boomBoatL) {
    boomBoatL.position.y = 3 + Math.sin(world.time*0.6)*0.4;
    boomBoatL.rotation.z = Math.sin(world.time*0.5)*0.03;
  }
  if (boomBoatR) {
    boomBoatR.position.y = 3 + Math.sin(world.time*0.6+1.5)*0.4;
    boomBoatR.rotation.z = Math.sin(world.time*0.5+1.5)*0.03;
  }

  // Debris floating
  for (const d of world.debrisItems) {
    d.mesh.position.y = 2.5 + Math.sin(world.time*d.floatSpd+d.floatOff)*0.3;
    d.mesh.rotation.y += dt*0.3;
    // Drift toward boom center
    const center = new THREE.Vector3(d.offset.x, 0, d.offset.z-25);
    const toBoom = center.clone().sub(d.mesh.position).normalize();
    d.mesh.position.x += toBoom.x*0.02;
    d.mesh.position.z += toBoom.z*0.02;
    // Respawn if too close to center
    if (d.mesh.position.distanceTo(center) < 15) {
      const a = Math.random()*Math.PI*2, dist = 50+Math.random()*80;
      d.mesh.position.set(d.offset.x+Math.cos(a)*dist, 2.5, d.offset.z+Math.sin(a)*dist);
      world.plasticCollected++;
    }
  }

  // Drone patrol
  if (droneGroup) {
    const dOff = new THREE.Vector3(300, 0, 0);
    const patrolAngle = world.time * 0.15;
    const patrolR = 100;
    droneGroup.position.x = dOff.x + Math.cos(patrolAngle) * patrolR;
    droneGroup.position.z = dOff.z + Math.sin(patrolAngle) * patrolR;
    droneGroup.position.y = 90 + Math.sin(world.time*0.5)*5;
    droneGroup.rotation.y = -patrolAngle + Math.PI/2;
    droneGroup.rotation.x = Math.sin(world.time*2)*0.02;
    // Rotors spin
    droneRotors.forEach(r => r.rotation.y += 15*dt);
  }

  // River plastics
  for (let i = world.riverPlastics.length-1; i >= 0; i--) {
    const p = world.riverPlastics[i];
    if (p.collected) continue;
    p.mesh.position.z += p.vel.z * dt;
    p.mesh.position.x += p.vel.x * dt * 0.1;
    p.bobPhase += dt*2;
    p.mesh.position.y = Math.sin(p.bobPhase)*0.06+0.05;
    p.mesh.rotation.y += dt*0.5;

    // Collected by net
    if (p.mesh.position.z >= p.offset.z+24) {
      p.collected = true;
      p.mesh.position.z = p.offset.z + 22 + Math.random()*3;
      p.mesh.position.x = p.offset.x + (Math.random()-0.5)*8;
      p.vel.set(0,0,0);
      world.riverFill = Math.min(100, world.riverFill + 2);
    }

    // Past river - respawn
    if (p.mesh.position.z > p.offset.z + p.l/2 + 5) {
      p.mesh.position.z = p.offset.z - p.l/2;
      p.mesh.position.x = p.offset.x + (Math.random()-0.5)*p.w*0.8;
      p.collected = false;
      p.vel.z = 1.5+Math.random()*0.5;
    }
  }

  // Net buoys bob
  riverBuoys.forEach((b,i) => {
    b.position.y = 1.3 + Math.sin(world.time*2+i*1.2)*0.06;
  });

  // Buoy alert pulsing
  if (buoyAlert) {
    const pulse = Math.sin(world.time*2)*0.3+0.7;
    buoyAlert.material.emissiveIntensity = pulse*1.5;
  }

  // Update HUD
  updateHUD();

  // Camera smooth transition
  controls.update();
  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════
// HUD / UI
// ═══════════════════════════════════════════════════════
function updateHUD() {
  document.getElementById('ls-plastic').textContent = world.plasticCollected;
  document.getElementById('ls-drone').textContent = world.droneStatus;
  document.getElementById('ls-pollution').textContent = Math.round(world.pollutionLevel) + '%';
  document.getElementById('ls-river').textContent = Math.round(world.riverFill) + '%';
  document.getElementById('info-zone').textContent = world.currentZone;
  document.getElementById('info-wind').textContent = (10+Math.sin(world.time*0.1)*5).toFixed(1) + ' km/h';
  document.getElementById('info-waves').textContent = (1+Math.sin(world.time*0.2)*0.5).toFixed(1) + ' m';
  document.getElementById('info-objects').textContent = world.debrisItems.length + world.riverPlastics.length;
}

// ═══════════════════════════════════════════════════════
// ZONE NAVIGATION
// ═══════════════════════════════════════════════════════
function setupZoneNav() {
  document.querySelectorAll('.zone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const zone = btn.dataset.zone;
      world.currentZone = zone;

      document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const z = ZONES[zone];
      if (z) {
        animateCamera(z.pos, z.target);
      }

      document.getElementById('info-title').textContent =
        zone === 'overview' ? 'World Overview' :
        zone === 'ocean-cleanup' ? 'Ocean Cleanup Zone' :
        zone === 'drone-patrol' ? 'Drone Patrol Zone' :
        zone === 'pollution' ? 'Pollution Monitor' :
        'River Collection Zone';
    });
  });
}

function animateCamera(pos, target) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(...pos);
  const endTarget = new THREE.Vector3(...target);
  let t = 0;

  function lerp() {
    t += 0.02;
    if (t > 1) t = 1;
    const ease = t < 0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    camera.position.lerpVectors(startPos, endPos, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    if (t < 1) requestAnimationFrame(lerp);
  }
  lerp();
}

// ═══════════════════════════════════════════════════════
// SEND DATA TO BACKEND
// ═══════════════════════════════════════════════════════
setInterval(() => {
  try {
    // Send plastic data
    if (world.plasticCollected > 0) {
      fetch(`${API}/plastic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'ocean_cleanup', type: 'mixed', weight_kg: Math.random()*0.5, count: 1 })
      }).catch(() => {});
    }

    // Send river data
    fetch(`${API}/river`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plastic_type: 'mixed', weight_kg: Math.random()*0.3, fill_level: world.riverFill, flow_speed: 2.0 })
    }).catch(() => {});

  } catch (e) {}
}, 10000);

// ═══════════════════════════════════════════════════════
// WINDOW RESIZE
// ═══════════════════════════════════════════════════════
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// GO!
init();
