// ─────────────────────────────────────────────────────────────
//  snow on mars — layer 0 shaders
//  Kept as strings so index.html also works opened from disk.
// ─────────────────────────────────────────────────────────────

const MAX_REGIONS = 12;

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() {
  vec4 p = vec4(aPosition, 1.0);
  p.xy = p.xy * 2.0 - 1.0;
  gl_Position = p;
}
`;

const FRAG = `
precision highp float;
#define MAX_REGIONS ${MAX_REGIONS}

uniform vec2  uRes;
uniform float uDpr;
uniform float uTime;
uniform vec2  uView;                 // viewing angle, -1..1 (cursor / tilt)
uniform float uCount;                // number of live regions
uniform vec4  uGeo[MAX_REGIONS];     // cx, cy, R, variety
uniform vec4  uShape[MAX_REGIONS];   // a1, a2, a3, seed
uniform vec4  uPhase[MAX_REGIONS];   // phi1, phi2, phi3, -
uniform vec4  uState[MAX_REGIONS];   // grow 0..1, life 0..1, tapX, tapY

// ── noise ────────────────────────────────────────────────────
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
float fbm4(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.8, -.6, .6, .8);
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = r * p * 2.02 + 7.3; a *= .5; }
  return v;
}

// ── wavelength (nm) → RGB ────────────────────────────────────
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
  return c * smoothstep(375., 425., w) * (1. - smoothstep(690., 740., w));
}

// ── region outline (must match regionRadius() in sketch.js) ──
float regionDist(vec2 p, vec4 g, vec4 s, vec4 ph){
  vec2 d = p - g.xy;
  float th = atan(d.y, d.x);
  float r = g.z * (1. + s.x * sin(2. * th + ph.x) + s.y * sin(3. * th + ph.y) + s.z * sin(5. * th + ph.z));
  return length(d) / r;                       // < 1 inside
}

// ── the revealed field ───────────────────────────────────────
// A slowly flowing, folded silica "surface". Its local slope is the
// orientation of the sphere lattice; Bragg's law against the viewing
// angle gives the colour:  λ = 2·n·(0.816·D)·cosθ.
vec3 field(vec2 p, vec2 c, float variety, float seed, float life){
  float isFire    = step(1.5, variety);
  float isCrystal = step(.5, variety) * (1. - isFire);

  float scale = mix(5.0, 3.2, isCrystal);
  vec2 q = (p - c) * scale + seed * 17.;
  float t = uTime * .045;

  vec2 w1 = vec2(fbm4(q + vec2(0., t)), fbm4(q + vec2(5.2, -t)));
  vec2 w2 = vec2(fbm4(q + 2.6 * w1 + vec2(1.7, 9.2) + t * .5), fbm4(q + 2.6 * w1 + vec2(8.3, 2.8)));
  vec2 b  = q + 2.2 * w2;
  float e = .02;
  float f  = fbm4(b);
  float fx = fbm4(b + vec2(e, 0.));
  float fy = fbm4(b + vec2(0., e));
  vec2 slope = vec2(fx - f, fy - f) / e;

  // sphere size: varies across the stone; shrinks as the window fades
  // (colour slides toward violet, then past the eye into UV)
  float Dlo = mix(225., 200., isCrystal), Dhi = mix(310., 280., isCrystal);
  float D = mix(Dlo, Dhi, smoothstep(.25, .75, fbm4(q * .45 + 3.3)));
  D *= mix(.6, 1., smoothstep(.0, .6, life));

  vec2 a = uView * .6 - slope * .5;
  float cosT = cos(clamp(length(a) * .75, 0., 1.45));
  float lambda = 2. * 1.37 * .816 * D * cosT;
  float sharp = mix(2.6, 1.8, isCrystal);
  float flash = exp(-dot(a, a) * sharp);

  // folds catch more light than troughs
  float fold = .2 + 1.5 * smoothstep(.4, .78, f);
  vec3 col = spectral(lambda) * flash * fold;

  // pinfire glints
  vec2 gq = q * 9.;
  vec2 gid = floor(gq);
  vec2 gp = fract(gq) - hash22(gid + seed);
  float glint = smoothstep(.12, .0, length(gp)) * step(.82, hash12(gid * 1.3 + seed));
  vec2 gt = (hash22(gid + 4.1) - .5) * 2.2;
  vec2 ga = uView * .6 - gt;
  float gl = 2. * 1.37 * .816 * D * cos(clamp(length(ga) * .75, 0., 1.45));
  col += spectral(gl) * glint * exp(-dot(ga, ga) * 3.) * 1.6;

  // body tone per variety
  vec3 body = vec3(.004, .006, .012);                                      // black opal
  body = mix(body, vec3(.006, .012, .03) * (.4 + f), isCrystal);          // crystal: clear, near-black depth
  col *= mix(1., 1.25, isCrystal);
  vec3 fire = mix(vec3(.55, .05, .0), vec3(1., .48, .08), smoothstep(.3, .8, f)) * (.45 + .9 * f);
  col = mix(col, fire + col * .25, isFire);                                // fire: warm body, faint flash
  return body * (1. - isFire) + col;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  float s = min(uRes.x, uRes.y);
  vec2 p = (frag - .5 * uRes) / s;                // short side = 1, y up

  float best = 0.; int bi = -1; float bd = 1.;
  for (int i = 0; i < MAX_REGIONS; i++){
    if (float(i) >= uCount) break;
    vec4 st = uState[i];
    if (st.x <= 0. && st.y <= 0.) continue;
    float d = regionDist(p, uGeo[i], uShape[i], uPhase[i]);
    if (d > 1.15) continue;
    float R = uGeo[i].z;
    float edgeN = (vnoise(p * 38. + float(i) * 9.) - .5) * .12;
    float inside = 1. - smoothstep(.86, 1.0, d + edgeN);
    // reveal spreads outward from where it was tapped
    float front = length(p - st.zw) / (R * 2.6) + (vnoise(p * 22. - float(i)) - .5) * .1;
    float spread = 1. - smoothstep(st.x - .12, st.x, front);
    float m = inside * spread;
    if (m > best){ best = m; bi = i; bd = d; }
  }

  vec3 col = vec3(0.);
  if (bi >= 0 && best > .001){
    vec4 g = vec4(0.), sh = vec4(0.), st = vec4(0.);
    for (int i = 0; i < MAX_REGIONS; i++){ if (i == bi){ g = uGeo[i]; sh = uShape[i]; st = uState[i]; } }
    float life = st.y;
    col = field(p, g.xy, g.w, sh.w, life);

    // fading: the stone breaks back down into its spheres —
    // a stipple that retreats from the rim inward until it's gone
    float grain = hash12(floor(frag / (1.6 * uDpr)) + sh.w * 31.);
    float keep = life * 1.25 - .1 - (bd - .5) * .35;
    float vis = smoothstep(grain - .12, grain + .02, keep);
    // jewel contrast: deepen the darks, saturate
    col = pow(max(col, 0.), vec3(1.3)) * 1.7;
    float lum = dot(col, vec3(.299, .587, .114));
    col = max(mix(vec3(lum), col, 1.3), 0.);
    col *= best * vis;
    col = 1. - exp(-col * 1.5);
  }

  gl_FragColor = vec4(col, 1.);
}
`;
