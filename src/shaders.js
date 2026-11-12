// Shaders da Terra, atmosfera e Lua.
// O ponto central é a função sunVisible(): para cada ponto da superfície ela calcula
// quanto do disco do Sol está visível, considerando um corpo (Lua ou Terra) na frente.
// Assim a umbra (sombra total) e a penumbra (sombra parcial) aparecem de forma física.

const occlusionGLSL = /* glsl */ `
float angBetween(vec3 a, vec3 b) {
  return atan(length(cross(a, b)), dot(a, b));
}
// fração do disco solar visível a partir de P (1 = Sol inteiro, 0 = Sol totalmente coberto)
float sunVisible(vec3 P, vec3 S, float Rs, vec3 O, float Ro) {
  vec3 ds = S - P;
  vec3 dO = O - P;
  float Ls = length(ds);
  float Lo = length(dO);
  if (Lo >= Ls || dot(ds, dO) <= 0.0) return 1.0;
  float a = asin(clamp(Rs / Ls, 0.0, 1.0));
  float b = asin(clamp(Ro / Lo, 0.0, 1.0));
  float c = angBetween(ds, dO);
  if (c >= a + b) return 1.0;
  float areaS = PI * a * a;
  float ov;
  if (c <= abs(a - b)) {
    float m = min(a, b);
    ov = PI * m * m;
  } else {
    float a2 = a * a, b2 = b * b, c2 = c * c;
    float k1 = a2 * acos(clamp((c2 + a2 - b2) / (2.0 * c * a), -1.0, 1.0));
    float k2 = b2 * acos(clamp((c2 + b2 - a2) / (2.0 * c * b), -1.0, 1.0));
    float k3 = 0.5 * sqrt(max(0.0, (-c + a + b) * (c + a - b) * (c - a + b) * (c + a + b)));
    ov = k1 + k2 - k3;
  }
  return clamp(1.0 - ov / areaS, 0.0, 1.0);
}
`;

const commonVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPosW;
varying vec3 vNormW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

