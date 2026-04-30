/* ============================================
   River Guardian — Main Entry Point
   ============================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// ============================================
// CONSTANTS
// ============================================

const NET_CAPACITY = 50; // max pieces the net can hold
const RIVER_LENGTH = 80;
const RIVER_WIDTH = 18;
const NET_Z_POSITION = 20; // position along river where the net sits

const PLASTIC_TYPES = [
  { name: 'Bottle', color: 0x4fc3f7, weight: 0.5 },
  { name: 'Bag', color: 0xce93d8, weight: 0.1 },
  { name: 'Container', color: 0xffb74d, weight: 0.8 },
  { name: 'Cup', color: 0xf48fb1, weight: 0.3 },
  { name: 'Straw', color: 0xa5d6a7, weight: 0.05 },
];

// ============================================
// STATE
// ============================================

const state = {
  paused: false,
  flowSpeed: 2.0,
  collected: 0,
  totalSpawned: 0,
  plastics: [],        // active plastic objects
  collectedPieces: [], // pieces at the net
  typeCount: { Bottle: 0, Bag: 0, Container: 0, Cup: 0, Straw: 0 },
  collectionHistory: [],
  fillHistory: [],
  startTime: Date.now(),
  lastChartUpdate: 0,
};

// ============================================
// SCENE SETUP
// ============================================

const canvas = document.getElementById('simulation-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();

// Sky color
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 25, -30);
camera.lookAt(0, 0, 10);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 10;
controls.maxDistance = 80;
controls.target.set(0, 0, 10);

// ============================================
// LIGHTING
// ============================================

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.8);
sunLight.position.set(30, 50, -20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 120;
sunLight.shadow.bias = -0.001;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x88ccff, 0.4);
fillLight.position.set(-20, 20, 30);
scene.add(fillLight);

// Sun sphere
const sunGeo = new THREE.SphereGeometry(3, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffde0 });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.set(30, 50, -20);
scene.add(sunMesh);

// ============================================
// TERRAIN — River Banks
// ============================================

function createTerrain() {
  // Left bank
  const leftBankGeo = new THREE.PlaneGeometry(30, RIVER_LENGTH, 30, 60);
  leftBankGeo.rotateX(-Math.PI / 2);
  const positions = leftBankGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Slope down toward river
    const distFromRiver = Math.max(0, (x + 15) / 30); // 0 at river edge, 1 at far
    let y = distFromRiver * 4 + Math.sin(z * 0.2) * 0.5 + Math.random() * 0.3;
    // River edge is near 0
    if (distFromRiver < 0.05) y = -0.2;
    positions.setY(i, y);
  }
  leftBankGeo.computeVertexNormals();

  const bankMat = new THREE.MeshStandardMaterial({
    color: 0x4a7c3f,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
  });
  
  const leftBank = new THREE.Mesh(leftBankGeo, bankMat);
  leftBank.position.set(-(RIVER_WIDTH / 2) - 15, 0, 0);
  leftBank.receiveShadow = true;
  scene.add(leftBank);

  // Right bank
  const rightBankGeo = new THREE.PlaneGeometry(30, RIVER_LENGTH, 30, 60);
  rightBankGeo.rotateX(-Math.PI / 2);
  const rPositions = rightBankGeo.attributes.position;
  for (let i = 0; i < rPositions.count; i++) {
    const x = rPositions.getX(i);
    const z = rPositions.getZ(i);
    const distFromRiver = Math.max(0, (-x + 15) / 30);
    let y = distFromRiver * 4 + Math.cos(z * 0.15) * 0.5 + Math.random() * 0.3;
    if (distFromRiver < 0.05) y = -0.2;
    rPositions.setY(i, y);
  }
  rightBankGeo.computeVertexNormals();

  const rightBank = new THREE.Mesh(rightBankGeo, bankMat.clone());
  rightBank.position.set((RIVER_WIDTH / 2) + 15, 0, 0);
  rightBank.receiveShadow = true;
  scene.add(rightBank);

  // Add some trees
  addTrees(leftBank, -1);
  addTrees(rightBank, 1);

  // River bed
  const bedGeo = new THREE.PlaneGeometry(RIVER_WIDTH, RIVER_LENGTH);
  bedGeo.rotateX(-Math.PI / 2);
  const bedMat = new THREE.MeshStandardMaterial({
    color: 0x3d5c3a,
    roughness: 1,
    metalness: 0,
  });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.position.set(0, -1.5, 0);
  bed.receiveShadow = true;
  scene.add(bed);
}

function addTrees(bank, side) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8, flatShading: true });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.8, flatShading: true });

  for (let i = 0; i < 25; i++) {
    const treeGroup = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2 + Math.random() * 2, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const height = trunk.geometry.parameters.height;
    const leafGeo = new THREE.ConeGeometry(1 + Math.random() * 0.8, 2.5 + Math.random() * 1.5, 7);
    const leaf = new THREE.Mesh(leafGeo, Math.random() > 0.5 ? leafMat : leafMat2);
    leaf.position.y = height / 2 + 1;
    leaf.castShadow = true;
    treeGroup.add(leaf);

    // Second layer of leaves
    const leafGeo2 = new THREE.ConeGeometry(0.7 + Math.random() * 0.5, 2 + Math.random(), 6);
    const leaf2 = new THREE.Mesh(leafGeo2, leafMat2);
    leaf2.position.y = height / 2 + 2.5;
    leaf2.castShadow = true;
    treeGroup.add(leaf2);

    const xRange = 5 + Math.random() * 20;
    treeGroup.position.set(
      bank.position.x + (side * (3 + Math.random() * xRange)),
      1 + Math.random() * 2,
      -RIVER_LENGTH / 2 + Math.random() * RIVER_LENGTH
    );
    treeGroup.rotation.y = Math.random() * Math.PI * 2;
    scene.add(treeGroup);
  }
}

// ============================================
// WATER — Animated River
// ============================================

let waterMesh;
let waterUniforms;

function createWater() {
  const waterGeo = new THREE.PlaneGeometry(RIVER_WIDTH, RIVER_LENGTH, 80, 160);
  waterGeo.rotateX(-Math.PI / 2);

  waterUniforms = {
    uTime: { value: 0 },
    uFlowSpeed: { value: state.flowSpeed },
    uColor1: { value: new THREE.Color(0x1a6b8a) },
    uColor2: { value: new THREE.Color(0x2d9fb5) },
    uColor3: { value: new THREE.Color(0x5ec4d4) },
  };

  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uFlowSpeed;
      varying vec2 vUv;
      varying float vElevation;
      varying vec3 vWorldPos;
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        
        // Main river waves flowing downstream
        float wave1 = sin(pos.z * 0.3 + uTime * uFlowSpeed * 0.5) * 0.15;
        float wave2 = sin(pos.z * 0.8 + pos.x * 0.5 + uTime * uFlowSpeed * 0.3) * 0.08;
        float wave3 = sin(pos.x * 1.2 + uTime * 0.8) * 0.05;
        
        // Ripples near edges
        float edgeDist = abs(pos.x) / ${(RIVER_WIDTH / 2).toFixed(1)};
        float edgeRipple = sin(pos.z * 2.0 + uTime * 2.0) * 0.03 * edgeDist;
        
        pos.y += wave1 + wave2 + wave3 + edgeRipple;
        vElevation = pos.y;
        
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlowSpeed;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      varying vec2 vUv;
      varying float vElevation;
      varying vec3 vWorldPos;
      
      void main() {
        // Flow pattern
        float flow = sin(vUv.y * 20.0 + uTime * uFlowSpeed * 0.4) * 0.5 + 0.5;
        float sheen = sin(vUv.y * 40.0 + vUv.x * 10.0 + uTime * 1.5) * 0.5 + 0.5;
        
        // Mix colors based on flow
        vec3 color = mix(uColor1, uColor2, flow);
        color = mix(color, uColor3, sheen * 0.3);
        
        // Specular highlights
        float spec = pow(max(0.0, sin(vUv.y * 60.0 + uTime * 2.0) * sin(vUv.x * 20.0 + uTime * 0.8)), 8.0);
        color += vec3(spec * 0.15);
        
        // Elevation brightness
        color += vElevation * 0.4;
        
        // Edge foam
        float edgeDist = abs(vWorldPos.x) / ${(RIVER_WIDTH / 2).toFixed(1)};
        float foam = smoothstep(0.85, 1.0, edgeDist);
        color = mix(color, vec3(0.85, 0.92, 0.95), foam * 0.6);
        
        gl_FragColor = vec4(color, 0.92);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });

  waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = -0.3;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);
}

// ============================================
// NET BARRIER — Metal Structure with Buoyancy
// ============================================

let netGroup;
let buoys = [];
let netMeshForCollection; // invisible plane for collision detection

function createNetBarrier() {
  netGroup = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 0.3,
    metalness: 0.9,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.4,
    metalness: 0.85,
  });

  // Main horizontal bars (top and bottom frames)
  const barGeo = new THREE.CylinderGeometry(0.12, 0.12, RIVER_WIDTH + 2, 8);
  barGeo.rotateZ(Math.PI / 2);

  const topBar = new THREE.Mesh(barGeo, metalMat);
  topBar.position.set(0, 1.2, 0);
  topBar.castShadow = true;
  netGroup.add(topBar);

  const bottomBar = new THREE.Mesh(barGeo, metalMat);
  bottomBar.position.set(0, -0.5, 0);
  bottomBar.castShadow = true;
  netGroup.add(bottomBar);

  // Vertical support posts
  const postCount = 8;
  for (let i = 0; i <= postCount; i++) {
    const x = -RIVER_WIDTH / 2 + (RIVER_WIDTH / postCount) * i;
    const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.0, 6);
    const post = new THREE.Mesh(postGeo, darkMetalMat);
    post.position.set(x, 0.35, 0);
    post.castShadow = true;
    netGroup.add(post);
  }

  // Net mesh (wire grid)
  const netWireMat = new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: 0.5,
    metalness: 0.7,
    wireframe: false,
    transparent: true,
    opacity: 0.6,
  });

  // Create net as a grid of thin cylinders
  const gridSpacing = 0.5;
  const numHorizontal = Math.floor(1.5 / gridSpacing);
  const numVertical = Math.floor(RIVER_WIDTH / gridSpacing);

  // Horizontal wires
  for (let i = 0; i <= numHorizontal; i++) {
    const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, RIVER_WIDTH, 4);
    wireGeo.rotateZ(Math.PI / 2);
    const wire = new THREE.Mesh(wireGeo, netWireMat);
    wire.position.set(0, -0.4 + i * gridSpacing, 0);
    netGroup.add(wire);
  }

  // Vertical wires
  for (let i = 0; i <= numVertical; i++) {
    const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.7, 4);
    const wire = new THREE.Mesh(wireGeo, netWireMat);
    wire.position.set(-RIVER_WIDTH / 2 + i * gridSpacing, 0.35, 0);
    netGroup.add(wire);
  }

  // Cross-brace supports
  for (let side = -1; side <= 1; side += 2) {
    const braceGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
    const brace = new THREE.Mesh(braceGeo, metalMat);
    brace.position.set(side * (RIVER_WIDTH / 2 + 0.5), 0.5, 0);
    brace.rotation.z = side * 0.3;
    brace.castShadow = true;
    netGroup.add(brace);
  }

  // Buoys (floating orange cylinders along the top bar)
  const buoyMat = new THREE.MeshStandardMaterial({
    color: 0xff6f00,
    roughness: 0.5,
    metalness: 0.2,
    emissive: 0xff6f00,
    emissiveIntensity: 0.1,
  });

  const buoyPositions = [-RIVER_WIDTH / 2, -RIVER_WIDTH / 4, 0, RIVER_WIDTH / 4, RIVER_WIDTH / 2];
  buoyPositions.forEach(x => {
    const buoyGeo = new THREE.CylinderGeometry(0.4, 0.35, 0.6, 12);
    const buoy = new THREE.Mesh(buoyGeo, buoyMat);
    buoy.position.set(x, 1.3, 0);
    buoy.castShadow = true;
    buoys.push(buoy);
    netGroup.add(buoy);
  });

  // Warning signs on the posts at the edges
  for (let side = -1; side <= 1; side += 2) {
    const signGeo = new THREE.BoxGeometry(0.8, 0.5, 0.05);
    const signMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, roughness: 0.5 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(side * (RIVER_WIDTH / 2), 1.8, 0);
    sign.castShadow = true;
    netGroup.add(sign);
  }

  netGroup.position.set(0, 0, NET_Z_POSITION);
  scene.add(netGroup);

  // Invisible collision plane
  const collisionGeo = new THREE.PlaneGeometry(RIVER_WIDTH + 2, 3);
  collisionGeo.rotateX(0); // face toward negative Z (upstream)
  const collisionMat = new THREE.MeshBasicMaterial({ visible: false });
  netMeshForCollection = new THREE.Mesh(collisionGeo, collisionMat);
  netMeshForCollection.position.set(0, 0, NET_Z_POSITION);
  scene.add(netMeshForCollection);
}

// ============================================
// PLASTIC SPAWNING
// ============================================

function createPlasticMesh(type) {
  const group = new THREE.Group();
  let mainMesh;

  const mat = new THREE.MeshStandardMaterial({
    color: type.color,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  switch (type.name) {
    case 'Bottle': {
      const bodyGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.7, 8);
      mainMesh = new THREE.Mesh(bodyGeo, mat);
      const capGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.4;
      group.add(cap);
      mainMesh.rotation.x = Math.PI / 2;
      break;
    }
    case 'Bag': {
      const bagGeo = new THREE.SphereGeometry(0.3, 6, 6);
      bagGeo.scale(1, 0.3, 1.2);
      mainMesh = new THREE.Mesh(bagGeo, mat);
      mat.opacity = 0.5;
      mat.side = THREE.DoubleSide;
      break;
    }
    case 'Container': {
      const boxGeo = new THREE.BoxGeometry(0.4, 0.2, 0.3);
      mainMesh = new THREE.Mesh(boxGeo, mat);
      break;
    }
    case 'Cup': {
      const cupGeo = new THREE.CylinderGeometry(0.15, 0.1, 0.3, 8, 1, true);
      mainMesh = new THREE.Mesh(cupGeo, mat);
      mat.side = THREE.DoubleSide;
      mainMesh.rotation.x = Math.PI / 6;
      break;
    }
    case 'Straw': {
      const strawGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
      mainMesh = new THREE.Mesh(strawGeo, mat);
      mainMesh.rotation.z = Math.PI / 2;
      break;
    }
  }

  mainMesh.castShadow = true;
  group.add(mainMesh);
  return group;
}

function spawnPlastic(x, z) {
  const typeIndex = Math.floor(Math.random() * PLASTIC_TYPES.length);
  const type = PLASTIC_TYPES[typeIndex];
  const mesh = createPlasticMesh(type);

  // Clamp x to within river
  x = Math.max(-RIVER_WIDTH / 2 + 1, Math.min(RIVER_WIDTH / 2 - 1, x));
  // Start upstream
  z = Math.min(z, NET_Z_POSITION - 5);

  mesh.position.set(x, 0.1, z);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  scene.add(mesh);

  const plastic = {
    mesh,
    type,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      0,
      state.flowSpeed * (0.7 + Math.random() * 0.3)
    ),
    bobPhase: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 2,
    collected: false,
  };

  state.plastics.push(plastic);
  state.totalSpawned++;
}

// ============================================
// RAYCASTING — Click to Spawn
// ============================================

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (e) => {
  if (state.paused) return;

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Intersect with a horizontal plane at y=0 (water surface)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersectPoint);

  if (intersectPoint) {
    // Check if click is within river bounds
    if (
      Math.abs(intersectPoint.x) < RIVER_WIDTH / 2 &&
      intersectPoint.z > -RIVER_LENGTH / 2 &&
      intersectPoint.z < RIVER_LENGTH / 2
    ) {
      // Spawn 1-3 pieces
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        spawnPlastic(
          intersectPoint.x + (Math.random() - 0.5) * 2,
          intersectPoint.z + (Math.random() - 0.5) * 2
        );
      }

      // Spawn splash effect
      createSplash(intersectPoint.x, intersectPoint.z);
    }
  }
});

// ============================================
// SPLASH EFFECT
// ============================================

const splashParticles = [];

function createSplash(x, z) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88d8f8,
      transparent: true,
      opacity: 0.8,
    });
    const particle = new THREE.Mesh(geo, mat);
    particle.position.set(x, 0.2, z);

    const angle = (i / count) * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    particle.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      2 + Math.random() * 3,
      Math.sin(angle) * speed
    );
    particle.userData.life = 1.0;

    scene.add(particle);
    splashParticles.push(particle);
  }
}

function updateSplash(dt) {
  for (let i = splashParticles.length - 1; i >= 0; i--) {
    const p = splashParticles[i];
    p.userData.velocity.y -= 9.8 * dt;
    p.position.add(p.userData.velocity.clone().multiplyScalar(dt));
    p.userData.life -= dt * 2;
    p.material.opacity = Math.max(0, p.userData.life);

    if (p.userData.life <= 0 || p.position.y < -1) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      splashParticles.splice(i, 1);
    }
  }
}

// ============================================
// PHYSICS UPDATE
// ============================================

function updatePlastics(dt) {
  const fillLevel = state.collectedPieces.length / NET_CAPACITY;

  for (let i = state.plastics.length - 1; i >= 0; i--) {
    const p = state.plastics[i];
    if (p.collected) continue;

    // River flow pushes plastic downstream (positive Z)
    p.velocity.z = state.flowSpeed * (0.6 + Math.random() * 0.01);
    // Slight random lateral drift
    p.velocity.x += (Math.random() - 0.5) * 0.05;
    p.velocity.x *= 0.98; // damping

    // Keep within river
    if (Math.abs(p.mesh.position.x) > RIVER_WIDTH / 2 - 0.5) {
      p.velocity.x *= -0.5;
      p.mesh.position.x = Math.sign(p.mesh.position.x) * (RIVER_WIDTH / 2 - 0.5);
    }

    // Move
    p.mesh.position.x += p.velocity.x * dt;
    p.mesh.position.z += p.velocity.z * dt;

    // Bob on water
    p.bobPhase += dt * 2;
    p.mesh.position.y = Math.sin(p.bobPhase) * 0.08 + 0.05;

    // Rotate
    p.mesh.rotation.y += p.rotSpeed * dt;
    p.mesh.rotation.z = Math.sin(p.bobPhase * 0.7) * 0.1;

    // Check collision with net
    if (p.mesh.position.z >= NET_Z_POSITION - 0.5) {
      if (fillLevel < 1.0) {
        // Collected by net
        p.collected = true;
        p.velocity.set(0, 0, 0);

        // Position it near the net (accumulated)
        const slot = state.collectedPieces.length;
        const row = Math.floor(slot / 10);
        const col = slot % 10;
        p.mesh.position.z = NET_Z_POSITION - 1.5 - row * 0.5;
        p.mesh.position.x = -4 + col * 0.8 + Math.random() * 0.3;
        p.mesh.position.y = 0.05 + Math.random() * 0.1;

        state.collected++;
        state.collectedPieces.push(p);
        state.typeCount[p.type.name]++;
        state.plastics.splice(i, 1);
      } else {
        // Net is full, plastic passes through (leaks to ocean)
        // Keep flowing
      }
    }

    // Remove if too far downstream past the net
    if (p.mesh.position.z > RIVER_LENGTH / 2 + 5) {
      scene.remove(p.mesh);
      state.plastics.splice(i, 1);
    }

    // Remove if too far upstream (shouldn't happen but safety)
    if (p.mesh.position.z < -RIVER_LENGTH / 2 - 5) {
      scene.remove(p.mesh);
      state.plastics.splice(i, 1);
    }
  }
}

// ============================================
// NET BUOYANCY ANIMATION
// ============================================

function updateNetBuoyancy(time) {
  if (!netGroup) return;

  // Entire net group bobs
  netGroup.position.y = Math.sin(time * 1.5) * 0.06;

  // Individual buoys bob independently
  buoys.forEach((buoy, i) => {
    buoy.position.y = 1.3 + Math.sin(time * 2 + i * 1.2) * 0.08;
    buoy.rotation.z = Math.sin(time * 1.3 + i) * 0.05;
  });
}

// ============================================
// UI UPDATES
// ============================================

const elCollected = document.getElementById('stat-collected');
const elFlow = document.getElementById('stat-flow');
const elFill = document.getElementById('stat-fill');
const elFillBar = document.getElementById('fill-bar');
const elActive = document.getElementById('stat-active');
const elEfficiency = document.getElementById('stat-efficiency');
const elTime = document.getElementById('sim-time');
const elNetAlert = document.getElementById('net-alert');
const elAlertMsg = document.getElementById('alert-message');

function updateUI() {
  const fillPercent = Math.min(100, Math.round((state.collectedPieces.length / NET_CAPACITY) * 100));
  const efficiency = state.totalSpawned > 0 
    ? Math.round((state.collected / state.totalSpawned) * 100)
    : 100;

  elCollected.textContent = state.collected;
  elFlow.textContent = state.flowSpeed.toFixed(1);
  elFill.textContent = fillPercent;
  elFillBar.style.width = fillPercent + '%';
  elActive.textContent = state.plastics.length;
  elEfficiency.textContent = efficiency;

  // Fill bar color
  elFillBar.className = 'fill-bar';
  if (fillPercent >= 90) elFillBar.classList.add('critical');
  else if (fillPercent >= 70) elFillBar.classList.add('warning');

  // Alert
  if (fillPercent >= 90) {
    elNetAlert.className = 'critical';
    elAlertMsg.textContent = 'CRITICAL: Net at ' + fillPercent + '% capacity! Plastic will leak to ocean!';
  } else if (fillPercent >= 70) {
    elNetAlert.className = '';
    elAlertMsg.textContent = 'Warning: Net capacity at ' + fillPercent + '%. Schedule maintenance.';
  } else {
    elNetAlert.className = 'hidden';
  }

  // Timer
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  elTime.textContent = `${hrs}:${mins}:${secs}`;
}

// ============================================
// CHARTS
// ============================================

let chartCollection, chartFill, chartTypes;

function initCharts() {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: 'rgba(148,163,184,0.08)' },
        ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } },
      },
      y: {
        grid: { color: 'rgba(148,163,184,0.08)' },
        ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } },
        beginAtZero: true,
      },
    },
    animation: { duration: 300 },
  };

  // Collection Rate Chart (Line)
  chartCollection = new Chart(document.getElementById('chart-collection'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Collected',
        data: [],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6,182,212,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointBackgroundColor: '#06b6d4',
        borderWidth: 2,
      }],
    },
    options: chartOptions,
  });

  // Fill Level Chart (Line)
  chartFill = new Chart(document.getElementById('chart-fill'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Fill %',
        data: [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointBackgroundColor: '#f59e0b',
        borderWidth: 2,
      }],
    },
    options: chartOptions,
  });

  // Waste Breakdown (Doughnut)
  chartTypes = new Chart(document.getElementById('chart-types'), {
    type: 'doughnut',
    data: {
      labels: PLASTIC_TYPES.map(t => t.name),
      datasets: [{
        data: PLASTIC_TYPES.map(() => 0),
        backgroundColor: [
          'rgba(79,195,247,0.8)',
          'rgba(206,147,216,0.8)',
          'rgba(255,183,77,0.8)',
          'rgba(244,143,177,0.8)',
          'rgba(165,214,167,0.8)',
        ],
        borderColor: 'rgba(10,14,23,0.8)',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.5,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { size: 10, family: 'Inter' },
            padding: 8,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
      },
      animation: { duration: 300 },
    },
  });
}

function updateCharts() {
  const now = Date.now();
  if (now - state.lastChartUpdate < 2000) return;
  state.lastChartUpdate = now;

  const elapsed = Math.floor((now - state.startTime) / 1000);
  const label = elapsed + 's';

  // Collection rate
  state.collectionHistory.push(state.collected);
  chartCollection.data.labels.push(label);
  chartCollection.data.datasets[0].data.push(state.collected);
  if (chartCollection.data.labels.length > 30) {
    chartCollection.data.labels.shift();
    chartCollection.data.datasets[0].data.shift();
  }
  chartCollection.update('none');

  // Fill level
  const fillPct = Math.round((state.collectedPieces.length / NET_CAPACITY) * 100);
  state.fillHistory.push(fillPct);
  chartFill.data.labels.push(label);
  chartFill.data.datasets[0].data.push(fillPct);
  if (chartFill.data.labels.length > 30) {
    chartFill.data.labels.shift();
    chartFill.data.datasets[0].data.shift();
  }
  chartFill.update('none');

  // Types
  chartTypes.data.datasets[0].data = PLASTIC_TYPES.map(t => state.typeCount[t.name]);
  chartTypes.update('none');
}

// ============================================
// CONTROLS
// ============================================

document.getElementById('btn-pause').addEventListener('click', () => {
  state.paused = !state.paused;
  const btn = document.getElementById('btn-pause');
  btn.classList.toggle('active', state.paused);
  const statusEl = document.getElementById('sim-status');
  if (state.paused) {
    statusEl.innerHTML = '<span class="status-dot" style="background:#f59e0b;animation:none"></span>PAUSED';
    statusEl.style.color = '#f59e0b';
  } else {
    statusEl.innerHTML = '<span class="status-dot"></span>LIVE SIMULATION';
    statusEl.style.color = '';
  }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  // Remove all plastics
  state.plastics.forEach(p => scene.remove(p.mesh));
  state.collectedPieces.forEach(p => scene.remove(p.mesh));
  state.plastics = [];
  state.collectedPieces = [];
  state.collected = 0;
  state.totalSpawned = 0;
  state.typeCount = { Bottle: 0, Bag: 0, Container: 0, Cup: 0, Straw: 0 };
  state.collectionHistory = [];
  state.fillHistory = [];
  state.startTime = Date.now();

  // Reset charts
  chartCollection.data.labels = [];
  chartCollection.data.datasets[0].data = [];
  chartCollection.update();
  chartFill.data.labels = [];
  chartFill.data.datasets[0].data = [];
  chartFill.update();
  chartTypes.data.datasets[0].data = PLASTIC_TYPES.map(() => 0);
  chartTypes.update();
});

document.getElementById('flow-speed').addEventListener('input', (e) => {
  state.flowSpeed = parseFloat(e.target.value);
  if (waterUniforms) waterUniforms.uFlowSpeed.value = state.flowSpeed;
});

document.getElementById('btn-camera').addEventListener('click', () => {
  camera.position.set(0, 25, -30);
  controls.target.set(0, 0, 10);
  controls.update();
});

document.getElementById('toggle-panel').addEventListener('click', () => {
  document.getElementById('stats-panel').classList.toggle('collapsed');
});

document.getElementById('toggle-charts').addEventListener('click', () => {
  document.getElementById('charts-panel').classList.toggle('collapsed');
});

// ============================================
// WINDOW RESIZE
// ============================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================
// CLOUDS
// ============================================

function createClouds() {
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    flatShading: true,
  });

  for (let i = 0; i < 10; i++) {
    const cloudGroup = new THREE.Group();
    const numPuffs = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < numPuffs; j++) {
      const size = 1.5 + Math.random() * 3;
      const puffGeo = new THREE.SphereGeometry(size, 7, 5);
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set(j * 2 - numPuffs, Math.random() * 0.5, Math.random() * 1);
      puff.scale.y = 0.4 + Math.random() * 0.3;
      cloudGroup.add(puff);
    }
    cloudGroup.position.set(
      -60 + Math.random() * 120,
      25 + Math.random() * 15,
      -30 + Math.random() * 80
    );
    cloudGroup.userData.speed = 0.3 + Math.random() * 0.5;
    scene.add(cloudGroup);
    clouds.push(cloudGroup);
  }
}

const clouds = [];

function updateClouds(dt) {
  clouds.forEach(cloud => {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 80) cloud.position.x = -80;
  });
}

// ============================================
// ROCKS & DETAILS
// ============================================

function createRiverDetails() {
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x6b6b6b,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });

  // Rocks along banks
  for (let i = 0; i < 30; i++) {
    const size = 0.2 + Math.random() * 0.6;
    const rockGeo = new THREE.DodecahedronGeometry(size, 0);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const side = Math.random() > 0.5 ? 1 : -1;
    rock.position.set(
      side * (RIVER_WIDTH / 2 + Math.random() * 1.5 - 0.5),
      -0.3 + Math.random() * 0.3,
      -RIVER_LENGTH / 2 + Math.random() * RIVER_LENGTH
    );
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Some rocks in the river
  for (let i = 0; i < 8; i++) {
    const size = 0.3 + Math.random() * 0.4;
    const rockGeo = new THREE.DodecahedronGeometry(size, 1);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(
      (Math.random() - 0.5) * (RIVER_WIDTH - 4),
      -0.4 + Math.random() * 0.2,
      -RIVER_LENGTH / 2 + Math.random() * (NET_Z_POSITION + RIVER_LENGTH / 2 - 5)
    );
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
}

// ============================================
// INIT & ANIMATION LOOP
// ============================================

let clock;

function init() {
  createTerrain();
  createWater();
  createNetBarrier();
  createClouds();
  createRiverDetails();
  initCharts();

  clock = new THREE.Clock();

  // Hide loading screen
  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('hidden');
  }, 1200);

  animate();
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  if (!state.paused) {
    // Update water shader
    if (waterUniforms) {
      waterUniforms.uTime.value = time;
    }

    // Update plastics
    updatePlastics(dt);

    // Net buoyancy
    updateNetBuoyancy(time);

    // Splash particles
    updateSplash(dt);

    // Clouds
    updateClouds(dt);
  }

  // UI
  updateUI();
  updateCharts();

  // Controls
  controls.update();

  // Render
  renderer.render(scene, camera);
}

init();
