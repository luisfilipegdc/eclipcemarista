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

export const TOURS = {
  solar: {
    title: 'ECLIPSE SOLAR',
    duration: 170, // segundos em velocidade 1x
    moonSwing: 0.30, // quanto a Lua anda na órbita (radianos) durante o passeio
    moonLift: -6, // deslocamento vertical da Lua (define onde a sombra cai)
    overlay: 1,
    stations: [
      {
        name: 'Visão geral',
        start: 0.02, end: 0.14,
        text: 'Estamos a bordo de um satélite em órbita. À frente está a Terra e, lá longe, o Sol. A Lua está andando na sua órbita e vai passar exatamente ENTRE o Sol e a Terra. Quando isso acontece, a sombra da Lua cai sobre a Terra: é o eclipse solar.',
        pos: (c) => comb(c.fwd, -40, c.side, 120, c.up, 40),
        look: (c) => comb(c.fwd, 80),
      },
      {
        name: 'A sombra da Lua na Terra',
        start: 0.19, end: 0.38,
        text: 'Olhe para a Terra: aquela mancha é a sombra da Lua. Na parte mais clara (penumbra, em amarelo) as pessoas veem um eclipse PARCIAL — o Sol fica "mordido". Só no pontinho escuro do meio (umbra, contorno vermelho) o eclipse é TOTAL. O resto do planeta não vê eclipse nenhum!',
        pos: (c) => comb(c.fwd, 58, c.side, -16, c.up, 8),
        look: (c) => c.shadowPoint.clone(),
      },
      {
        name: 'Dentro da umbra',
        start: 0.42, end: 0.56,
        text: 'Agora o satélite entrou na sombra da Lua. Olhe para o Sol: a Lua cobre o disco solar inteiro e aparece a COROA, a atmosfera do Sol, que normalmente o brilho não deixa ver. Lá embaixo, na Terra, quem está nesta faixa vê exatamente isso: o dia vira noite por alguns minutos.',
        pos: (c) => comb(c.moon, 1, c.axis, 90),
        look: (c) => c.sun.clone(),
      },
      {
        name: 'Dando a volta na Terra',
        start: 0.61, end: 0.80,
        text: 'Vamos dar a volta no planeta. Repare: a sombra ocupa só uma pequena região do lado de DIA. Quem está do lado da NOITE não vê o eclipse solar, porque lá o Sol nem está no céu. Por isso um eclipse total é tão raro em um mesmo lugar.',
        pos: (c) => {
          const a = THREE.MathUtils.lerp(0.35, 3.2, c.k);
          return c.fwd.clone().applyAxisAngle(c.up, a).multiplyScalar(62).addScaledVector(c.up, 18);
        },
        look: (c) => c.earth.clone(),
      },
      {
        name: 'Por que não acontece todo mês?',
        start: 0.85, end: 0.97,
        text: 'A Lua dá uma volta na Terra por mês, mas sua órbita é inclinada uns 5 graus. Na maioria dos meses a sombra passa acima ou abaixo da Terra. O eclipse só acontece quando Sol, Lua e Terra ficam bem alinhados. (Aqui as distâncias foram encurtadas: a Lua real fica a 30 Terras de distância!)',
        pos: (c) => comb(c.fwd, 20, c.side, 170, c.up, 120),
        look: (c) => comb(c.fwd, 45),
      },
    ],
  },

  lunar: {
    title: 'ECLIPSE LUNAR',
    duration: 170,
    moonSwing: 0.26,
    moonLift: 3,
    overlay: 2,
    stations: [
      {
        name: 'Visão geral',
        start: 0.02, end: 0.12,
        text: 'Agora a ordem é outra: é a TERRA que fica entre o Sol e a Lua. O Sol está atrás de nós. A Terra projeta uma sombra enorme no espaço e a Lua vai atravessá-la. Isso é o eclipse lunar — e ele só acontece na Lua Cheia.',
        pos: (c) => comb(c.fwd, 40, c.side, 120, c.up, 40),
        look: (c) => comb(c.fwd, -70),
      },
      {
        name: 'A Lua entra na sombra',
        start: 0.17, end: 0.33,
        text: 'Chegamos perto da Lua. Primeiro ela entra na penumbra e escurece só um pouquinho. Depois a umbra começa a "comer" a Lua. Repare que a borda da sombra é CURVA: a sombra da Terra é redonda porque a Terra é redonda! Os gregos antigos usaram isso como prova.',
        pos: (c) => comb(c.moon, 1, c.fwd, 15, c.side, 8, c.up, 5),
        look: (c) => c.moon.clone(),
      },
      {
        name: 'Lua de sangue',
        start: 0.37, end: 0.50,
        text: 'Eclipse TOTAL! A Lua não desaparece: ela fica avermelhada. A atmosfera da Terra desvia um pouco da luz do Sol para dentro da sombra, e só a luz vermelha chega até a Lua. É como se todos os nasceres e pores do sol da Terra iluminassem a Lua ao mesmo tempo.',
        pos: (c) => comb(c.moon, 1, c.fwd, 13, c.side, -7, c.up, 3),
        look: (c) => c.moon.clone(),
      },
      {
        name: 'A Terra vista da Lua',
        start: 0.53, end: 0.66,
        noOverlay: true,
        text: 'Estamos pousados quase na superfície da Lua, olhando para a Terra. Daqui, é a Terra que está tapando o Sol! Veja o anel avermelhado ao redor do planeta: é a atmosfera da Terra iluminada por trás. É essa luz vermelha que pinta a Lua.',
        pos: (c) => {
          const toEarth = c.earth.clone().sub(c.moon).normalize();
          return comb(c.moon, 1, toEarth, 5.45 + 2.0, c.up, 0.6);
        },
        look: (c) => c.earth.clone(),
      },
      {
        name: 'Quem consegue ver?',
        start: 0.72, end: 0.92,
        text: 'A área em verde mostra quem consegue ver o eclipse lunar: toda a metade da Terra que está de NOITE, com a Lua no céu. Por isso o eclipse lunar é visto por muito mais gente que o eclipse solar, que aparece só numa faixa estreita do lado do dia.',
        pos: (c) => comb(c.fwd, -58, c.side, 30, c.up, 24),
        look: (c) => c.earth.clone(),
      },
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
