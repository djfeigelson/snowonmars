// ─────────────────────────────────────────────────────────────
//  snow on mars — layer 0: "the rough"
//  Shaders live here as strings so the site also works when
//  index.html is opened straight from disk (no local server).
// ─────────────────────────────────────────────────────────────

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() {
  vec4 p = vec4(aPosition, 1.0);
  p.xy = p.xy * 2.0 - 1.0;          // p5 rect is a 0..1 quad → fill clip space
  gl_Position = p;
}
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;     // canvas size in device pixels
uniform float uTime;    // seconds
uniform sampler2D uMask;// rubbed "window" (white = rubbed open)
uniform vec2  uView;    // viewing / light angle, -1..1 (cursor or device tilt)
uniform float uDepth;   // 0..1, grows with how much the visitor has rubbed (ever)
uniform float uSeed;

// ── noise ────────────────────────────────────────────────────
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.8, -.6, .6, .8);
  for (int i = 0; i < 6; i++){ v += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= .5; }
  return v;
}
float fbm3(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.8, -.6, .6, .8);
  for (int i = 0; i < 3; i++){ v += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= .5; }
  return v;
}

// Voronoi: returns (F1, F2-F1) and the winning cell id.
vec2 voronoi(vec2 p, out vec2 id){
  vec2 n = floor(p), f = fract(p);
  float d1 = 8., d2 = 8.;
  id = n;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(n + g + uSeed) - f;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = n + g; }
    else if (d < d2){ d2 = d; }
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec2(d1, d2 - d1);
}

// ── light ────────────────────────────────────────────────────
// Wavelength (nm) → RGB.  (Zucconi's 6-lobe fit + falloff at the ends)
vec3 bump3y(vec3 x, vec3 yo){ vec3 y = 1. - x * x; return clamp(y - yo, 0., 1.); }
vec3 spectral(float w){
  float x = clamp((w - 400.) / 300., 0., 1.);
  const vec3 c1 = vec3(3.54585104, 2.93225262, 2.41593945);
  const vec3 x1 = vec3(0.69549072, 0.49228336, 0.27699880);
  const vec3 y1 = vec3(0.02312639, 0.15225084, 0.52607955);
  const vec3 c2 = vec3(3.90307140, 3.21182957, 3.96587128);
  const vec3 x2 = vec3(0.11748627, 0.86755042, 0.66077860);
  const vec3 y2 = vec3(0.84897130, 0.88445281, 0.73949448);
  vec3 c = bump3y(c1 * (x - x1), y1) + bump3y(c2 * (x - x2), y2);
  return c * smoothstep(375., 420., w) * (1. - smoothstep(690., 740., w));
}

// ── precious opal ────────────────────────────────────────────
// Each grain is a domain of stacked silica spheres (diameter D).
// Bragg:  λ = 2 · n · d · cosθ   with d = 0.816·D (fcc 111 planes), n ≈ 1.37
// Small spheres can only ever reach blue/violet; big spheres reach red.
// Tilting (θ grows) always pushes colour toward the blue end and then into UV.
vec3 grainLayer(vec2 q, vec2 view, float scale, float sharp, float gain, float pin){
  vec2 qs = q * scale;
  qs += .35 * vec2(fbm3(qs * 1.7), fbm3(qs * 1.7 + 5.3)) - .17;   // wavy grain borders
  vec2 id;
  vec2 v = voronoi(qs, id);
  float h1 = hash12(id + 1.3 + uSeed);
  float h2 = hash12(id * 1.7 + 4.2);
  vec2 tilt = (hash22(id + 9.1) - .5) * 1.8;       // orientation of this grain's lattice

  // sphere size: mostly small (blue/green); large (red) is rare — less rare deeper in.
  float D = mix(175., 310., pow(h1, mix(2.4, 0.9, uDepth)));

  // rolling flash: lattice orientation drifts slightly across a grain
  float ripple = fbm3(q * 5.0 * scale + id * 3.1 + uTime * .03) - .5;
  vec2 a = view - tilt - ripple * .45;
  float theta = clamp(length(a) * .85, 0., 1.45);
  float lambda = 2. * 1.37 * .816 * D * cos(theta);

  float flash = exp(-dot(a, a) * sharp * mix(.7, 1.6, h2));

  // striations: each grain streaks along its own direction
  float ang = h2 * 6.2831;
  vec2 dir = vec2(cos(ang), sin(ang));
  float streak = fbm3(vec2(dot(qs, dir) * 9., dot(qs, vec2(-dir.y, dir.x)) * 1.5) + id);
  float body = .25 + 1.1 * pow(streak, 1.6);

  // pinfire: only bright pinpoints near grain centres, and only some grains
  body *= mix(1., smoothstep(.38, .05, v.x) * step(.45, h2) * 2.2, pin);

  float edge = smoothstep(.0, .06, v.y);           // dark seams between grains
  return spectral(lambda) * flash * body * edge * gain;
}

