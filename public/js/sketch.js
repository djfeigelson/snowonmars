// ─────────────────────────────────────────────────────────────
//  snow on mars — layer 0
//
//  A black field. Hidden in it, at random places that change on
//  every load, are pockets of opal. Tap one and it opens outward
//  from your finger; its colour depends on the viewing angle
//  (cursor, or tilting a phone). After a while it breaks back
//  down into grains and goes dark again.
//
//  Every pocket reveals something. (Potch pockets that do nothing
//  are still supported: raise CONFIG.potch above 0.)
//
//  Hooks for future layers (window.addEventListener):
//    "opal:open"   detail { index, variety, x, y }
//    "opal:potch"  detail { index, x, y }
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  live:   [8, 12],       // how many pockets reveal something (max 12)
  potch:  [0, 0],        // how many pockets do nothing
  size:   [0.06, 0.16],  // pocket radius, fraction of the screen's short side
  growMs: 1800,          // time to open fully
  holdMs: 9000,          // stays open this long after the last tap
  fadeMs: 9000,          // then breaks down over this long
  idleAfter: 3500,       // ms without input before the light drifts on its own
};

const VARIETIES = ['black', 'crystal', 'fire'];
const VARIETY_WEIGHTS = [0.55, 0.3, 0.15];

let opalShader;
let pockets = [];                // all pockets, live and potch
let view = { x: 0, y: 0 }, target = { x: 0, y: 0 };
let lastInput = -1e9, tiltSeen = false, askedTilt = false;
const t0 = performance.now();
const now = () => performance.now() - t0;

// ── setup ────────────────────────────────────────────────────
function setup() {
  const mobile = matchMedia('(pointer: coarse)').matches;
  pixelDensity(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5));
  const c = createCanvas(windowWidth, windowHeight, WEBGL);
  c.parent('stage');
  noStroke();
  opalShader = createShader(VERT, FRAG);
  scatterPockets();

  c.elt.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', () => { lastInput = now(); });
  window.addEventListener('deviceorientation', onTilt);
}

// ── random layout, new every load ────────────────────────────
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = ([a, b]) => Math.floor(rand(a, b + 1));

function pickVariety() {
  let r = Math.random();
  for (let i = 0; i < VARIETIES.length; i++) { if ((r -= VARIETY_WEIGHTS[i]) <= 0) return i; }
  return 0;
}

function scatterPockets() {
  const nLive = Math.min(randInt(CONFIG.live), MAX_REGIONS);
  const nPotch = randInt(CONFIG.potch);
  const halfW = 0.5 * width / Math.min(width, height);
  const halfH = 0.5 * height / Math.min(width, height);

  pockets = [];
  for (let tries = 0; pockets.length < nLive + nPotch && tries < 4000; tries++) {
    const R = rand(...CONFIG.size);
    const a = [rand(0, 0.22), rand(0, 0.14), rand(0, 0.07)];
    const reach = R * (1 + a[0] + a[1] + a[2]);
    const cx = rand(-halfW + reach, halfW - reach);
    const cy = rand(-halfH + reach, halfH - reach);
    const clear = pockets.every(o => Math.hypot(o.cx - cx, o.cy - cy) > (o.reach + reach) * 1.1);
    if (!clear) continue;
    pockets.push({
      cx, cy, R, reach, a,
      ph: [rand(0, 6.283), rand(0, 6.283), rand(0, 6.283)],
      seed: rand(0, 50),
      live: pockets.length < nLive,
      variety: pickVariety(),
      tap: [cx, cy], openedAt: -1, holdUntil: 0, life: 0,
    });
  }
}

// same outline as regionDist() in shaders.js
function regionDist(o, x, y) {
  const dx = x - o.cx, dy = y - o.cy;
  const th = Math.atan2(dy, dx);
  const r = o.R * (1 + o.a[0] * Math.sin(2 * th + o.ph[0]) +
                       o.a[1] * Math.sin(3 * th + o.ph[1]) +
                       o.a[2] * Math.sin(5 * th + o.ph[2]));
  return Math.hypot(dx, dy) / r;
}

