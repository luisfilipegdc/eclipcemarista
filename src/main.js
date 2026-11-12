import * as THREE from 'three';
import { VRButton } from '../vendor/VRButton.js';
import { earthShader, atmosphereShader, moonShader, sunVisibleJS } from './shaders.js';
import { TOURS, orbitLerp } from './tour.js';
import { Panel } from './panel.js';
import { PhoneVR } from './phonevr.js';
import { SunRays, makeStars, Comet, SpaceCow, SoundBoard } from './effects.js';

// ---------------------------------------------------------------------------
// Escala do "universo"
// Unidades base: raio da Terra = 20. Tudo é multiplicado por K para que, no VR,
// os astros pareçam realmente distantes (sem efeito de "maquete").
// Distâncias comprimidas para caber na visão, mantendo a geometria das sombras:
// o Sol e a Lua têm quase o mesmo tamanho aparente vistos da Terra.
// ---------------------------------------------------------------------------
const K = 20;
const R_E = 20;
const R_M = 5.45;
const D_M = 120;
const SUN_D = 4000;
const R_S = 165;

const FWD = new THREE.Vector3(0, 0, -1); // direção do Sol
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3().crossVectors(UP, FWD).normalize();
const EARTH = new THREE.Vector3(0, 0, 0);
const SUN = FWD.clone().multiplyScalar(SUN_D);

// ---------------------------------------------------------------------------
// Renderer / cena
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

// Botão "ENTER VR" só aparece em óculos com WebXR (ex.: Meta Quest)
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    const b = VRButton.createButton(renderer);
    document.body.appendChild(b);
    document.getElementById('questNote').hidden = false;
  }).catch(() => {});
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 400000);

// rig = o satélite (se move pelo espaço); turn = giro do jogador (joystick)
const rig = new THREE.Group();
const turn = new THREE.Group();
rig.add(turn);
// head = cabeça do aluno (giroscópio / mouse). No WebXR o óculos controla a câmera.
const head = new THREE.Group();
const HEAD_POS = new THREE.Vector3(0, 1.6, 0.6);
head.position.copy(HEAD_POS);
turn.add(head);
head.add(camera);
const phone = new PhoneVR(renderer, head);
scene.add(rig);

const space = new THREE.Group();
space.scale.setScalar(K);
scene.add(space);

// ---------------------------------------------------------------------------
// Texturas
// ---------------------------------------------------------------------------
const manager = new THREE.LoadingManager();
manager.onLoad = () => { document.getElementById('loading').textContent = 'Pronto!'; };
manager.onError = (url) => { document.getElementById('loading').textContent = 'Erro ao carregar ' + url; };
const loader = new THREE.TextureLoader(manager);
const loadTex = (url, srgb = true) => {
  const t = loader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};
const dayTex = loadTex('assets/terra_dia.jpg');
const nightTex = loadTex('assets/terra_noite.jpg');
const cloudTex = loadTex('assets/terra_nuvens.png', false);
cloudTex.wrapS = THREE.RepeatWrapping;
const moonTex = loadTex('assets/lua.jpg');

// ---------------------------------------------------------------------------
// Sol
// ---------------------------------------------------------------------------
function radialTexture(stops, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function coronaTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  g.globalCompositeOperation = 'lighter';
  const base = g.createRadialGradient(cx, cx, size * 0.11, cx, cx, size * 0.5);
  base.addColorStop(0, 'rgba(255,255,255,0.95)');
  base.addColorStop(0.08, 'rgba(230,240,255,0.55)');
  base.addColorStop(0.35, 'rgba(160,190,255,0.12)');
  base.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // filamentos da coroa
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2;
    const len = size * (0.16 + Math.random() * Math.random() * 0.34);
    const w = 0.02 + Math.random() * 0.05;
    g.save();
    g.translate(cx, cx);
    g.rotate(a);
    const lg = g.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.32, 'rgba(235,240,255,0.16)');
    lg.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(size * 0.1, -size * w * 0.5);
    g.lineTo(len, 0);
    g.lineTo(size * 0.1, size * w * 0.5);
    g.closePath();
    g.fill();
    g.restore();
  }
  // proeminências (rosadas) na borda
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = size * 0.112;
    const pg = g.createRadialGradient(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 0, cx + Math.cos(a) * r, cx + Math.sin(a) * r, size * 0.012);
    pg.addColorStop(0, 'rgba(255,80,120,0.9)');
    pg.addColorStop(1, 'rgba(255,80,120,0)');
    g.fillStyle = pg;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const sunGroup = new THREE.Group();
sunGroup.position.copy(SUN);
space.add(sunGroup);
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(R_S, 48, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff1cc, toneMapped: false })
);
sunGroup.add(sunMesh);
const glowMat = new THREE.SpriteMaterial({
  map: radialTexture([[0, 'rgba(255,250,230,1)'], [0.12, 'rgba(255,230,160,0.85)'], [0.3, 'rgba(255,190,90,0.25)'], [1, 'rgba(255,150,50,0)']]),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
});
const sunGlow = new THREE.Sprite(glowMat);
sunGlow.scale.setScalar(R_S * 7);
sunGroup.add(sunGlow);
// a coroa usa ~11% do raio da textura para o disco: escala = 2*R_S/0.22
const coronaMat = new THREE.SpriteMaterial({
  map: coronaTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false,
});
const corona = new THREE.Sprite(coronaMat);
corona.scale.setScalar((2 * R_S) / 0.22);
sunGroup.add(corona);