export const earthShader = {
  vertexShader: commonVertex,
  fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform float cloudShift;
uniform vec3 sunPos;
uniform float sunR;
uniform vec3 moonPos;
uniform float moonR;
uniform int overlayMode;   // 0 nada, 1 eclipse solar, 2 eclipse lunar
varying vec3 vPosW;
varying vec3 vNormW;
varying vec2 vUv;
${occlusionGLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormW);
  vec3 L = normalize(sunPos - vPosW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  float vis = sunVisible(vPosW, sunPos, sunR, moonPos, moonR);
  float light = max(ndl, 0.0) * vis;

  vec3 day = texture2D(dayMap, vUv).rgb;
  float cloud = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
  vec3 nightLights = texture2D(nightMap, vUv).rgb;

  float oceanMask = clamp((day.b - day.g) * 4.0, 0.0, 1.0);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 40.0) * 0.5 * oceanMask * (1.0 - cloud);

  vec3 col = day * (light * 1.15 + 0.012);
  col = mix(col, vec3(1.0) * (light * 1.05 + 0.015), cloud * 0.85);
  col += vec3(1.0, 0.95, 0.85) * spec * light;
  // luzes das cidades acendem onde está escuro (inclusive dentro da sombra do eclipse!)
  float dark = 1.0 - smoothstep(0.0, 0.18, light);
  col += nightLights * dark * (1.0 - cloud * 0.7) * 0.9;
  // tom alaranjado perto do terminador (nascer/pôr do sol)
  float term = exp(-pow(ndl / 0.12, 2.0));
  col += vec3(0.25, 0.08, 0.0) * exp(-pow(ndl / 0.06, 2.0)) * vis * 0.12;

  if (overlayMode == 1) {
    // Eclipse solar: destacar onde ele é visível
    float obsc = 1.0 - vis;
    float onDay = smoothstep(-0.02, 0.06, ndl);
    float partial = smoothstep(0.0, 0.03, obsc) * onDay;
    col = mix(col, col * vec3(1.0, 0.82, 0.45) + vec3(0.05, 0.035, 0.0), partial * 0.6);
    // linhas de mesmo "quanto do Sol foi coberto" (25%, 50%, 75%)
    float f = obsc * 4.0;
    float w = max(fwidth(f) * 1.2, 1e-4);
    float iso = 1.0 - smoothstep(0.0, w, abs(fract(f + 0.5) - 0.5));
    iso *= step(0.02, obsc) * step(obsc, 0.97) * onDay;
    col = mix(col, vec3(1.0, 0.8, 0.2), iso * 0.9);
    // contorno da umbra (eclipse total)
    float uw = max(fwidth(obsc) * 2.0, 1e-4);
    float umbraEdge = (1.0 - smoothstep(0.0, uw, abs(obsc - 0.985))) * step(0.5, obsc);
    col = mix(col, vec3(1.0, 0.2, 0.3), umbraEdge * onDay);
  } else if (overlayMode == 2) {
    // Eclipse lunar: hemisfério de onde a Lua está acima do horizonte
    vec3 M = normalize(moonPos - vPosW);
    float up = dot(N, M);
    float seen = smoothstep(-0.01, 0.03, up);
    col = mix(col, col + vec3(0.0, 0.22, 0.17), seen * 0.5);
    float w = max(fwidth(up) * 2.0, 1e-4);
    float edge = 1.0 - smoothstep(0.0, w, abs(up));
    col = mix(col, vec3(0.2, 1.0, 0.7), edge);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
};

export const atmosphereShader = {
  vertexShader: commonVertex,
  fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunPos;
uniform float sunR;
uniform vec3 moonPos;
uniform float moonR;
varying vec3 vPosW;
varying vec3 vNormW;
varying vec2 vUv;
${occlusionGLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(sunPos - vPosW);
  float rim = 1.0 - max(dot(N, V), 0.0);
  float glow = pow(rim, 3.0);
  float sunF = dot(N, L);
  float day = smoothstep(-0.2, 0.35, sunF);
  float term = exp(-pow(sunF / 0.2, 2.0));
  float back = pow(max(dot(-V, L), 0.0), 4.0);
  float vis = sunVisible(vPosW, sunPos, sunR, moonPos, moonR);
  vec3 blue = vec3(0.30, 0.58, 1.0);
  vec3 red = vec3(1.0, 0.32, 0.08);
  vec3 col = blue * glow * day * 1.3 + red * glow * (term * 0.35 + back * 2.2) * smoothstep(-0.6, 0.0, sunF + 0.3);
  gl_FragColor = vec4(col * vis, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
};

export const moonShader = {
  vertexShader: commonVertex,
  fragmentShader: /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 sunPos;
uniform float sunR;
uniform vec3 earthPos;
uniform float earthR;
varying vec3 vPosW;
varying vec3 vNormW;
varying vec2 vUv;
${occlusionGLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormW);
  vec3 L = normalize(sunPos - vPosW);
  float lam = max(dot(N, L), 0.0);
  float vis = sunVisible(vPosW, sunPos, sunR, earthPos, earthR);
  vec3 tex = texture2D(map, vUv).rgb;
  // Dentro da sombra da Terra chega luz vermelha, desviada pela atmosfera terrestre
  float inShadow = 1.0 - vis;
  vec3 redLight = vec3(0.6, 0.17, 0.05) * smoothstep(0.55, 1.0, inShadow) * 0.85;
  vec3 col = tex * (lam * vis * 1.2 + lam * redLight + 0.008);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
};

// Mesma conta em JavaScript (para o "sensor" do satélite e a iluminação da cabine)
export function sunVisibleJS(P, S, Rs, O, Ro) {
  const ds = S.clone().sub(P);
  const dO = O.clone().sub(P);
  const Ls = ds.length();
  const Lo = dO.length();
  if (Lo >= Ls || ds.dot(dO) <= 0) return 1;
  const a = Math.asin(Math.min(1, Rs / Ls));
  const b = Math.asin(Math.min(1, Ro / Lo));
  const c = Math.atan2(ds.clone().cross(dO).length(), ds.dot(dO));
  if (c >= a + b) return 1;
  const areaS = Math.PI * a * a;
  let ov;
  if (c <= Math.abs(a - b)) {
    const m = Math.min(a, b);
    ov = Math.PI * m * m;
  } else {
    const a2 = a * a, b2 = b * b, c2 = c * c;
    const cl = (x) => Math.max(-1, Math.min(1, x));
    const k1 = a2 * Math.acos(cl((c2 + a2 - b2) / (2 * c * a)));
    const k2 = b2 * Math.acos(cl((c2 + b2 - a2) / (2 * c * b)));
    const k3 = 0.5 * Math.sqrt(Math.max(0, (-c + a + b) * (c + a - b) * (c - a + b) * (c + a + b)));
    ov = k1 + k2 - k3;
  }
  return Math.max(0, Math.min(1, 1 - ov / areaS));
}
