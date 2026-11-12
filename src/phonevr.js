// Modo "celular no óculos" (Opus VR / Shinecon): tela dividida com correção das lentes,
// distância entre as lentes ajustável e giroscópio para olhar em volta.
// Mesmos parâmetros de tela e de separação do app "Viagem à Lua".
import * as THREE from 'three';

const D = Math.PI / 180;
const MM_PER_PX = 0.175; // tamanho aproximado de um pixel CSS na tela do celular (mm)
const IPD_MIN = 50, IPD_MAX = 72, IPD_DEFAULT = 62;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class PhoneVR {
  constructor(renderer, head) {
    this.renderer = renderer;
    this.head = head;
    this.camL = new THREE.PerspectiveCamera(100, 1, 0.05, 400000);
    this.camR = this.camL.clone();
    this.camL.position.x = -0.032;
    this.camR.position.x = 0.032;
    head.add(this.camL, this.camR);
    this.lensOn = true;
    this.guideUntil = 0;
    this.rt = null;

    let v = IPD_DEFAULT;
    try { const s = +localStorage.getItem('eclipse-ipd'); if (s >= IPD_MIN && s <= IPD_MAX) v = s; } catch (e) {}
    this.ipdMm = v;

    // pós-processamento: cada metade da tela recebe a imagem de um olho, centrada na lente,
    // com distorção em barril para compensar a lente do óculos
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        k: { value: new THREE.Vector2(0.24, 0.1) },
        aspect: { value: 1 },
        sa: { value: 2 },
        sep: { value: 0.21 },
        zoom: { value: 0.8 },
        guide: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 k; uniform float aspect; uniform float sa;
        uniform float sep; uniform float zoom; uniform float guide; varying vec2 vUv;
        void main(){
          float side = step(.5, vUv.x);
          float cx = mix(.5 - sep, .5 + sep, side);
          vec2 c = vec2((vUv.x - cx) * sa, vUv.y - .5);
          float r2 = dot(c, c) * 4.;
          float f = 1. + k.x * r2 + k.y * r2 * r2;
          vec2 cd = c * f * zoom;
          vec2 s = vec2(.5 + cd.x / aspect, .5 + cd.y);
          if (s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1.) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
          vec4 col = texture2D(tDiffuse, vec2((s.x + side) * .5, s.y));
          if (guide > 0.) {
            float d = length(c);
            float cr = max(step(abs(c.x), .003) * step(abs(c.y), .06), step(abs(c.y), .003) * step(abs(c.x), .06));
            cr = max(cr, step(abs(d - .09), .004));
            col.rgb = mix(col.rgb, vec3(1., .85, .2), cr * guide);
          }
          float vg = 1. - smoothstep(.55, 1.15, r2);
          col.rgb *= mix(.72, 1., vg);
          gl_FragColor = vec4(col.rgb, 1.);
          #include <colorspace_fragment>
        }`,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));

    // giroscópio
    this.ori = null;
    this.gyro = false;
    this.needCalib = true;
    this.dragYaw = 0;
    this.dragPitch = 0;
    this._qOff = new THREE.Quaternion();
    this._qDev = new THREE.Quaternion();
    this._qT = new THREE.Quaternion();
    this._qS = new THREE.Quaternion();
    this._qFix = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    this._eul = new THREE.Euler();
    this._v = new THREE.Vector3();
    window.addEventListener('deviceorientation', (e) => {
      if (e.alpha == null && e.beta == null) return;
      this.ori = e;
      this.gyro = true;
    });
  }

  setIpd(v) {
    this.ipdMm = clamp(Math.round(v), IPD_MIN, IPD_MAX);
    try { localStorage.setItem('eclipse-ipd', this.ipdMm); } catch (e) {}
    return this.ipdMm;
  }

  showGuide(ms = 4000) { this.guideUntil = performance.now() + ms; }

  recenter() { this.needCalib = true; this.dragYaw = 0; this.dragPitch = 0; }

  drag(dx, dy) {
    if (this.gyro) return;
    this.dragYaw += dx * 0.005;
    this.dragPitch = clamp(this.dragPitch + dy * 0.005, -1.4, 1.4);
  }

  updateHead() {
    const head = this.head;
    if (this.gyro && this.ori) {
      const o = this.ori;
      const ang = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D;
      this._eul.set((o.beta || 0) * D, (o.alpha || 0) * D, -(o.gamma || 0) * D, 'YXZ');
      this._qDev.setFromEuler(this._eul);
      this._qDev.multiply(this._qFix);
      this._qDev.multiply(this._qS.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang));
      if (this.needCalib) {
        this._v.set(0, 0, -1).applyQuaternion(this._qDev);
        this._qOff.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(-this._v.x, -this._v.z));
        this.needCalib = false;
      }
      this._qT.copy(this._qOff).multiply(this._qDev);
      head.quaternion.slerp(this._qT, 0.55);
    } else {
      this._eul.set(this.dragPitch, this.dragYaw, 0, 'YXZ');
      head.quaternion.setFromEuler(this._eul);
    }
  }

  _ensureRT(W, H) {
    if (this.rt && this.rt.width === W && this.rt.height === H) return;
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType, samples: 4,
    });
    this.postMat.uniforms.tDiffuse.value = this.rt.texture;
  }

  render(scene) {
    const r = this.renderer;
    const w = window.innerWidth, h = window.innerHeight;
    const ss = Math.min(1.25, 3600 / (w * r.getPixelRatio()));
    const pr = r.getPixelRatio() * ss;
    const W = Math.round(w * pr), H = Math.round(h * pr);
    this._ensureRT(W, H);
    const rt = this.rt;
    rt.scissorTest = true;
    for (const [cam, x] of [[this.camL, 0], [this.camR, W / 2]]) {
      cam.fov = 100;
      cam.aspect = (w / 2) / h;
      cam.updateProjectionMatrix();
      rt.viewport.set(x, 0, W / 2, H);
      rt.scissor.set(x, 0, W / 2, H);
      r.setRenderTarget(null);
      r.setRenderTarget(rt);
      r.render(scene, cam);
    }
    r.setRenderTarget(null);
    const u = this.postMat.uniforms;
    u.aspect.value = (w / 2) / h;
    u.sa.value = w / h;
    u.sep.value = clamp(((this.ipdMm / 2) / MM_PER_PX) / w, 0.1, 0.25);
    u.k.value.set(this.lensOn ? 0.24 : 0, this.lensOn ? 0.1 : 0);
    u.guide.value = performance.now() < this.guideUntil ? 1 : 0;
    r.setViewport(0, 0, w, h);
    r.render(this.postScene, this.postCam);
  }
}