// ---------------------------------------------------------------------------
// Terra
// ---------------------------------------------------------------------------
const earthTilt = new THREE.Group();
earthTilt.rotation.z = THREE.MathUtils.degToRad(23.4);
space.add(earthTilt);

const earthUniforms = {
  dayMap: { value: dayTex },
  nightMap: { value: nightTex },
  cloudMap: { value: cloudTex },
  cloudShift: { value: 0 },
  sunPos: { value: SUN.clone().multiplyScalar(K) },
  sunR: { value: R_S * K },
  moonPos: { value: new THREE.Vector3() },
  moonR: { value: R_M * K },
  overlayMode: { value: 1 },
};
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(R_E, 160, 80),
  new THREE.ShaderMaterial({ uniforms: earthUniforms, ...earthShader })
);
earthTilt.add(earth);

const atmoUniforms = {
  sunPos: earthUniforms.sunPos,
  sunR: earthUniforms.sunR,
  moonPos: earthUniforms.moonPos,
  moonR: earthUniforms.moonR,
};
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(R_E * 1.035, 96, 48),
  new THREE.ShaderMaterial({
    uniforms: atmoUniforms, ...atmosphereShader,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  })
);
space.add(atmosphere);

// eixo da Terra (guia)
const axisLine = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.12, R_E * 2.6, 8),
  new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.5 })
);
earthTilt.add(axisLine);

// ---------------------------------------------------------------------------
// Lua
// ---------------------------------------------------------------------------
const moonUniforms = {
  map: { value: moonTex },
  sunPos: earthUniforms.sunPos,
  sunR: earthUniforms.sunR,
  earthPos: { value: new THREE.Vector3(0, 0, 0) },
  earthR: { value: R_E * K },
};
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(R_M, 96, 48),
  new THREE.ShaderMaterial({ uniforms: moonUniforms, ...moonShader })
);
space.add(moon);
// Lua "fantasma": mostra onde a Lua fica no OUTRO tipo de eclipse (parada de comparação)
const ghostMoon = new THREE.Mesh(
  new THREE.SphereGeometry(R_M, 48, 24),
  new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, opacity: 0.35, depthWrite: false })
);
ghostMoon.visible = false;
space.add(ghostMoon);

// órbita da Lua (guia)
let orbitRing = null;
function buildOrbitRing(lift) {
  if (orbitRing) { space.remove(orbitRing); orbitRing.geometry.dispose(); }
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * D_M, lift, Math.sin(a) * D_M));
  }
  orbitRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x8899cc, transparent: true, opacity: 0.45 })
  );
  space.add(orbitRing);
}

// ---------------------------------------------------------------------------
// Estrelas
// ---------------------------------------------------------------------------
const stars = makeStars(6000, 9000);
space.add(stars);

// raios de sol, cometa, vaca astronauta, sons
const sunRays = new SunRays({ fwd: FWD, up: UP, side: SIDE });
space.add(sunRays.mesh);
const comet = new Comet(SUN);
space.add(comet.group);
const cow = new SpaceCow();
const sound = new SoundBoard();
rig.add(cow.group);

// ---------------------------------------------------------------------------
// Cones de sombra (umbra e penumbra) — guias visuais
// ---------------------------------------------------------------------------
const umbraMat = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
const penumbraMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
const umbraCone = new THREE.Mesh(new THREE.BufferGeometry(), umbraMat);
const penumbraCone = new THREE.Mesh(new THREE.BufferGeometry(), penumbraMat);
space.add(umbraCone, penumbraCone);
const coneInfo = { umbraLen: 0, umbraFull: 0, penLen: 0 };

