// ═══════════════════════════════════════════
//  OCEAN POLLUTION DETECTION 3D SIMULATOR
//  Clean rebuild — Three.js
// ═══════════════════════════════════════════
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ─── state ─── */
const state = { spillActive: false, spillProgress: 0, pollutionLevel: 0, oilParticles: [], smokeParticles: [], time: 0 };

/* ─── renderer ─── */
const canvas = document.getElementById('simulation-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec8e3);
scene.fog = new THREE.FogExp2(0x9ad5ea, 0.0035);

/* ─── helper: glow texture (used by sun + buoy) ─── */
function createGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.3,'rgba(255,255,255,0.5)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}

/* ─── camera ─── */
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 500);
camera.position.set(35, 25, 40);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI/2.1; controls.minDistance = 15; controls.maxDistance = 100;
controls.target.set(5, 2, 5);

/* ═══════════ SKY DOME ═══════════ */
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uTime: {value:0} },
  vertexShader: `varying vec3 vPos; void main(){ vPos = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vPos,1.0); }`,
  fragmentShader: `
    uniform float uTime; varying vec3 vPos;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
    void main(){
      vec3 d=normalize(vPos); float el=d.y;
      vec3 sky=mix(vec3(0.72,0.88,1.0), vec3(0.18,0.50,0.95), pow(max(el,0.0),0.5));
      if(el>0.01){vec2 uv=d.xz/(d.y+0.1)*3.0+uTime*0.015; float c=smoothstep(0.38,0.72,fbm(uv));
        sky=mix(sky,vec3(1.0),c*0.85);}
      gl_FragColor=vec4(sky,1.0);
    }`,
  side: THREE.BackSide
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(200,64,32), skyMat));

// sun
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4,32,32), new THREE.MeshBasicMaterial({color:0xfff8dd}));
sunMesh.position.set(-60,55,-40); scene.add(sunMesh);
const sg = new THREE.Sprite(new THREE.SpriteMaterial({map:createGlowTexture(),color:0xffee88,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending}));
sg.position.copy(sunMesh.position); sg.scale.set(30,30,1); scene.add(sg);

/* ─── lights ─── */
scene.add(new THREE.AmbientLight(0x88bbff, 0.9));
const sun = new THREE.DirectionalLight(0xfff8ee, 2.2);
sun.position.set(-60,55,-40); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-60; sun.shadow.camera.right=60;
sun.shadow.camera.top=60; sun.shadow.camera.bottom=-60;
sun.shadow.camera.near=0.5; sun.shadow.camera.far=200;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x88ccff, 0x446622, 0.6));
const fill = new THREE.PointLight(0xffeedd, 0.5, 120); fill.position.set(-30, 15, 10); scene.add(fill);

/* ═══════════ OCEAN ═══════════ */
const oceanGeo = new THREE.PlaneGeometry(300, 300, 128, 128);
const oceanMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime:{value:0}, uPollution:{value:0},
    uDeep:{value:new THREE.Color(0x0055aa)},
    uShallow:{value:new THREE.Color(0x33bbff)},
    uOil:{value:new THREE.Color(0x1a0f05)},
  },
  vertexShader:`
    uniform float uTime; varying vec2 vUv; varying float vElev; varying vec3 vWP;
    void main(){
      vUv=uv; vec3 p=position;
      float shoreDampening = smoothstep(50.0, 20.0, p.x);
      p.z = (sin(p.x*0.12+uTime*0.7)*cos(p.y*0.08+uTime*0.4)*1.0
           + sin(p.x*0.25+uTime*1.1)*sin(p.y*0.2+uTime*0.6)*0.5
           + sin(p.x*0.5+p.y*0.35+uTime*1.4)*0.25) * shoreDampening;
      vElev=p.z; vWP=(modelMatrix*vec4(p,1.0)).xyz;
      gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(p,1.0);
    }`,
  fragmentShader:`
    uniform vec3 uDeep,uShallow,uOil; uniform float uPollution,uTime;
    varying vec2 vUv; varying float vElev; varying vec3 vWP;
    void main(){
      float d=smoothstep(-1.0,1.5,vElev);
      vec3 col=mix(uDeep,uShallow,d);
      col+=vec3(0.6,0.85,1.0)*pow(max(vElev,0.0),2.0)*0.5;
      col+=vec3(0.85,0.92,1.0)*smoothstep(0.4,0.9,vElev)*0.35;
      col+=vec3(0.3,0.55,0.85)*pow(1.0-abs(vElev*0.4),3.0)*0.12;
      float dist=length(vWP.xz-vec2(-8.0,3.0));
      float mask=smoothstep(uPollution*50.0,0.0,dist)*uPollution;
      vec3 fin=mix(col,uOil,mask*0.85);
      if(mask>0.1){float sh=sin(vWP.x*2.0+vWP.y*3.0+uTime*0.5)*0.5+0.5;
        fin=mix(fin,mix(vec3(0.2,0.1,0.3),vec3(0.3,0.2,0.05),sh),mask*0.3);}
      gl_FragColor=vec4(fin,0.93);
    }`,
  transparent:true, side:THREE.DoubleSide
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x=-Math.PI/2;
ocean.position.x=-50; // keep water away from factory side
ocean.receiveShadow=true; scene.add(ocean);