// screen px → field coords (short side = 1, centred, y up)
function toField(px, py) {
  const s = Math.min(width, height);
  return [(px - width / 2) / s, (height / 2 - py) / s];
}

// ── tapping ──────────────────────────────────────────────────
function onPointerDown(e) {
  lastInput = now();
  askTiltPermission();
  const r = e.target.getBoundingClientRect();
  const [x, y] = toField(e.clientX - r.left, e.clientY - r.top);

  const i = pockets.findIndex(o => regionDist(o, x, y) < 1);
  if (i < 0) return;
  const o = pockets[i];
  if (!o.live) {
    window.dispatchEvent(new CustomEvent('opal:potch', { detail: { index: i, x, y } }));
    return;
  }
  const t = now();
  if (o.openedAt < 0) { o.openedAt = t; o.tap = [x, y]; }
  o.holdUntil = t + CONFIG.growMs + CONFIG.holdMs;
  window.dispatchEvent(new CustomEvent('opal:open',
    { detail: { index: i, variety: VARIETIES[o.variety], x, y } }));
}

// ── loop ─────────────────────────────────────────────────────
function draw() {
  updateView();
  const t = now();
  const live = pockets.filter(o => o.live);

  const geo = [], shape = [], phase = [], state = [];
  for (let k = 0; k < MAX_REGIONS; k++) {
    const o = live[k];
    if (!o) { geo.push(0, 0, 0, 0); shape.push(0, 0, 0, 0); phase.push(0, 0, 0, 0); state.push(0, 0, 0, 0); continue; }
    let grow = 0;
    if (o.openedAt >= 0) {
      grow = Math.min(1, (t - o.openedAt) / CONFIG.growMs);
      grow = 1 - Math.pow(1 - grow, 3);                         // ease out
      const target = t < o.holdUntil ? 1 : Math.max(0, 1 - (t - o.holdUntil) / CONFIG.fadeMs);
      o.life = target > o.life ? o.life + (target - o.life) * 0.12 : target;
      if (t >= o.holdUntil && o.life <= 0) { o.openedAt = -1; grow = 0; }
    }
    geo.push(o.cx, o.cy, o.R, o.variety);
    shape.push(o.a[0], o.a[1], o.a[2], o.seed);
    phase.push(o.ph[0], o.ph[1], o.ph[2], 0);
    state.push(grow * 1.15, o.life, o.tap[0], o.tap[1]);
  }

  shader(opalShader);
  opalShader.setUniform('uRes', [width * pixelDensity(), height * pixelDensity()]);
  opalShader.setUniform('uDpr', pixelDensity());
  opalShader.setUniform('uTime', t / 1000);
  opalShader.setUniform('uView', [view.x, view.y]);
  opalShader.setUniform('uCount', Math.min(live.length, MAX_REGIONS));
  opalShader.setUniform('uGeo', geo);
  opalShader.setUniform('uShape', shape);
  opalShader.setUniform('uPhase', phase);
  opalShader.setUniform('uState', state);
  rect(0, 0, width, height);
}

// ── viewing angle ────────────────────────────────────────────
function updateView() {
  const idle = now() - lastInput > CONFIG.idleAfter;
  if (!tiltSeen) {
    if (idle) {
      const s = now() / 1000;
      target.x = 0.55 * Math.sin(s * 0.13) + 0.15 * Math.sin(s * 0.41);
      target.y = 0.45 * Math.sin(s * 0.09 + 1.3);
    } else {
      target.x = constrain(mouseX / width * 2 - 1, -1, 1);
      target.y = constrain(1 - mouseY / height * 2, -1, 1);
    }
  }
  const ease = idle && !tiltSeen ? 0.02 : 0.08;
  view.x += (target.x - view.x) * ease;
  view.y += (target.y - view.y) * ease;
}

function onTilt(e) {
  if (e.gamma == null) return;
  tiltSeen = true;
  target.x = constrain(e.gamma / 35, -1, 1);
  target.y = constrain((45 - e.beta) / 35, -1, 1);
}

// iOS only allows motion data after a tap
function askTiltPermission() {
  if (askedTilt) return;
  askedTilt = true;
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().catch(() => {});
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