function buildCones(occR, dist, displayLen) {
  const Lu = (dist * occR) / (R_S - occR); // comprimento total da umbra
  const uLen = Math.min(Lu, displayLen);
  const uEnd = Math.max(0.02, occR * (1 - uLen / Lu));
  const pEnd = occR + (displayLen * (R_S + occR)) / dist;
  umbraCone.geometry.dispose();
  penumbraCone.geometry.dispose();
  umbraCone.geometry = new THREE.CylinderGeometry(occR * 1.002, uEnd, uLen, 72, 1, true);
  penumbraCone.geometry = new THREE.CylinderGeometry(occR * 1.004, pEnd, displayLen, 72, 1, true);
  coneInfo.umbraLen = uLen;
  coneInfo.umbraFull = Lu;
  coneInfo.penLen = displayLen;
  coneInfo.penEnd = pEnd;
}
function placeCone(mesh, origin, axis, len) {
  mesh.position.copy(origin).addScaledVector(axis, len / 2);
  mesh.quaternion.setFromUnitVectors(UP, axis.clone().negate());
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------
function makeLabel(text, color, small = false) {
  const c = document.createElement('canvas');
  c.width = small ? 1024 : 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  if (small) g.font = 'bold 54px system-ui, sans-serif';
  g.strokeText(text, c.width / 2, 64);
  g.fillStyle = color;
  g.fillText(text, c.width / 2, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
  s.scale.set(small ? 0.32 : 0.16, 0.04, 1);
  s.renderOrder = 20;
  scene.add(s);
  return s;
}
const labels = {
  sol: makeLabel('SOL', '#ffd25a'),
  terra: makeLabel('TERRA', '#8cc4ff'),
  lua: makeLabel('LUA', '#e6e6e6'),
  umbra: makeLabel('UMBRA', '#ff6b80'),
  penumbra: makeLabel('PENUMBRA', '#ffc070'),
  luaNova: makeLabel('LUA NOVA = eclipse SOLAR', '#ffd25a', true),
  luaCheia: makeLabel('LUA CHEIA = eclipse LUNAR', '#ff8a6a', true),
};

// ---------------------------------------------------------------------------
// Cabine do satélite (em metros, presa ao rig)
// ---------------------------------------------------------------------------
const cockpit = new THREE.Group();
rig.add(cockpit);
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a93a6, metalness: 0.7, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b313d, metalness: 0.5, roughness: 0.6 });
  const glowCyan = new THREE.MeshBasicMaterial({ color: 0x38e0ff });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.08, 64), dark);
  floor.position.y = -0.04;
  cockpit.add(floor);
  // grade do piso
  const grid = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.64, 48), glowCyan);
  grid.rotation.x = -Math.PI / 2; grid.position.y = 0.002;
  cockpit.add(grid);
  const ringFloor = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.02, 8, 96), glowCyan);
  ringFloor.rotation.x = Math.PI / 2; ringFloor.position.y = 0.01;
  cockpit.add(ringFloor);

  // parede baixa
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.8, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a4252, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
  wall.position.y = 0.4;
  cockpit.add(wall);
  const wallTop = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 10, 96), metal);
  wallTop.rotation.x = Math.PI / 2; wallTop.position.y = 0.8;
  cockpit.add(wallTop);

  // cúpula de vidro: só as nervuras (o "vidro" é invisível)
  for (let i = 0; i < 8; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.04, 8, 40, Math.PI / 2), metal);
    rib.position.y = 0.8;
    rib.rotation.y = (i * Math.PI) / 4 + Math.PI / 8;
    cockpit.add(rib);
  }
  const midRing = new THREE.Mesh(new THREE.TorusGeometry(2.4 * Math.cos(Math.PI / 4), 0.03, 8, 96), metal);
  midRing.rotation.x = Math.PI / 2; midRing.position.y = 0.8 + 2.4 * Math.sin(Math.PI / 4);
  cockpit.add(midRing);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 32), metal);
  hatch.position.y = 3.2;
  cockpit.add(hatch);

  // console
  const console1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.5), dark);
  console1.position.set(0, 0.35, -1.3);
  cockpit.add(console1);
  const consoleLights = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.02), glowCyan);
  consoleLights.position.set(0, 0.62, -1.045);
  cockpit.add(consoleLights);

  // braços e painéis solares do lado de fora
  const solarTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1f4a'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#6f86b8'; g.lineWidth = 3;
    for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let y = 0; y <= 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const solarMat = new THREE.MeshStandardMaterial({ map: solarTex, metalness: 0.6, roughness: 0.25, emissive: 0x0a1a3a, emissiveIntensity: 0.6 });
  for (const sgn of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 12), metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(sgn * 3.8, 0.5, 0.6);
    cockpit.add(arm);
    for (let j = 0; j < 2; j++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.04, 2.4), solarMat);
      sp.position.set(sgn * (5.5 + j * 4.4), 0.5, 0.6);
      cockpit.add(sp);
    }
  }
  // antena atrás
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3.2), new THREE.MeshStandardMaterial({ color: 0xd8dce6, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }));
  dish.position.set(0, 1.2, 3.6);
  dish.rotation.x = -Math.PI / 2;
  cockpit.add(dish);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), metal);
  mast.rotation.x = Math.PI / 2; mast.position.set(0, 0.9, 2.9);
  cockpit.add(mast);

  // luzinhas piscando
  const blinkers = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3344 : 0x33ff88 }));
    const a = (i / 6) * Math.PI * 2 + 0.3;
    m.position.set(Math.cos(a) * 2.4, 0.86, Math.sin(a) * 2.4);
    cockpit.add(m);
    blinkers.push(m);
  }
  cockpit.userData.blinkers = blinkers;
}
const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.6);
scene.add(sunLight);
scene.add(sunLight.target);
const cabinLight = new THREE.HemisphereLight(0x8fb4ff, 0x202430, 0.5);
scene.add(cabinLight);

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
const panel = new Panel();
panel.mesh.position.set(0, 0.98, -0.88);
panel.mesh.rotation.x = -0.7;
rig.add(panel.mesh);
panel.layoutButtons([
  { id: 'solar', label: 'Eclipse\nSolar', row: 0, col: 0 },
  { id: 'lunar', label: 'Eclipse\nLunar', row: 0, col: 1 },
  { id: 'restart', label: 'Reiniciar', row: 0, col: 2 },
  { id: 'pause', label: (s) => (s.playing ? 'Pausar' : 'Continuar'), row: 0, col: 3 },
  { id: 'next', label: 'Próxima\nparada', row: 0, col: 4 },
  { id: 'guides', label: 'Raios e\nsombras', row: 1, col: 0 },
  { id: 'overlay', label: 'Onde é\nvisível', row: 1, col: 1 },
  { id: 'labels', label: 'Nomes', row: 1, col: 2 },
  { id: 'narration', label: 'Narração', row: 1, col: 3 },
  { id: 'music', label: 'Música', row: 1, col: 4 },
]);

// Tela preta para transições bruscas (troca de modo / pular parada)
const fader = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 16, 8),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false })
);
fader.renderOrder = 999;
head.add(fader);