/* ═══════════ GROUND / SHORE ═══════════ */
const shore = new THREE.Mesh(new THREE.PlaneGeometry(90,300),
  new THREE.MeshStandardMaterial({color:0x8B7355, roughness:0.9}));
shore.rotation.x=-Math.PI/2; 
shore.position.set(50, 2.0, 0); // Elevated landmass
shore.receiveShadow=true; scene.add(shore);

const beach = new THREE.Mesh(new THREE.PlaneGeometry(16,300),
  new THREE.MeshStandardMaterial({color:0xc2b280, roughness:0.95}));
beach.rotation.x = -Math.PI/2 - 0.1; // Slight slope into water
beach.position.set(12, 0.8, 0); // Elevated beach edge
beach.receiveShadow=true; scene.add(beach);

/* ═══════════ FACTORY ═══════════ */
const F = new THREE.Group();

// concrete foundation
const foundation = new THREE.Mesh(
  new THREE.BoxGeometry(22, 4, 30), // Taller foundation
  new THREE.MeshStandardMaterial({color:0x555555, roughness:0.9})
);
foundation.position.y = -1; // Center of foundation below factory floor
foundation.receiveShadow = true;
F.add(foundation);

// main building
const bldg = new THREE.Mesh(new THREE.BoxGeometry(14,10,18),
  new THREE.MeshStandardMaterial({color:0x8899aa, roughness:0.8, metalness:0.2}));
bldg.position.y=6; bldg.castShadow=true; bldg.receiveShadow=true; F.add(bldg);

// blue accent band
const accent = new THREE.Mesh(new THREE.BoxGeometry(14.1,2,18.1),
  new THREE.MeshStandardMaterial({color:0x2266aa, roughness:0.5, metalness:0.3}));
accent.position.y=2; F.add(accent);

// sawtooth roof
const roofMat = new THREE.MeshStandardMaterial({color:0x556677, roughness:0.5, metalness:0.5});
for(let i=0;i<3;i++){
  const s = new THREE.Shape();
  s.moveTo(0,0); s.lineTo(6,0); s.lineTo(6,3); s.lineTo(0,0);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:14,bevelEnabled:false}), roofMat);
  m.position.set(-7,11,-7+i*6.5); m.castShadow=true; F.add(m);
}

// chimneys with stripes
function mkChimney(x,z,h){
  const g=new THREE.Group();
  const c=new THREE.Mesh(new THREE.CylinderGeometry(1,1.3,h,16),
    new THREE.MeshStandardMaterial({color:0xcc5533,roughness:0.85}));
  c.position.y=h/2; c.castShadow=true; g.add(c);
  for(let s=0;s<3;s++){
    const b=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.1,0.6,16),
      new THREE.MeshStandardMaterial({color:s%2===0?0xeeeeee:0xcc2200}));
    b.position.y=h-1-s*0.8; g.add(b);
  }
  const r=new THREE.Mesh(new THREE.TorusGeometry(1.15,0.2,8,20),
    new THREE.MeshStandardMaterial({color:0x444444,metalness:0.7}));
  r.position.y=h; r.rotation.x=Math.PI/2; g.add(r);
  g.position.set(x,11.5,z); return g;
}
F.add(mkChimney(-3,-4,8)); F.add(mkChimney(3,-4,10)); F.add(mkChimney(-3,5,7));

