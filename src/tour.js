// Roteiro das duas experiências.
// Unidades "base": raio da Terra = 20. (As distâncias foram comprimidas para caber
// na visão — veja o texto da última parada e o README.)
// Cada parada define onde o satélite fica (pos) e para onde ele aponta (look).
// ctx: { fwd, side, up, moon, sun, earth, axis, shadowPoint, k (0..1 dentro da parada) }

import * as THREE from 'three';

const v = () => new THREE.Vector3();
const comb = (...terms) => {
  const out = v();
  for (let i = 0; i < terms.length; i += 2) out.addScaledVector(terms[i], terms[i + 1]);
  return out;
};

// Parada de abertura (igual nos dois): a Lua dá voltas rápidas em volta da Terra
const orbitIntro = (extra) => ({
  name: 'A Lua gira em volta da Terra',
  start: 0.02, end: 0.14,
  text: 'Aceleramos o tempo! A Terra gira em torno do próprio eixo (1 volta = 1 dia) e a Lua gira em volta da Terra (1 volta = cerca de 1 mês). As linhas amarelas são os raios de luz do Sol: eles chegam todos paralelos. ' + extra,
  pos: (c) => comb(c.up, 70, c.side, 88, c.fwd, -5),
  look: (c) => c.earth.clone(),
});
const compareStation = (start, end, text) => ({
  name: 'Onde fica a Lua em cada eclipse?',
  start, end,
  compare: true,
  text,
  pos: (c) => comb(c.side, 135, c.up, 72),
  look: (c) => c.earth.clone(),
});