// Mira para escolher botões olhando (modo óculos de celular)
const reticle = new THREE.Group();
reticle.position.set(0, 0, -1);
const retBase = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.013, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
const retFill = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.021, 32, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: 0xffcf5a, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
retBase.renderOrder = retFill.renderOrder = 1000;
reticle.add(retBase, retFill);
reticle.visible = false;
head.add(reticle);
let retShown = -1;
function setReticleProgress(p) {
  const q = Math.round(p * 40) / 40;
  if (q === retShown) return;
  retShown = q;
  retFill.geometry.dispose();
  retFill.geometry = new THREE.RingGeometry(0.014, 0.021, 32, 1, Math.PI / 2, -Math.max(0.001, q * Math.PI * 2));
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  mode: 'solar',
  t: 0.0,
  playing: true,
  speed: 1,
  showGuides: true,
  showOverlay: true,
  showLabels: true,
  narration: 'speechSynthesis' in window,
  music: true,
  stationIdx: -2,
  fade: 0,
};
let tour = TOURS.solar;

function setMode(mode) {
  state.mode = mode;
  tour = TOURS[mode];
  state.t = 0;
  state.stationIdx = -2;
  state.fade = 1;
  buildOrbitRing(tour.moonLift);
  if (mode === 'solar') buildCones(R_M, SUN_D - D_M, 125);
  else buildCones(R_E, SUN_D, 175);
  if (window.speechSynthesis) speechSynthesis.cancel();
  refreshPanel(true);
}

function jumpToNextStation() {
  const st = tour.stations;
  let next = st.find((s) => s.start > state.t + 0.03);
  if (!next) next = st[0];
  state.t = next.start + 0.001;
  state.fade = 1;
}

function onButton(id) {
  switch (id) {
    case 'solar': setMode('solar'); break;
    case 'lunar': setMode('lunar'); break;
    case 'restart': setMode(state.mode); break;
    case 'pause': state.playing = !state.playing; break;
    case 'next': jumpToNextStation(); break;
    case 'speed': state.speed = { 0.5: 1, 1: 2, 2: 4, 4: 0.5 }[state.speed]; break;
    case 'guides': state.showGuides = !state.showGuides; break;
    case 'overlay': state.showOverlay = !state.showOverlay; break;
    case 'labels': state.showLabels = !state.showLabels; break;
    case 'music': state.music = !state.music; sound.init(); sound.setMusic(state.music); break;
    case 'narration':
      state.narration = !state.narration;
      if (!state.narration && window.speechSynthesis) speechSynthesis.cancel();
      else speakStation();
      break;
  }
  refreshPanel(true);
}

// ---------------------------------------------------------------------------
// Narração (voz do navegador, se existir)
// ---------------------------------------------------------------------------
let ptVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices();
  ptVoice = vs.find((v) => v.lang === 'pt-BR') || vs.find((v) => v.lang && v.lang.startsWith('pt')) || null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speakStation() {
  if (!state.narration || !window.speechSynthesis) return;
  const st = tour.stations[state.stationIdx];
  if (!st) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(st.name + '. ' + st.text);
  u.lang = 'pt-BR';
  if (ptVoice) u.voice = ptVoice;
  u.rate = 1.0;
  u.onstart = () => sound.duck(true);
  u.onend = u.onerror = () => sound.duck(false);
  speechSynthesis.speak(u);
}

// ---------------------------------------------------------------------------
// Geometria do momento: onde está a Lua, a sombra, etc.
// ---------------------------------------------------------------------------
const ctx = {
  fwd: FWD, side: SIDE, up: UP, sun: SUN, earth: EARTH,
  moon: new THREE.Vector3(), axis: new THREE.Vector3(), shadowPoint: new THREE.Vector3(), k: 0,
};

function moonPositionAt(t) {
  // perto do eclipse a Lua anda devagar; na abertura ela dá 2 voltas rápidas em volta da Terra
  const intro = t < 0.16 ? 1 - THREE.MathUtils.smoothstep(t, 0, 0.16) : 0;
  const phi = (tour.moonSwing * (t - tour.tMax)) / 0.5 - intro * Math.PI * 4;
  const base = state.mode === 'solar' ? FWD : FWD.clone().negate();
  return base.clone().multiplyScalar(D_M).applyAxisAngle(UP, phi).addScaledVector(UP, tour.moonLift);
}

function updateCtx(t) {
  ctx.moon.copy(moonPositionAt(t));
  if (state.mode === 'solar') ctx.axis.copy(ctx.moon).sub(SUN).normalize();
  else ctx.axis.copy(EARTH).sub(SUN).normalize();
  // ponto onde o eixo da sombra da Lua encontra a Terra (ou o ponto mais próximo)
  const o = ctx.moon, d = ctx.axis;
  const b = o.dot(d);
  const cc = o.lengthSq() - R_E * R_E;
  const disc = b * b - cc;
  if (disc >= 0) {
    const s = -b - Math.sqrt(disc);
    ctx.shadowPoint.copy(o).addScaledVector(d, s);
  } else {
    const s = -b;
    ctx.shadowPoint.copy(o).addScaledVector(d, s).normalize().multiplyScalar(R_E);
  }
}