// windows with frames
function mkWin(x,y,z,ry){
  const g=new THREE.Group();
  const frameMat=new THREE.MeshStandardMaterial({color:0x334455,metalness:0.6});
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2,2.6,0.15), frameMat));
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(1.8,2.2),
    new THREE.MeshStandardMaterial({color:0xffeebb,emissive:0xffcc44,emissiveIntensity:0.8,transparent:true,opacity:0.9,side:THREE.DoubleSide}));
  glass.position.z=0.08; g.add(glass);
  g.position.set(x,y,z); g.rotation.y=ry; return g;
}
F.add(mkWin(-7.05,6,3,-Math.PI/2)); F.add(mkWin(-7.05,6,-3,-Math.PI/2));
F.add(mkWin(7.05,6,3,Math.PI/2)); F.add(mkWin(7.05,6,-3,Math.PI/2));
for(let i=0;i<3;i++) F.add(mkWin(-3.5+i*3.5,6,9,0));

// front dock & pipes
const dockMat=new THREE.MeshStandardMaterial({color:0x667788,metalness:0.4});
const dock=new THREE.Mesh(new THREE.BoxGeometry(6,1.5,4),dockMat);
dock.position.set(0,1.75,-11); dock.castShadow=true; F.add(dock);
const shutter=new THREE.Mesh(new THREE.BoxGeometry(4,4.5,0.2),
  new THREE.MeshStandardMaterial({color:0x8899aa,metalness:0.5}));
shutter.position.set(0,4.5,-9.1); F.add(shutter);
for(let r=0;r<5;r++){
  const ln=new THREE.Mesh(new THREE.BoxGeometry(4.05,0.05,0.22),
    new THREE.MeshStandardMaterial({color:0x667788}));
  ln.position.set(0,3+r*0.9,-9.1); F.add(ln);
}

// hazard stripes
const hStripe=new THREE.Mesh(new THREE.BoxGeometry(14.1,0.8,0.1),
  new THREE.MeshStandardMaterial({color:0xffcc00}));
hStripe.position.set(0,1.4,-9.05); F.add(hStripe);

// company sign
const signMesh=new THREE.Mesh(new THREE.BoxGeometry(8,1.5,0.15),
  new THREE.MeshStandardMaterial({color:0x1144aa,emissive:0x0033aa,emissiveIntensity:0.3,metalness:0.5}));
signMesh.position.set(0,9.5,-9.1); F.add(signMesh);

// catwalk
const cwMat=new THREE.MeshStandardMaterial({color:0x999999,metalness:0.7,roughness:0.3});
const cwBox = new THREE.Mesh(new THREE.BoxGeometry(16,0.15,2),cwMat);
cwBox.position.set(0,9,-10.5);
F.add(cwBox);
const rail=new THREE.Mesh(new THREE.BoxGeometry(16,0.08,0.08),cwMat);
rail.position.set(0,10.5,-11.4); F.add(rail);
for(let r=0;r<5;r++){
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,1.5,6),cwMat);
  p.position.set(-7+r*3.5,9.75,-11.4); F.add(p);
}

// platform lights
function mkLamp(x,y,z){
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,2,6), new THREE.MeshStandardMaterial({color:0x888888,metalness:0.7}));
  pole.position.set(x,y+1,z);
  F.add(pole);
  
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8), new THREE.MeshStandardMaterial({color:0xffeeaa,emissive:0xffcc44,emissiveIntensity:1.2}));
  bulb.position.set(x,y+2.1,z);
  F.add(bulb);
  
  const l=new THREE.PointLight(0xffcc44,0.8,12); l.position.set(x,y+2.1,z); F.add(l);
}
mkLamp(-7,1,-12); mkLamp(7,1,-12); mkLamp(-7,1,10); mkLamp(7,1,10);