vec3 opal(vec2 p, vec2 view){
  vec2 q = p + .45 * vec2(fbm3(p * .7 + 3.1), fbm3(p * .7 - 7.4)); // organic patch shapes
  vec3 c = vec3(0.);
  c += grainLayer(q,              view, 1.4, 1.4, 1.0, 0.);   // broad flash / harlequin patches
  c += grainLayer(q * 1.3 + 17.,  view, 4.5, 2.2, .45, 0.);   // smaller grains
  c += grainLayer(q + 41.,        view, 18., 3.0, .6,  1.);   // pinfire
  c = 1. - exp(-c * 1.5);                                     // soft highlight roll-off
  // black-opal body tone (≈N1–N2) with a faint milky haze
  vec3 body = vec3(.012, .014, .02) + vec3(.03, .035, .05) * fbm3(q * 2.);
  return body + c;
}

// ── rough stone (ironstone + potch) ──────────────────────────
float stoneHeight(vec2 p){
  vec2 w = p + .6 * vec2(fbm3(p * .8), fbm3(p * .8 + 5.2));
  return fbm(w * 1.4);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv   = frag / uRes;
  float s   = min(uRes.x, uRes.y);
  vec2 p    = (frag - .5 * uRes) / s * 3.;

  // rubbed window; ragged, ground edge
  float m = texture2D(uMask, vec2(uv.x, 1. - uv.y)).r;
  m += (vnoise(p * 9.) - .5) * .18;
  float clear = smoothstep(.42, .62, m);            // fully clear opal
  float milky = smoothstep(.12, .42, m);            // drying / clouding hydrophane stage
  float rim   = milky * (1. - clear);

  // stone
  vec2 w  = p + .6 * vec2(fbm3(p * .8), fbm3(p * .8 + 5.2));
  float n = fbm(w * 1.4);
  float strata = sin((w.y * 1.3 + n * 1.6) * 7.) * .5 + .5;
  vec3 iron1 = vec3(.075, .042, .028);
  vec3 iron2 = vec3(.24, .13, .065);
  vec3 iron3 = vec3(.42, .25, .12);
  vec3 stone = mix(iron1, iron2, smoothstep(.32, .68, n));
  stone = mix(stone, iron3, smoothstep(.55, .95, strata * n * 1.25));
  float potchAmt = smoothstep(.52, .66, fbm3(w * .55 + 20.));
  stone = mix(stone, vec3(.36, .35, .34) * (.75 + .4 * n), potchAmt * .85);
  stone *= .82 + .32 * vnoise(p * 140.);             // grit

  // raking light that follows the viewer
  float e  = 2.5 / s * 3.;
  float hx = stoneHeight(p + vec2(e, 0.)) - n;
  float hy = stoneHeight(p + vec2(0., e)) - n;
  vec3 N   = normalize(vec3(-hx * 3., -hy * 3., e * 2.));
  vec3 L   = normalize(vec3(uView.x * .9 + .3, -uView.y * .9 + .4, .8));
  float lit = .55 + .65 * max(dot(N, L), 0.);
  stone *= lit;

  // thin seams of colour already visible in the rock (boulder-opal veins)
  float vein = 1. - smoothstep(.0, .012, abs(fbm(w * .9 + 40.) - .5));
  vein *= smoothstep(.3, .6, fbm3(w * .4 - 9.));

  vec3 col = stone;
  if (milky > .001 || vein > .001){
    vec2 parallax = uView * .04;                     // colour sits *under* the surface
    vec3 o = opal(p + parallax, uView);
    col = mix(col, stone * .6 + o * .9, vein * .85);
    // milky stage: colour fogged by white potch, like hydrophane drying
    vec3 fog = mix(vec3(.30, .31, .33), vec3(.55, .57, .6), fbm3(p * 3.));
    vec3 milkyOpal = mix(fog * .8, o, .35) ;
    vec3 inside = mix(milkyOpal, o, clear);
    col = mix(col, inside, milky);
    // freshly ground rim catches the light
    col += rim * vec3(.10, .09, .085) * lit;
  }

  // vignette + living grain
  vec2 vc = uv - .5;
  col *= 1. - dot(vc, vc) * .9;
  col += (hash12(frag + fract(uTime) * 100.) - .5) * .025;

  gl_FragColor = vec4(col, 1.);
}
`;
