// Painel de controle do satélite: desenhado num <canvas> e usado como textura,
// para funcionar igual no VR (raio do controle) e no computador (mouse).
import * as THREE from 'three';

const W = 1280, H = 860;

export class Panel {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1.1, 1.1 * H / W);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'panel';
    this.buttons = [];
    this.hover = null;
    this.state = null;
  }

  // botões: { id, label, row, col }
  layoutButtons(defs) {
    const top = 600, rowH = 108, gap = 14, left = 30, right = W - 30;
    const cols = 5;
    const bw = (right - left - gap * (cols - 1)) / cols;
    this.buttons = defs.map((d) => ({
      ...d,
      x: left + d.col * (bw + gap),
      y: top + d.row * (rowH + gap * 0.6),
      w: bw,
      h: rowH - 14,
    }));
  }

  hitTest(uv) {
    const x = uv.x * W, y = (1 - uv.y) * H;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }

  setHover(btn) {
    const id = btn ? btn.id : null;
    if (id !== this.hover) {
      this.hover = id;
      this.draw();
    }
  }

  update(state) {
    this.state = state;
    this.draw();
  }

  draw() {
    const s = this.state;
    if (!s) return;
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    // fundo
    roundRect(c, 4, 4, W - 8, H - 8, 28);
    c.fillStyle = 'rgba(6, 14, 32, 0.92)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = s.mode === 'solar' ? '#ffcf5a' : '#ff7a59';
    c.stroke();

    // cabeçalho
    c.fillStyle = s.mode === 'solar' ? '#ffcf5a' : '#ff8a6a';
    c.font = 'bold 40px system-ui, sans-serif';
    c.textBaseline = 'top';
    c.fillText(s.title, 36, 26);
    c.fillStyle = '#9fb3dd';
    c.font = '28px system-ui, sans-serif';
    const sub = s.stationIndex >= 0
      ? `Parada ${s.stationIndex + 1} de ${s.stationCount}: ${s.stationName}`
      : `Viajando para: ${s.stationName}`;
    c.fillText(sub, 36, 76);

    // texto explicativo
    c.fillStyle = '#eef3ff';
    c.font = '29px system-ui, sans-serif';
    wrapText(c, s.text, 36, 124, W - 72, 39, 8);

    // status
    const y0 = 450;
    c.font = 'bold 27px system-ui, sans-serif';
    c.fillStyle = '#7fe0c0';
    c.fillText('Fase: ' + s.phase, 36, y0);
    c.fillStyle = '#ffd98a';
    c.fillText(`Sensor do satélite — Sol visível daqui: ${Math.round(s.sunVis * 100)}%`, 36, y0 + 38);

    // barra de progresso com as paradas
    const bx = 36, by = y0 + 92, bw = W - 72, bh = 16;
    roundRect(c, bx, by, bw, bh, 8);
    c.fillStyle = '#1d2a4a';
    c.fill();
    roundRect(c, bx, by, Math.max(16, bw * s.progress), bh, 8);
    c.fillStyle = s.mode === 'solar' ? '#ffcf5a' : '#ff7a59';
    c.fill();
    s.stations.forEach((st, i) => {
      const x = bx + bw * ((st.start + st.end) / 2);
      c.beginPath();
      c.arc(x, by + bh / 2, 12, 0, Math.PI * 2);
      c.fillStyle = i === s.stationIndex ? '#ffffff' : '#3b4f80';
      c.fill();
      c.fillStyle = i === s.stationIndex ? '#000' : '#cfd9f5';
      c.font = 'bold 16px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), x, by + bh / 2 + 1);
      c.textAlign = 'left';
      c.textBaseline = 'top';
    });

    // botões
    for (const b of this.buttons) {
      const active = s.active && s.active[b.id];
      const hov = this.hover === b.id;
      roundRect(c, b.x, b.y, b.w, b.h, 16);
      c.fillStyle = active ? (s.mode === 'solar' ? '#ffcf5a' : '#ff7a59') : hov ? '#34508f' : '#1b2b52';
      c.fill();
      c.lineWidth = hov ? 4 : 2;
      c.strokeStyle = hov ? '#ffffff' : '#41598f';
      c.stroke();
      c.fillStyle = active ? '#1a1300' : '#e8eefc';
      c.font = 'bold 26px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const label = typeof b.label === 'function' ? b.label(s) : b.label;
      const lines = label.split('\n');
      lines.forEach((ln, i) => c.fillText(ln, b.x + b.w / 2, b.y + b.h / 2 + (i - (lines.length - 1) / 2) * 30));
      c.textAlign = 'left';
      c.textBaseline = 'top';
    }
    this.texture.needsUpdate = true;
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrapText(c, text, x, y, maxW, lineH, maxLines) {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, y + n * lineH);
      line = w;
      n++;
      if (n >= maxLines) return;
    } else line = test;
  }
  if (line) c.fillText(line, x, y + n * lineH);
}