// factory interior glow
const fGlow=new THREE.PointLight(0xffaa44,1.5,25); fGlow.position.set(0,7,0); F.add(fGlow);

F.position.set(30, 2.0, -5); // Entire factory elevated to match shore!
scene.add(F);

/* ═══════════ OIL PIPE ═══════════ */
const pipePath=new THREE.CatmullRomCurve3([
  new THREE.Vector3(23,4,-2), new THREE.Vector3(10,3,-1),
  new THREE.Vector3(-2,1.5,1), new THREE.Vector3(-8,0.3,3),
]);
const pipe=new THREE.Mesh(new THREE.TubeGeometry(pipePath,20,0.5,8,false),
  new THREE.MeshStandardMaterial({color:0x3a3a3a,metalness:0.7,roughness:0.4}));
pipe.castShadow=true; scene.add(pipe);
for(let t=0.2;t<=0.8;t+=0.3){
  const pt=pipePath.getPointAt(t);
  const sup=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,pt.y,6),
    new THREE.MeshStandardMaterial({color:0x555555,metalness:0.5}));
  sup.position.set(pt.x,pt.y/2,pt.z); sup.castShadow=true; scene.add(sup);
}

/* ═══════════ DETECTION BUOY ═══════════ */
const buoyGroup=new THREE.Group();
// body
const buoyBody=new THREE.Mesh(new THREE.SphereGeometry(1.2,32,24),
  new THREE.MeshStandardMaterial({color:0xee8800,roughness:0.3,metalness:0.4}));
buoyBody.position.y=0.3; buoyBody.castShadow=true; buoyGroup.add(buoyBody);
// stripe
const bStripe=new THREE.Mesh(new THREE.TorusGeometry(1.22,0.12,8,32),
  new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.3}));
bStripe.position.y=0.3; bStripe.rotation.x=Math.PI/2; buoyGroup.add(bStripe);
// mast
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,3,8), new THREE.MeshStandardMaterial({color:0x888888,metalness:0.8}));
mast.position.set(0,2,0);
buoyGroup.add(mast);
// light housing
const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.35,0.5,12), new THREE.MeshStandardMaterial({color:0x333333,metalness:0.6}));
housing.position.set(0,3.5,0);
buoyGroup.add(housing);
// alert bulb
const alertMat=new THREE.MeshStandardMaterial({color:0x00ff66,emissive:0x00ff66,emissiveIntensity:1.5,roughness:0.1});
const alertBulb=new THREE.Mesh(new THREE.SphereGeometry(0.35,16,16),alertMat);
alertBulb.position.y=3.9; buoyGroup.add(alertBulb);
// alert point light
const buoyLight=new THREE.PointLight(0x00ff66,3,15); buoyLight.position.y=3.9; buoyGroup.add(buoyLight);
// glow sprite
const glowMat=new THREE.SpriteMaterial({map:createGlowTexture(),color:0x00ff66,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending});
const glowSprite=new THREE.Sprite(glowMat); glowSprite.position.y=3.9; glowSprite.scale.set(4,4,1); buoyGroup.add(glowSprite);
// sensor ring
const sRing=new THREE.Mesh(new THREE.TorusGeometry(1.5,0.06,8,32),
  new THREE.MeshStandardMaterial({color:0x00ccff,emissive:0x006688,emissiveIntensity:0.5}));
sRing.rotation.x=Math.PI/2; sRing.position.y=-0.3; buoyGroup.add(sRing);
buoyGroup.position.set(-25,0.5,8); scene.add(buoyGroup);

