// Efeitos visuais e sonoros extras: raios de sol, estrelas cintilando, cometa,
// vaca astronauta (easter egg) e música de fundo.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Raios de sol: linhas paralelas que saem do lado do Sol e PARAM quando batem
// na Lua ou na Terra. Pulsos de luz andam por elas, do Sol para a Terra.
// ---------------------------------------------------------------------------
export class SunRays {
  constructor({ count = 80, radius = 34, startDist = 175, endDist = 190, fwd, up, side }) {
    this.count = count;
    this.startDist = startDist;
    this.endDist = endDist;
    this.fwd = fwd.clone();
    this.offsets = [];
    for (let i = 0; i < count; i++) {
      // distribuição uniforme num disco
      const r = radius * Math.sqrt((i + 0.5) / count);
      const a = i * 2.39996323; // ângulo de ouro
      this.offsets.push(side.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r));
    }
    const pos = new Float32Array(count * 2 * 3);
    const along = new Float32Array(count * 2);
    const seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { seed[i * 2] = seed[i * 2 + 1] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('along', new THREE.BufferAttribute(along, 1));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float along; attribute float seed;
        varying float vAlong; varying float vSeed;
        void main(){
          vAlong = along; vSeed = seed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float time; uniform float opacity;
        varying float vAlong; varying float vSeed;
        void main(){
          #include <logdepthbuf_fragment>
          float ph = fract((vAlong - time * 55.0) / 60.0 + vSeed);
          float pulse = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.06, 0.32, ph));
          float a = (0.03 + 0.5 * pulse) * opacity;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.35) * a, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.LineSegments(g, this.material);
    this.mesh.frustumCulled = false;
    this._o = new THREE.Vector3();
    this._d = fwd.clone().negate(); // do Sol para a Terra
  }

  // occluders: [{c: Vector3, r: number}]
  update(time, occluders) {
    this.material.uniforms.time.value = time;
    const pos = this.mesh.geometry.attributes.position.array;
    const al = this.mesh.geometry.attributes.along.array;
    const d = this._d;
    for (let i = 0; i < this.count; i++) {
      const o = this._o.copy(this.offsets[i]).addScaledVector(this.fwd, this.startDist);
      let tEnd = this.startDist + this.endDist;
      for (const oc of occluders) {
        const ox = o.x - oc.c.x, oy = o.y - oc.c.y, oz = o.z - oc.c.z;
        const b = ox * d.x + oy * d.y + oz * d.z;
        const cc = ox * ox + oy * oy + oz * oz - oc.r * oc.r;
        const disc = b * b - cc;
        if (disc >= 0) {
          const t = -b - Math.sqrt(disc);
          if (t > 0 && t < tEnd) tEnd = t;
        }
      }
      const k = i * 6;
      pos[k] = o.x; pos[k + 1] = o.y; pos[k + 2] = o.z;
      pos[k + 3] = o.x + d.x * tEnd; pos[k + 4] = o.y + d.y * tEnd; pos[k + 5] = o.z + d.z * tEnd;
      al[i * 2] = 0; al[i * 2 + 1] = tEnd;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.along.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Estrelas mais suaves, cintilando
// ---------------------------------------------------------------------------
export function makeStars(count = 6000, radius = 9000) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(radius);
    pos.set([v.x, v.y, v.z], i * 3);
    const b = 0.18 + Math.pow(Math.random(), 4) * 0.5; // bem mais fracas que antes
    c.setHSL(0.58 + (Math.random() - 0.5) * 0.25, 0.3 * Math.random(), b);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1.0 + Math.pow(Math.random(), 3) * 1.6;
    phase[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 }, dim: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 color; attribute float size; attribute float phase;
      uniform float time; uniform float pixelRatio;
      varying vec3 vColor; varying float vTw;
      void main(){
        vColor = color;
        float tw = 0.65 + 0.35 * sin(time * (1.3 + fract(phase) * 2.5) + phase)
                         * (0.6 + 0.4 * sin(time * 0.37 + phase * 3.1));
        vTw = tw;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio * (0.8 + 0.3 * tw);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float dim;
      varying vec3 vColor; varying float vTw;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord - 0.5;
        float a = 1.0 - smoothstep(0.2, 0.5, length(p));
        if (a <= 0.0) discard;
        gl_FragColor = vec4(vColor * vTw * dim, a);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------------------
// Cometa: passa pelo céu de tempos em tempos, com a cauda apontando para longe do Sol
// ---------------------------------------------------------------------------
function glowTexture(inner, outer) {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.2, outer);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Comet {
  constructor(sunPos) {
    this.sun = sunPos.clone();
    this.group = new THREE.Group();
    this.head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(150,220,255,0.5)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.head.scale.setScalar(170);
    const tailMat = (color, op) => new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, op: { value: op } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}',
      fragmentShader: '#include <common>\n#include <logdepthbuf_pars_fragment>\nuniform vec3 color; uniform float op; varying vec2 vUv; void main(){\n#include <logdepthbuf_fragment>\nfloat a = pow(vUv.y, 2.2) * op; gl_FragColor = vec4(color * a, 1.0);\n#include <colorspace_fragment>\n}',
    });
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(14, 150, 1800, 24, 1, true), tailMat(0x9fd8ff, 0.55));
    this.tail2 = new THREE.Mesh(new THREE.CylinderGeometry(9, 90, 1200, 16, 1, true), tailMat(0xfff0c0, 0.35));
    this.group.add(this.head, this.tail, this.tail2);
    this.group.visible = false;
    this.t = -1;
    this.dur = 26;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
  }

  // lança o cometa cruzando a frente de quem olha (posição/direção em unidades base)
  launch(camPos, camDir, camRight, camUp) {
    const D = 3200;
    const center = camPos.clone().addScaledVector(camDir, D).addScaledVector(camUp, D * 0.42);
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.from.copy(center).addScaledVector(camRight, -dir * D * 0.75).addScaledVector(camUp, D * 0.12);
    this.to.copy(center).addScaledVector(camRight, dir * D * 0.75).addScaledVector(camUp, -D * 0.12);
    this.viewDir = camDir.clone();
    this.t = 0;
    this.group.visible = true;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.t = -1; this.group.visible = false; return; }
    const p = this.from.clone().lerp(this.to, k);
    this.head.position.copy(p);
    // cauda aponta para longe do Sol (achatada para ficar sempre visível de quem olha)
    const tailDir = p.clone().sub(this.sun).normalize();
    tailDir.addScaledVector(this.viewDir, -0.85 * tailDir.dot(this.viewDir)).normalize();
    for (const [m, len] of [[this.tail, 1800], [this.tail2, 1200]]) {
      m.position.copy(p).addScaledVector(tailDir, len / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tailDir.clone().negate());
    }
    const fade = Math.min(1, k * 6, (1 - k) * 6);
    this.head.material.opacity = fade;
    this.tail.material.uniforms.op.value = 0.55 * fade;
    this.tail2.material.uniforms.op.value = 0.35 * fade;
  }
}