// fase do eclipse (texto para o painel)
function eclipsePhase() {
  if (state.mode === 'solar') {
    const rel = EARTH.clone().sub(ctx.moon);
    const along = rel.dot(ctx.axis);
    if (along <= 0) return 'a Lua ainda não está entre o Sol e a Terra';
    const perp = rel.clone().addScaledVector(ctx.axis, -along).length();
    const dist = SUN.distanceTo(ctx.moon);
    const Lu = (dist * R_M) / (R_S - R_M);
    const alongSurf = along - R_E;
    const ru = R_M * (1 - alongSurf / Lu);
    const rp = R_M + (alongSurf * (R_S + R_M)) / dist;
    if (perp < R_E + Math.max(ru, 0) * 0.98) return 'ECLIPSE TOTAL numa faixa estreita da Terra';
    if (perp < R_E + rp) return 'eclipse PARCIAL em parte da Terra';
    return 'sem eclipse — a sombra da Lua não toca a Terra';
  }
  const rel = ctx.moon.clone();
  const along = rel.dot(ctx.axis);
  if (along <= 0) return 'Lua Nova — sem eclipse lunar';
  const perp = rel.clone().addScaledVector(ctx.axis, -along).length();
  const Lu = (SUN_D * R_E) / (R_S - R_E);
  const ru = R_E * (1 - along / Lu);
  const rp = R_E + (along * (R_S + R_E)) / SUN_D;
  if (perp + R_M < ru) return 'ECLIPSE TOTAL — Lua avermelhada';
  if (perp - R_M < ru) return 'eclipse PARCIAL — a umbra cobre parte da Lua';
  if (perp - R_M < rp) return 'eclipse PENUMBRAL — a Lua escurece de leve';
  return 'Lua Cheia, ainda fora da sombra da Terra';
}

// ---------------------------------------------------------------------------
// Posição / orientação do satélite em função do tempo
// ---------------------------------------------------------------------------
const tmpM = new THREE.Matrix4();
function lookQuat(pos, target) {
  tmpM.lookAt(pos, target, UP);
  return new THREE.Quaternion().setFromRotationMatrix(tmpM);
}
function stationPose(st, k) {
  ctx.k = k;
  const p = st.pos(ctx);
  const l = st.look(ctx);
  return { pos: p, quat: lookQuat(p, l) };
}
const smooth = (x) => x * x * (3 - 2 * x);

function computePose(t) {
  const st = tour.stations;
  for (let i = 0; i < st.length; i++) {
    if (t >= st[i].start && t <= st[i].end) {
      const k = (t - st[i].start) / (st[i].end - st[i].start);
      return { ...stationPose(st[i], k), idx: i, name: st[i].name };
    }
  }
  // entre paradas (com volta cíclica do fim para o começo)
  let prev = null, next = null, gapStart, gapEnd;
  for (let i = st.length - 1; i >= 0; i--) if (st[i].end < t) { prev = st[i]; break; }
  for (let i = 0; i < st.length; i++) if (st[i].start > t) { next = st[i]; break; }
  if (prev) gapStart = prev.end; else { prev = st[st.length - 1]; gapStart = prev.end - 1; }
  if (next) gapEnd = next.start; else { next = st[0]; gapEnd = next.start + 1; }
  const u = smooth(THREE.MathUtils.clamp((t - gapStart) / (gapEnd - gapStart), 0, 1));
  const a = stationPose(prev, 1);
  const b = stationPose(next, 0);
  const pos = orbitLerp(a.pos, b.pos, u);
  const quat = a.quat.clone().slerp(b.quat, u);
  return { pos, quat, idx: -1, name: next.name };
}

// ---------------------------------------------------------------------------
// Interação: controles VR e mouse
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x9fe8ff }));
  line.scale.z = 3;
  c.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  dot.visible = false;
  c.userData = { line, dot, hover: null };
  scene.add(dot);
  c.addEventListener('select', () => { if (c.userData.hover) onButton(c.userData.hover.id); });
  turn.add(c);
  controllers.push(c);
  const grip = renderer.xr.getControllerGrip(i);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x444b5a, metalness: 0.4, roughness: 0.5 }));
  body.rotation.x = Math.PI / 2;
  grip.add(body);
  turn.add(grip);
}

function rayFromController(c) {
  tmpM.identity().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
}

const mouse = { down: false, moved: 0, x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => {
  mouse.down = true; mouse.moved = 0; mouse.x = e.clientX; mouse.y = e.clientY;
});
window.addEventListener('pointerup', (e) => {
  if (mouse.down && mouse.moved < 6) screenTap(e);
  mouse.down = false;
});
window.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  if (mouse.down) {
    const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    phone.drag(dx, dy);
    mouse.x = e.clientX; mouse.y = e.clientY;
  } else if (viewMode === 'flat') {
    const hit = pickPanel(e);
    panel.setHover(hit);
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  }
});
function pickPanel(e) {
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(panel.mesh)[0];
  return hit ? panel.hitTest(hit.uv) : null;
}
function screenTap(e) {
  if (renderer.xr.isPresenting || viewMode === 'intro') return;
  const b = viewMode === 'flat' ? pickPanel(e) : null;
  if (b) onButton(b.id);
  else showHud();
}
window.addEventListener('keydown', (e) => {
  if (e.key === '1') onButton('solar');
  else if (e.key === '2') onButton('lunar');
  else if (e.key === ' ') { e.preventDefault(); onButton('pause'); }
  else if (e.key === 'n' || e.key === 'N') onButton('next');
});

// joystick: giro em passos (mais confortável no VR) + botões A/B
let snapCooldown = 0;
const prevButtons = new Map();
function handleGamepads(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  snapCooldown -= dt;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const x = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
    if (Math.abs(x) > 0.7 && snapCooldown <= 0) {
      turn.rotation.y -= Math.sign(x) * (Math.PI / 6);
      snapCooldown = 0.35;
    }
    const prev = prevButtons.get(src) || [];
    const a = gp.buttons[4]?.pressed, b = gp.buttons[5]?.pressed;
    if (a && !prev[0]) onButton('next');
    if (b && !prev[1]) onButton('pause');
    prevButtons.set(src, [a, b]);
  }
}