/* ═══════════ SMOKE PARTICLES ═══════════ */
const SMOKE_N=200;
const smPos=new Float32Array(SMOKE_N*3), smSize=new Float32Array(SMOKE_N), smAlpha=new Float32Array(SMOKE_N);
const chimneyOrigins=[{x:27,z:-9,h:18.5},{x:33,z:-9,h:20.5},{x:27,z:0,h:17.5}];
function resetSmoke(i){
  const c=chimneyOrigins[i%3];
  smPos[i*3]=c.x+(Math.random()-0.5)*0.5;
  smPos[i*3+1]=c.h+Math.random()*0.5;
  smPos[i*3+2]=c.z+(Math.random()-0.5)*0.5;
  smSize[i]=Math.random()*3+1; smAlpha[i]=0.6;
  state.smokeParticles[i]={vel:new THREE.Vector3((Math.random()-0.5)*0.03,0.03+Math.random()*0.04,(Math.random()-0.5)*0.02),life:0,max:80+Math.random()*120};
}
for(let i=0;i<SMOKE_N;i++) resetSmoke(i);
const smGeo=new THREE.BufferGeometry();
smGeo.setAttribute('position',new THREE.BufferAttribute(smPos,3));
smGeo.setAttribute('size',new THREE.BufferAttribute(smSize,1));
smGeo.setAttribute('alpha',new THREE.BufferAttribute(smAlpha,1));
const smMat=new THREE.ShaderMaterial({
  uniforms:{uColor:{value:new THREE.Color(0x666666)}},
  vertexShader:`attribute float size;attribute float alpha;varying float vA;void main(){vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*(200.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;gl_FragColor=vec4(uColor,smoothstep(0.5,0.0,d)*vA);}`,
  transparent:true,depthWrite:false
});
scene.add(new THREE.Points(smGeo,smMat));

/* ═══════════ OIL PARTICLES ═══════════ */
const OIL_N=500;
const oPos=new Float32Array(OIL_N*3), oSize=new Float32Array(OIL_N), oAlpha=new Float32Array(OIL_N);
for(let i=0;i<OIL_N;i++){oPos[i*3]=-8;oPos[i*3+1]=-5;oPos[i*3+2]=3;oSize[i]=0;oAlpha[i]=0;
  state.oilParticles[i]={active:false,vel:new THREE.Vector3(),life:0};}
const oGeo=new THREE.BufferGeometry();
oGeo.setAttribute('position',new THREE.BufferAttribute(oPos,3));
oGeo.setAttribute('size',new THREE.BufferAttribute(oSize,1));
oGeo.setAttribute('alpha',new THREE.BufferAttribute(oAlpha,1));
const oMat=new THREE.ShaderMaterial({
  uniforms:{uColor:{value:new THREE.Color(0x1a0a00)}},
  vertexShader:`attribute float size;attribute float alpha;varying float vA;void main(){vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*(200.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;gl_FragColor=vec4(uColor,smoothstep(0.5,0.0,d)*vA*0.9);}`,
  transparent:true,depthWrite:false
});
const oilSys=new THREE.Points(oGeo,oMat); oilSys.position.y=0.3; scene.add(oilSys);

/* ═══════════ SCENE EXTRAS ═══════════ */
// storage tanks
function mkTank(x,y,z,r,h,c){
  const t=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),new THREE.MeshStandardMaterial({color:c,roughness:0.5,metalness:0.4}));
  t.position.set(x,y+h/2,z); t.castShadow=true; return t;
}
scene.add(mkTank(40,0,8,2.5,6,0x666666)); scene.add(mkTank(45,0,5,2,5,0x777777)); scene.add(mkTank(42,0,-12,3,7,0x555555));

// barrels
const barrelMat=new THREE.MeshStandardMaterial({color:0x222222});
for(let i=0;i<4;i++){
  const b=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.6,1.2,12),barrelMat);
  b.position.set(20+i*1.5,0.6,1+(i%2)*1.2); b.castShadow=true; scene.add(b);
}

// rocks
function mkRock(x,z,s){
  const g=new THREE.DodecahedronGeometry(s,1);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).multiplyScalar(0.8+Math.random()*0.4); p.setXYZ(i,v.x,v.y,v.z);}
  g.computeVertexNormals();
  const r=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x6a6a6a,roughness:0.9}));
  r.position.set(x,s*0.3,z); r.rotation.set(Math.random(),Math.random(),Math.random()); r.castShadow=true; return r;
}
scene.add(mkRock(13,-8,1.2)); scene.add(mkRock(11,-12,0.8)); scene.add(mkRock(14,15,1));
scene.add(mkRock(12,20,0.6)); scene.add(mkRock(15,-18,1.5));