// ---------------------------------------------------------------------------
// Easter egg: vaca astronauta com capacete, passando pela janela do satélite
// ---------------------------------------------------------------------------
function spotsTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1b1b1b';
  const spots = [[40, 40, 26, 18], [120, 80, 30, 22], [200, 34, 24, 20], [180, 100, 18, 14], [70, 100, 16, 12], [240, 80, 20, 16], [10, 90, 14, 12]];
  for (const [x, y, rx, ry] of spots) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function bubbleTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(256, 110, 240, 100, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath(); g.moveTo(170, 190); g.lineTo(130, 250); g.lineTo(230, 200); g.fill();
  g.fillStyle = '#1b1630';
  g.font = 'bold 110px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 115);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SpaceCow {
  constructor() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ map: spotsTexture(), roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xf2a7b5, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const horn = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 });
    const suit = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, roughness: 0.5, metalness: 0.2 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 8, 16), skin);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    // pernas
    for (const [x, z] of [[-0.42, 0.22], [-0.42, -0.22], [0.42, 0.22], [0.42, -0.22]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.55, 10), white);
      leg.position.set(x, -0.48, z);
      g.add(leg);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.08, 10), dark);
      hoof.position.set(x, -0.78, z);
      g.add(hoof);
    }
    const udder = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), pink);
    udder.position.set(0.25, -0.38, 0);
    g.add(udder);
    // rabo
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.5, 6), white);
    tail.position.set(-0.95, -0.05, 0);
    tail.rotation.z = 0.5;
    g.add(tail);
    // cabeça
    const headG = new THREE.Group();
    headG.position.set(0.95, 0.3, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.36), white);
    headG.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.34), pink);
    snout.position.set(0.25, -0.1, 0);
    headG.add(snout);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), dark);
      eye.position.set(0.2, 0.08, s * 0.13);
      headG.add(eye);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark);
      nostril.position.set(0.355, -0.08, s * 0.07);
      headG.add(nostril);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.2), white);
      ear.position.set(-0.05, 0.12, s * 0.27);
      ear.rotation.x = s * 0.4;
      headG.add(ear);
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 8), horn);
      h.position.set(-0.05, 0.27, s * 0.13);
      h.rotation.z = -0.3;
      headG.add(h);
    }
    // capacete de astronauta
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), new THREE.MeshPhysicalMaterial({
      color: 0xbfe4ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1, depthWrite: false,
    }));
    helmet.position.set(0.06, 0, 0);
    headG.add(helmet);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.06, 10, 24), suit);
    collar.rotation.y = Math.PI / 2;
    collar.position.set(-0.24, -0.05, 0);
    headG.add(collar);
    g.add(headG);
    // mochila de oxigênio
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.5), suit);
    pack.position.set(0, 0.48, 0);
    g.add(pack);
    for (const s of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12), new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.4 }));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 0.68, s * 0.14);
      g.add(tank);
    }
    // balão "MUUU!"
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('MUUU!'), transparent: true, depthWrite: false }));
    this.bubble.scale.set(1.4, 0.7, 1);
    this.bubble.position.set(1.3, 1.3, 0);
    this.bubble.visible = false;
    g.add(this.bubble);

    g.scale.setScalar(1.1);
    g.visible = false;
    this.group = g;
    this.t = -1;
    this.dur = 16;
    this.mooed = false;
  }

  start() { this.t = 0; this.mooed = false; this.group.visible = true; }

  // retorna true no instante em que deve fazer "muuu"
  update(dt) {
    if (this.t < 0) return false;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.t = -1; this.group.visible = false; this.bubble.visible = false; return false; }
    // atravessa a janela da esquerda para a direita, à frente do aluno (coordenadas da cabine)
    const g = this.group;
    g.position.set(THREE.MathUtils.lerp(-11, 11, k), 2.4 + Math.sin(k * Math.PI) * 0.6, -4.2 - Math.sin(k * Math.PI) * 0.8);
    g.rotation.set(Math.sin(this.t * 0.7) * 0.2, -0.7 + Math.sin(this.t * 0.3) * 0.25, Math.sin(this.t * 0.5) * 0.25);
    this.bubble.visible = k > 0.38 && k < 0.7;
    if (!this.mooed && k > 0.4) { this.mooed = true; return true; }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Áudio: música ambiente original (órgão suave) e o "muuu" da vaca