// ---------------------------------------------------------------------------
// Painel: estado
// ---------------------------------------------------------------------------
let panelTimer = 0;
let lastSunVis = 1;
let lastPose = { idx: -1, name: '' };
function refreshPanel(force = false) {
  if (!force && panelTimer > 0) return;
  panelTimer = 0.25;
  const st = tour.stations;
  const idx = lastPose.idx;
  panel.update({
    mode: state.mode,
    title: tour.title,
    stationIndex: idx,
    stationCount: st.length,
    stationName: lastPose.name,
    text: idx >= 0 ? st[idx].text : (st.find((s) => s.name === lastPose.name) || st[0]).text,
    phase: eclipsePhase(),
    sunVis: lastSunVis,
    progress: state.t,
    stations: st,
    playing: state.playing,
    speed: state.speed,
    active: {
      solar: state.mode === 'solar',
      lunar: state.mode === 'lunar',
      guides: state.showGuides,
      overlay: state.showOverlay,
      labels: state.showLabels,
      narration: state.narration,
      music: state.music,
    },
  });
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const camWorld = new THREE.Vector3();
let started = false;

function earthSpinFor(t) {
  // gira devagar (60° no passeio todo) e deixa o Brasil voltado para o evento no meio
  const lonTarget = THREE.MathUtils.degToRad(-50);
  const phiTex = lonTarget + Math.PI; // u*2π na esfera do three.js
  const x0 = -Math.cos(phiTex), z0 = Math.sin(phiTex);
  const az0 = Math.atan2(x0, z0);
  const targetAz = state.mode === 'solar' ? Math.PI : 0;
  const base = targetAz - az0;
  // a Terra gira de verdade: 1 volta a cada 60 s (velocidade 1x)
  const tRef = state.mode === 'solar' ? 0.41 : 0.74;
  return base + ((t - tRef) * tour.duration * Math.PI * 2) / 60;
}

const GAZE_TIME = 1.5;
const gaze = { id: null, t: 0, locked: null };
let viewMode = 'intro'; // intro | flat | stereo | xr
const rotateEl = document.getElementById('rotate');

let cometTimer = 25;
const _cd = new THREE.Vector3(), _cr = new THREE.Vector3(), _cu = new THREE.Vector3();
function launchComet() {
  camera.getWorldPosition(camWorld);
  camera.getWorldDirection(_cd);
  _cr.set(1, 0, 0).transformDirection(camera.matrixWorld);
  _cu.set(0, 1, 0).transformDirection(camera.matrixWorld);
  comet.launch(camWorld.clone().divideScalar(K), _cd, _cr, _cu);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!renderer.xr.isPresenting) phone.updateHead();
  const portrait = viewMode === 'stereo' && window.innerHeight > window.innerWidth;
  if (rotateEl.hidden === portrait) { rotateEl.hidden = !portrait; if (!portrait) phone.recenter(); }
  if (started && state.playing && !portrait) {
    const prevT = state.t;
    state.t += (dt * state.speed) / tour.duration;
    if (state.t >= 1) { state.t -= 1; state.fade = 1; }
    // easter egg: a vaca astronauta passa uma vez por passeio
    const cowAt = state.mode === 'solar' ? 0.815 : 0.82;
    if (prevT < cowAt && state.t >= cowAt) cow.start();
    // cometa: de tempos em tempos
    cometTimer -= dt;
    if (cometTimer <= 0) { launchComet(); cometTimer = 70 + Math.random() * 30; }
  }
  panelTimer -= dt;
  handleGamepads(dt);

  updateCtx(state.t);
  const pose = computePose(state.t);
  lastPose = pose;

  // satélite
  rig.position.copy(pose.pos).multiplyScalar(K);
  const damp = state.fade > 0.5 ? 1 : 1 - Math.exp(-dt * 2.5);
  rig.quaternion.slerp(pose.quat, damp);

  // Lua
  moon.position.copy(ctx.moon);
  const toEarth = EARTH.clone().sub(ctx.moon);
  moon.rotation.y = Math.atan2(toEarth.x, toEarth.z) - Math.PI / 2;
  earthUniforms.moonPos.value.copy(ctx.moon).multiplyScalar(K);

  // Terra
  earth.rotation.y = earthSpinFor(state.t);
  earthUniforms.cloudShift.value = state.t * 0.03;
  const curSt = tour.stations[pose.idx];
  earthUniforms.overlayMode.value = state.showOverlay && !(curSt && curSt.noOverlay) ? tour.overlay : 0;

  // sombra vista pelo satélite
  camera.getWorldPosition(camWorld);
  const camBase = camWorld.clone().divideScalar(K);
  const visMoon = sunVisibleJS(camBase, SUN, R_S, ctx.moon, R_M);
  const visEarth = sunVisibleJS(camBase, SUN, R_S, EARTH, R_E);
  const sunVis = visMoon * visEarth;
  lastSunVis = sunVis;
  glowMat.opacity = 0.1 + 0.7 * sunVis;
  coronaMat.opacity = THREE.MathUtils.clamp((0.06 - sunVis) / 0.06, 0, 1) * (visEarth > 0.5 ? 1 : 0);
  sunLight.intensity = 2.6 * sunVis;
  sunLight.position.copy(camWorld).addScaledVector(FWD, 10);
  sunLight.target.position.copy(camWorld);

  // guias
  // se o satélite estiver dentro de um cone de sombra, esconde o cone (senão ele tinge tudo)
  const occC = state.mode === 'solar' ? ctx.moon : EARTH;
  const occR = state.mode === 'solar' ? R_M : R_E;
  const relC = camBase.clone().sub(occC);
  const alongC = relC.dot(ctx.axis);
  const perpC = relC.addScaledVector(ctx.axis, -alongC).length();
  const penR = occR + (Math.max(alongC, 0) * (R_S + occR)) / SUN.distanceTo(occC);
  const insideCone = alongC > -occR && perpC < penR * 1.15;
  const guideFactor = insideCone ? 0 : 1;
  umbraCone.visible = penumbraCone.visible = orbitRing.visible = axisLine.visible = state.showGuides;
  umbraMat.opacity = 0.12 * guideFactor;
  penumbraMat.opacity = 0.07 * guideFactor;
  const occ = state.mode === 'solar' ? ctx.moon : EARTH;
  placeCone(umbraCone, occ, ctx.axis, coneInfo.umbraLen);
  placeCone(penumbraCone, occ, ctx.axis, coneInfo.penLen);

  // raios de sol, estrelas, cometa, vaca
  sunRays.mesh.visible = state.showGuides;
  sunRays.update(clock.elapsedTime, [{ c: ctx.moon, r: R_M }, { c: EARTH, r: R_E }]);
  sunRays.material.uniforms.opacity.value = insideCone ? 0.5 : 1;
  stars.material.uniforms.time.value = clock.elapsedTime;
  stars.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  comet.update(dt);
  if (cow.update(dt)) sound.moo();

  // comparação: Lua "fantasma" no lugar do outro eclipse
  const cmp = !!(curSt && curSt.compare);
  ghostMoon.visible = cmp;
  if (cmp) ghostMoon.position.copy(state.mode === 'solar' ? FWD : FWD.clone().negate()).multiplyScalar(-D_M).addScaledVector(UP, -tour.moonLift);

  // rótulos
  const showL = state.showLabels;
  for (const l of Object.values(labels)) l.visible = showL;
  labels.sol.position.copy(SUN).addScaledVector(UP, R_S * 1.6).multiplyScalar(K);
  labels.terra.position.copy(UP).multiplyScalar((R_E + 6) * K);
  labels.lua.position.copy(ctx.moon).addScaledVector(UP, R_M + 2.5).multiplyScalar(K);
  const perp = SIDE.clone();
  if (state.mode === 'solar') {
    labels.umbra.position.copy(ctx.moon).addScaledVector(ctx.axis, coneInfo.umbraLen * 0.45).multiplyScalar(K);
    labels.penumbra.position.copy(ctx.moon).addScaledVector(ctx.axis, 75).addScaledVector(perp, 9).multiplyScalar(K);
  } else {
    labels.umbra.position.copy(ctx.axis).multiplyScalar(70).multiplyScalar(K);
    labels.penumbra.position.copy(ctx.axis).multiplyScalar(150).addScaledVector(perp, 26).multiplyScalar(K);
  }
  labels.umbra.visible = labels.penumbra.visible = showL && state.showGuides && !insideCone;
  labels.sol.visible = showL && sunVis > 0.3;
  labels.luaNova.visible = labels.luaCheia.visible = cmp;
  if (cmp) {
    const realLbl = state.mode === 'solar' ? labels.luaNova : labels.luaCheia;
    const ghostLbl = state.mode === 'solar' ? labels.luaCheia : labels.luaNova;
    realLbl.position.copy(ctx.moon).addScaledVector(UP, R_M + 9).multiplyScalar(K);
    ghostLbl.position.copy(ghostMoon.position).addScaledVector(UP, R_M + 9).multiplyScalar(K);
    labels.lua.visible = false;
  }

  // cabine
  const blink = Math.floor(clock.elapsedTime * 1.5) % 2 === 0;
  cockpit.userData.blinkers.forEach((b, i) => (b.visible = (i % 2 === 0) === blink));

  // controles VR: raio e hover no painel
  if (renderer.xr.isPresenting) {
    let anyHover = null;
    for (const c of controllers) {
      rayFromController(c);
      const hit = raycaster.intersectObject(panel.mesh)[0];
      const btn = hit ? panel.hitTest(hit.uv) : null;
      c.userData.hover = btn;
      c.userData.line.scale.z = hit ? hit.distance : 3;
      c.userData.dot.visible = !!hit;
      if (hit) c.userData.dot.position.copy(hit.point);
      if (btn) anyHover = btn;
    }
    panel.setHover(anyHover);
  }

  // modo óculos de celular: escolher botão olhando para ele por 1,5 s
  if (viewMode === 'stereo') {
    head.updateMatrixWorld(true);
    raycaster.ray.origin.setFromMatrixPosition(head.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).transformDirection(head.matrixWorld);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    const btn = hit ? panel.hitTest(hit.uv) : null;
    panel.setHover(btn);
    const id = btn ? btn.id : null;
    if (id !== gaze.id) { gaze.id = id; gaze.t = 0; }
    if (id && id !== gaze.locked) {
      gaze.t += dt;
      if (gaze.t >= GAZE_TIME) { gaze.locked = id; gaze.t = 0; onButton(id); }
    }
    if (!id) gaze.locked = null;
    setReticleProgress(id && id !== gaze.locked ? gaze.t / GAZE_TIME : 0);
    retBase.material.color.set(id ? 0xffcf5a : 0xffffff);
  }

  // narração ao chegar numa parada
  if (pose.idx !== state.stationIdx) {
    const changedToStation = pose.idx >= 0;
    state.stationIdx = pose.idx;
    if (changedToStation) speakStation();
    refreshPanel(true);
  } else refreshPanel();

  // transição
  if (state.fade > 0) state.fade = Math.max(0, state.fade - dt * 1.6);
  fader.material.opacity = state.fade;
  fader.visible = state.fade > 0.001;

  if (renderer.xr.isPresenting) renderer.render(scene, camera);
  else if (viewMode === 'stereo') phone.render(scene);
  else {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
setMode('solar');
state.fade = 0;
renderer.setAnimationLoop(frame);

const $ = (q) => document.querySelector(q);
const intro = $('#intro');
const hud = $('#hud');
const toast = $('#toast');
let hudTimer = 0, toastTimer = 0;
function showHud() {
  if (viewMode === 'intro' || viewMode === 'xr') return;
  hud.classList.remove('off');
  clearTimeout(hudTimer);
  if (viewMode === 'stereo') hudTimer = setTimeout(() => hud.classList.add('off'), 3500);
}
function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}
function setIpdUI(v, show) {
  const mm = phone.setIpd(v);
  $('#ipd').value = mm;
  $('#ipdVal').textContent = mm + ' mm';
  if (show) { phone.showGuide(); showToast('Lentes: ' + mm + ' mm'); }
}
setIpdUI(phone.ipdMm, false);
$('#ipd').addEventListener('input', (e) => setIpdUI(+e.target.value, false));
state.narration = state.narration && $('#narr').checked;

function lockLandscape() {
  const el = document.documentElement;
  try {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const p = req && req.call(el);
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
  } catch (e) {}
}

async function start(mode) {
  let permP = null;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { permP = DeviceOrientationEvent.requestPermission(); } catch (e) {}
  }
  state.narration = $('#narr').checked && 'speechSynthesis' in window;
  if (state.narration) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} }
  phone.lensOn = $('#lens').checked;
  state.music = $('#music').checked;
  sound.musicOn = state.music;
  sound.init();
  sound.setMusic(state.music);
  viewMode = mode;
  if (mode === 'stereo') lockLandscape();
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  if (permP) try { await permP; } catch (e) {}
  intro.classList.add('hidden');
  hud.classList.toggle('off', mode === 'stereo');
  reticle.visible = mode === 'stereo';
  // no óculos de celular o aluno fica mais perto do painel (texto maior)
  head.position.set(0, 1.6, mode === 'stereo' ? 0.15 : 0.6);
  phone.recenter();
  if (mode === 'stereo') phone.showGuide(5000);
  started = true;
  state.fade = 1;
  refreshPanel(true);
  speakStation();
  setTimeout(() => { if (!phone.gyro && mode === 'stereo') showToast('Sem giroscópio aqui. Arraste o dedo para olhar em volta.'); }, 1800);
}
$('#btnVR').addEventListener('click', () => start('stereo'));
$('#btnFlat').addEventListener('click', () => start('flat'));
$('#bIpdM').addEventListener('click', () => { setIpdUI(phone.ipdMm - 1, true); showHud(); });
$('#bIpdP').addEventListener('click', () => { setIpdUI(phone.ipdMm + 1, true); showHud(); });
$('#bFull').addEventListener('click', () => {
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const de = document.documentElement, req = de.requestFullscreen || de.webkitRequestFullscreen;
      if (!req) throw 0;
      const p = req.call(de);
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => showToast('No iPhone: Compartilhar → Adicionar à Tela de Início.'));
    }
  } catch (e) { showToast('No iPhone: Compartilhar → Adicionar à Tela de Início.'); }
  showHud();
});
$('#bMusic').addEventListener('click', () => { onButton('music'); showHud(); });
$('#bSpeed').addEventListener('click', () => { onButton('speed'); $('#bSpeed').textContent = 'Velocidade ' + state.speed + 'x'; showHud(); });
$('#bCenter').addEventListener('click', () => { phone.recenter(); showHud(); });
$('#bSolar').addEventListener('click', () => { onButton('solar'); showHud(); });
$('#bLunar').addEventListener('click', () => { onButton('lunar'); showHud(); });
$('#bNext').addEventListener('click', () => { onButton('next'); showHud(); });
$('#bPause').addEventListener('click', () => { onButton('pause'); $('#bPause').textContent = state.playing ? 'Pausar' : 'Continuar'; showHud(); });
$('#bExit').addEventListener('click', () => {
  started = false;
  viewMode = 'intro';
  reticle.visible = false;
  if (window.speechSynthesis) speechSynthesis.cancel();
  try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {}
  intro.classList.remove('hidden');
  rotateEl.hidden = true;
  hud.classList.add('off');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started && state.playing) {
    state.playing = false;
    $('#bPause').textContent = 'Continuar';
    if (window.speechSynthesis) speechSynthesis.cancel();
    refreshPanel(true);
  }
});

renderer.xr.addEventListener('sessionstart', () => {
  intro.classList.add('hidden');
  hud.classList.add('off');
  viewMode = 'xr';
  reticle.visible = false;
  head.position.set(0, 0, 0);
  head.quaternion.identity();
  started = true;
  speakStation();
});
renderer.xr.addEventListener('sessionend', () => {
  head.position.copy(HEAD_POS);
  viewMode = 'flat';
  hud.classList.remove('off');
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// para testes automatizados
window.__eclipse = { cow, comet, launchComet, state, onButton, setMode, ctx, rig, camera, THREE, K, phone, start: (m) => start(m) };