// foam strip
const foam=new THREE.Mesh(new THREE.PlaneGeometry(4,120),
  new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.15,side:THREE.DoubleSide}));
foam.rotation.x=-Math.PI/2; foam.position.set(5,0.18,0); scene.add(foam);

/* ═══════════ UI REFS ═══════════ */
const $light=document.getElementById('alert-light');
const $status=document.getElementById('alert-status');
const $fill=document.getElementById('pollution-fill');
const $pct=document.getElementById('pollution-percent');
const $quality=document.getElementById('stat-quality');
const $oil=document.getElementById('stat-oil');
const $buoy=document.getElementById('stat-buoy');
const $btnSpill=document.getElementById('btn-spill');
const $btnReset=document.getElementById('btn-reset');
const $btnCam=document.getElementById('btn-camera');

/* ═══════════ CONTROLS ═══════════ */
$btnSpill.addEventListener('click', ()=>{
  if(!state.spillActive){state.spillActive=true; $btnSpill.textContent='🛢️ Spilling...'; $btnSpill.style.opacity='0.5'; $btnSpill.style.pointerEvents='none';}
});
$btnReset.addEventListener('click', ()=>{
  state.spillActive=false; state.spillProgress=0; state.pollutionLevel=0;
  $btnSpill.textContent='🛢️ Start Oil Spill'; $btnSpill.style.opacity='1'; $btnSpill.style.pointerEvents='auto';
  for(let i=0;i<OIL_N;i++){oPos[i*3]=-8;oPos[i*3+1]=-5;oPos[i*3+2]=3;oSize[i]=0;oAlpha[i]=0;state.oilParticles[i].active=false;}
  oGeo.attributes.position.needsUpdate=oGeo.attributes.size.needsUpdate=oGeo.attributes.alpha.needsUpdate=true;
  oceanMat.uniforms.uPollution.value=0;
});
let camMode=0;
$btnCam.addEventListener('click', ()=>{
  camMode=(camMode+1)%3;
  if(camMode===0){$btnCam.textContent='📷 Buoy View'; camera.position.set(35,25,40); controls.target.set(5,2,5); controls.enabled=true;}
  else if(camMode===1){$btnCam.textContent='📷 Factory View'; controls.enabled=false;}
  else{$btnCam.textContent='📷 Overview'; controls.enabled=false;}
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);});

/* ═══════════ ANIMATION ═══════════ */
const clock=new THREE.Clock();