export const TOURS = {
  solar: {
    title: 'ECLIPSE SOLAR',
    duration: 200, // segundos em velocidade 1x
    moonSwing: 0.30, // quanto a Lua anda na órbita (rad) a cada meio passeio
    tMax: 0.57, // momento do alinhamento perfeito
    moonLift: -6, // deslocamento vertical da Lua (define onde a sombra cai)
    overlay: 1,
    stations: [
      orbitIntro('Agora a Lua vai parar ENTRE o Sol e a Terra: é a fase de Lua Nova.'),
      {
        name: 'Os raios do Sol',
        start: 0.18, end: 0.30,
        text: 'Veja os raios de luz saindo do Sol. Os que batem na Lua param nela — atrás da Lua forma-se uma sombra em forma de cone. Os outros seguem e iluminam a Terra. Quando esse cone de sombra encosta na Terra, acontece o eclipse solar.',
        pos: (c) => comb(c.fwd, 70, c.side, 75, c.up, 12),
        look: (c) => comb(c.fwd, 65),
      },
      {
        name: 'A sombra da Lua na Terra',
        start: 0.34, end: 0.48,
        text: 'Olhe para a Terra: aquela mancha é a sombra da Lua, andando enquanto a Terra gira. Na parte amarela (penumbra) as pessoas veem um eclipse PARCIAL — o Sol fica "mordido". Só no pontinho escuro do meio (umbra, contorno vermelho) o eclipse é TOTAL. O resto do planeta não vê eclipse nenhum!',
        pos: (c) => comb(c.fwd, 47, c.side, -10, c.up, 6),
        look: (c) => c.shadowPoint.clone(),
      },
      {
        name: 'Dentro da umbra',
        start: 0.52, end: 0.62,
        text: 'Agora o satélite entrou na sombra da Lua. Olhe para o Sol: a Lua cobre o disco solar inteiro e aparece a COROA, a atmosfera do Sol, que normalmente o brilho não deixa ver. Lá embaixo, na Terra, quem está nesta faixa vê exatamente isso: o dia vira noite por alguns minutos.',
        pos: (c) => comb(c.moon, 1, c.axis, 90),
        look: (c) => c.sun.clone(),
      },
      {
        name: 'Dando a volta na Terra',
        start: 0.66, end: 0.80,
        text: 'Vamos dar a volta no planeta. Repare: a sombra ocupa só uma pequena região do lado de DIA. Quem está do lado da NOITE não vê o eclipse solar, porque lá o Sol nem está no céu. Por isso um eclipse total é tão raro em um mesmo lugar.',
        pos: (c) => {
          const a = THREE.MathUtils.lerp(0.35, 3.2, c.k);
          return c.fwd.clone().applyAxisAngle(c.up, a).multiplyScalar(50).addScaledVector(c.up, 14);
        },
        look: (c) => c.earth.clone(),
      },
      compareStation(0.84, 0.97, 'No ECLIPSE SOLAR a Lua fica entre o Sol e a Terra (Lua Nova). No ECLIPSE LUNAR ela fica do outro lado, atrás da Terra (Lua Cheia) — a Lua transparente mostra esse lugar. Não acontece todo mês porque a órbita da Lua é inclinada uns 5 graus. (As distâncias aqui foram encurtadas: a Lua real fica a 30 Terras de distância!)'),
    ],
  },

  lunar: {
    title: 'ECLIPSE LUNAR',
    duration: 200,
    moonSwing: 0.26,
    tMax: 0.48,
    moonLift: 3,
    overlay: 2,
    stations: [
      orbitIntro('Agora a Lua vai parar do lado de TRÁS da Terra, longe do Sol: é a fase de Lua Cheia.'),
      {
        name: 'Os raios do Sol',
        start: 0.18, end: 0.28,
        text: 'Agora é a TERRA que fica entre o Sol e a Lua. Os raios de luz que batem na Terra param nela, e atrás dela forma-se um cone de sombra enorme. A Lua vai atravessar essa sombra: isso é o eclipse lunar.',
        pos: (c) => comb(c.fwd, -55, c.side, 80, c.up, 12),
        look: (c) => comb(c.fwd, -65),
      },
      {
        name: 'A Lua entra na sombra',
        start: 0.31, end: 0.40,
        text: 'Chegamos perto da Lua. Primeiro ela entra na penumbra e escurece só um pouquinho. Depois a umbra começa a "comer" a Lua. Repare que a borda da sombra é CURVA: a sombra da Terra é redonda porque a Terra é redonda! Os gregos antigos usaram isso como prova.',
        pos: (c) => comb(c.moon, 1, c.fwd, 15, c.side, 8, c.up, 5),
        look: (c) => c.moon.clone(),
      },
      {
        name: 'Lua de sangue',
        start: 0.42, end: 0.52,
        text: 'Eclipse TOTAL! A Lua não desaparece: ela fica avermelhada. A atmosfera da Terra desvia um pouco da luz do Sol para dentro da sombra, e só a luz vermelha chega até a Lua. É como se todos os nasceres e pores do sol da Terra iluminassem a Lua ao mesmo tempo.',
        pos: (c) => comb(c.moon, 1, c.fwd, 13, c.side, -7, c.up, 3),
        look: (c) => c.moon.clone(),
      },
      {
        name: 'A Terra vista da Lua',
        start: 0.54, end: 0.64,
        noOverlay: true,
        text: 'Estamos quase na superfície da Lua, olhando para a Terra. Daqui, é a Terra que está tapando o Sol! Veja o anel avermelhado ao redor do planeta: é a atmosfera da Terra iluminada por trás. É essa luz vermelha que pinta a Lua.',
        pos: (c) => {
          const toEarth = c.earth.clone().sub(c.moon).normalize();
          return comb(c.moon, 1, toEarth, 5.45 + 2.0, c.up, 0.6);
        },
        look: (c) => c.earth.clone(),
      },
      {
        name: 'Quem consegue ver?',
        start: 0.68, end: 0.80,
        text: 'A área em verde mostra quem consegue ver o eclipse lunar: toda a metade da Terra que está de NOITE, com a Lua no céu. Por isso o eclipse lunar é visto por muito mais gente que o eclipse solar, que aparece só numa faixa estreita do lado do dia.',
        pos: (c) => comb(c.fwd, -48, c.side, 22, c.up, 16),
        look: (c) => c.earth.clone(),
      },
      compareStation(0.84, 0.97, 'No ECLIPSE LUNAR a Lua fica atrás da Terra, do lado oposto ao Sol (Lua Cheia). No ECLIPSE SOLAR ela fica entre o Sol e a Terra (Lua Nova) — a Lua transparente mostra esse lugar. Resumindo: eclipse solar = a Lua faz sombra na Terra; eclipse lunar = a Terra faz sombra na Lua.'),
    ],
  },
};

// Interpolação "em volta da Terra": interpola direção e distância separadamente,
// assim o satélite contorna o planeta em vez de atravessá-lo.
export function orbitLerp(a, b, t) {
  const ra = a.length(), rb = b.length();
  if (ra < 1e-6 || rb < 1e-6) return a.clone().lerp(b, t);
  const da = a.clone().divideScalar(ra), db = b.clone().divideScalar(rb);
  const ang = da.angleTo(db);
  let dir;
  if (ang < 1e-4) dir = da.clone();
  else if (Math.PI - ang < 1e-3) {
    // direções opostas: passa por cima
    const axis = new THREE.Vector3(0, 1, 0).cross(da).normalize();
    dir = da.clone().applyAxisAngle(axis.lengthSq() ? axis : new THREE.Vector3(1, 0, 0), ang * t);
  } else {
    const axis = da.clone().cross(db).normalize();
    dir = da.clone().applyAxisAngle(axis, ang * t);
  }
  const r = THREE.MathUtils.lerp(ra, rb, t);
  return dir.multiplyScalar(r);
}