// Se existir o arquivo assets/musica.mp3, ele toca no lugar da música gerada.
// ---------------------------------------------------------------------------
export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicOn = true;
    this.fileAudio = null;
    this._timer = null;
    this._step = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    // reverb simples (eco)
    const delay = this.ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.38;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.35;
    this.musicGain.connect(this.master);
    this.musicGain.connect(delay);
    delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(this.master);

    // tenta usar um arquivo de música da escola
    fetch('assets/musica.mp3', { method: 'HEAD' }).then((r) => {
      if (!r.ok) throw 0;
      this.fileAudio = new Audio('assets/musica.mp3');
      this.fileAudio.loop = true;
      this.fileAudio.volume = 0.45;
      if (this.musicOn) this.fileAudio.play().catch(() => {});
    }).catch(() => {}).finally(() => {
      if (!this.fileAudio) this._startGenerated();
    });
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (this.fileAudio) { on ? this.fileAudio.play().catch(() => {}) : this.fileAudio.pause(); return; }
    this.musicGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.8);
  }

  // abaixa a música enquanto a narração fala
  duck(speaking) {
    if (!this.ctx || !this.musicOn) return;
    if (this.fileAudio) { this.fileAudio.volume = speaking ? 0.18 : 0.45; return; }
    this.musicGain.gain.setTargetAtTime(speaking ? 0.09 : 0.22, this.ctx.currentTime, 0.6);
  }

  _organ(freq, start, dur, vol) {
    const c = this.ctx;
    const env = c.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(vol, start + 1.6);
    env.gain.setValueAtTime(vol, start + dur - 1.8);
    env.gain.linearRampToValueAtTime(0, start + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    env.connect(lp);
    lp.connect(this.musicGain);
    // registros de órgão: fundamental, oitava, 12ª, 15ª
    for (const [mul, a] of [[1, 1], [2, 0.5], [3, 0.18], [4, 0.12], [0.5, 0.35]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      o.detune.value = (Math.random() - 0.5) * 6;
      const g = c.createGain();
      g.gain.value = a;
      o.connect(g); g.connect(env);
      o.start(start);
      o.stop(start + dur + 0.1);
    }
  }

  _startGenerated() {
    if (this._timer) return;
    // progressão original, lenta e contemplativa (Lá menor)
    const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const chords = [
      [45, 57, 60, 64, 71], // Am(add9)
      [41, 57, 60, 65, 69], // Fmaj7
      [48, 55, 60, 64, 67], // C
      [43, 55, 59, 62, 67], // G
      [45, 57, 60, 64, 69], // Am
      [38, 57, 62, 65, 69], // Dm
      [41, 53, 60, 65, 69], // F
      [40, 52, 59, 64, 68], // E
    ];
    const arp = [0, 2, 3, 4, 3, 2];
    const chordDur = 8;
    const schedule = () => {
      const c = this.ctx;
      const t0 = c.currentTime + 0.1;
      const ch = chords[this._step % chords.length];
      ch.forEach((m, i) => this._organ(N(m), t0, chordDur + 0.6, i === 0 ? 0.05 : 0.028));
      // arpejo suave por cima
      for (let i = 0; i < 6; i++) {
        const m = ch[arp[i]] + 12;
        const st = t0 + 1 + i * 1.15;
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = N(m);
        const g = c.createGain();
        g.gain.setValueAtTime(0, st);
        g.gain.linearRampToValueAtTime(0.03, st + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0008, st + 2.2);
        o.connect(g); g.connect(this.musicGain);
        o.start(st); o.stop(st + 2.3);
      }
      this._step++;
    };
    schedule();
    this._timer = setInterval(schedule, chordDur * 1000);
    this.setMusic(this.musicOn);
  }

  moo() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + 0.05;
    const dur = 1.7;
    const src = c.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(115, t);
    src.frequency.linearRampToValueAtTime(150, t + 0.35);
    src.frequency.linearRampToValueAtTime(128, t + 1.0);
    src.frequency.linearRampToValueAtTime(92, t + dur);
    const vib = c.createOscillator();
    vib.frequency.value = 5.5;
    const vibG = c.createGain();
    vibG.gain.value = 3;
    vib.connect(vibG); vibG.connect(src.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.15);
    env.gain.setValueAtTime(0.5, t + dur - 0.5);
    env.gain.linearRampToValueAtTime(0, t + dur);
    // formantes do "uuu"
    const out = c.createGain();
    out.gain.value = 0.9;
    for (const [f, q, gain] of [[320, 6, 1.0], [800, 8, 0.35], [2400, 10, 0.08]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 0.8, t);
      bp.frequency.linearRampToValueAtTime(f, t + 0.4);
      bp.Q.value = q;
      const g = c.createGain();
      g.gain.value = gain;
      env.connect(bp); bp.connect(g); g.connect(out);
    }
    src.connect(env);
    out.connect(this.master);
    src.start(t); vib.start(t);
    src.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
}