function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta(); state.time+=dt;

  // update uniforms
  oceanMat.uniforms.uTime.value=state.time;
  skyMat.uniforms.uTime.value=state.time;

  // oil spill
  if(state.spillActive && state.spillProgress<1){
    state.spillProgress=Math.min(1,state.spillProgress+dt*0.06);
    state.pollutionLevel=Math.min(100,state.spillProgress*100);
    oceanMat.uniforms.uPollution.value=state.spillProgress;
  }
  if(state.spillActive){
    const ac=Math.floor(state.spillProgress*OIL_N);
    for(let i=0;i<ac;i++){
      if(!state.oilParticles[i].active){
        state.oilParticles[i].active=true; state.oilParticles[i].life=0;
        oPos[i*3]=-8+(Math.random()-0.5)*2; oPos[i*3+1]=0; oPos[i*3+2]=3+(Math.random()-0.5)*2;
        state.oilParticles[i].vel.set(-0.02+(Math.random()-0.5)*0.04,0,(Math.random()-0.5)*0.03);
        oSize[i]=2+Math.random()*4; oAlpha[i]=0.7+Math.random()*0.3;
      }
    }
  }
  for(let i=0;i<OIL_N;i++){
    if(state.oilParticles[i].active){
      state.oilParticles[i].life+=dt;
      oPos[i*3]+=state.oilParticles[i].vel.x; oPos[i*3+2]+=state.oilParticles[i].vel.z;
      oPos[i*3+1]=Math.sin(state.time*0.8+i*0.3)*0.15;
      state.oilParticles[i].vel.x*=0.999;
      state.oilParticles[i].vel.z+=(Math.random()-0.5)*0.001;
      oSize[i]=Math.min(8,oSize[i]+0.005);
    }
  }
  oGeo.attributes.position.needsUpdate=oGeo.attributes.size.needsUpdate=oGeo.attributes.alpha.needsUpdate=true;

  // smoke
  for(let i=0;i<SMOKE_N;i++){
    const p=state.smokeParticles[i]; p.life++;
    if(p.life>p.max){resetSmoke(i);continue;}
    smPos[i*3]+=p.vel.x; smPos[i*3+1]+=p.vel.y; smPos[i*3+2]+=p.vel.z;
    smPos[i*3]-=0.015; smSize[i]+=0.02;
    smAlpha[i]=Math.max(0,0.6*(1-p.life/p.max));
  }
  smGeo.attributes.position.needsUpdate=smGeo.attributes.size.needsUpdate=smGeo.attributes.alpha.needsUpdate=true;

  // buoy bob
  buoyGroup.position.y=0.5+Math.sin(state.time*1.2)*0.3+Math.sin(state.time*0.7)*0.15;
  buoyGroup.rotation.x=Math.sin(state.time*0.9)*0.05;
  buoyGroup.rotation.z=Math.cos(state.time*0.6)*0.08;

  // alert system
  const isAlert=state.pollutionLevel>25;
  const blink=Math.sin(state.time*6)>0;
  if(isAlert){
    const inten=blink?3.5:0.5;
    alertMat.color.setHex(0xff1744); alertMat.emissive.setHex(0xff1744); alertMat.emissiveIntensity=inten;
    buoyLight.color.setHex(0xff1744); buoyLight.intensity=inten;
    glowMat.color.setHex(0xff1744); glowMat.opacity=blink?0.9:0.2;
  } else {
    const pulse=Math.sin(state.time*2)*0.3+0.7;
    alertMat.color.setHex(0x00ff66); alertMat.emissive.setHex(0x00ff66); alertMat.emissiveIntensity=pulse*1.5;
    buoyLight.color.setHex(0x00ff66); buoyLight.intensity=pulse*3;
    glowMat.color.setHex(0x00ff66); glowMat.opacity=pulse*0.7;
  }

  // HUD
  const pl=Math.round(state.pollutionLevel);
  $fill.style.width=pl+'%'; $pct.textContent=pl+'%';
  if(isAlert){
    $light.classList.add('red'); $status.textContent='⚠ POLLUTION DETECTED'; $status.style.color='#ff1744';
    $quality.textContent=pl>70?'CRITICAL':'POOR'; $quality.className='stat-value '+(pl>70?'danger':'warning');
    $oil.textContent=Math.round(pl*12)+' ppm'; $oil.className='stat-value danger';
  } else {
    $light.classList.remove('red'); $status.textContent='ALL CLEAR'; $status.style.color='#00e676';
    $quality.textContent='GOOD'; $quality.className='stat-value good';
    $oil.textContent=Math.round(pl*3)+' ppm'; $oil.className='stat-value good';
  }

  // camera modes
  if(camMode===1){
    camera.position.lerp(new THREE.Vector3(buoyGroup.position.x+8,buoyGroup.position.y+5,buoyGroup.position.z+8),0.02);
    camera.lookAt(buoyGroup.position.x,buoyGroup.position.y+2,buoyGroup.position.z);
  } else if(camMode===2){
    camera.position.lerp(new THREE.Vector3(30,18,-25),0.02);
    camera.lookAt(30,5,-5);
  }

  controls.update();
  renderer.render(scene,camera);
}

// start
setTimeout(()=>document.getElementById('loading-screen').classList.add('hidden'), 1200);
animate();
console.log('🌊 Ocean Pollution Simulator — running');
