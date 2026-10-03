// ─────────────────────────────────────────────────────────────
//  snow on mars — layer 0: "the rough"
//
//  The page starts as a piece of rough stone. Rub it (drag) to
//  grind a window. Inside is precious opal whose colour depends
//  on the angle you look from (cursor, or tilting your phone).
//  Leave it alone and the window fogs over and closes again.
//
//  Hooks for future layers (listen with window.addEventListener):
//    "opal:reveal"  detail { open: 0..1, depth: 0..1 }   ~2×/sec
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  maskScale: 0.25,      // resolution of the rub mask relative to the canvas
  brushRadius: 0.075,   // as a fraction of the short side of the screen
  rubStrength: 0.06,    // how much one pass opens the stone (0..1)
  fadeEvery: 6,         // frames between fade steps (higher = window stays open longer)
  idleAfter: 3500,      // ms without input before the stone drifts on its own
  depthRate: 0.015,     // how fast lifetime rubbing pushes "depth" (rarer reds)
};

let opalShader, mask, seed;
let view = { x: 0, y: 0 }, target = { x: 0, y: 0 };
let prev = null, lastInput = 0;
let depth = 0, rubbed = 0;
let tiltSeen = false, askedTilt = false;
const startTime = performance.now();

// ── setup ────────────────────────────────────────────────────
function setup() {
  const mobile = matchMedia('(pointer: coarse)').matches;
  pixelDensity(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25));
  const c = createCanvas(windowWidth, windowHeight, WEBGL);
  c.parent('stage');
  noStroke();

  opalShader = createShader(VERT, FRAG);
  seed = Math.random() * 100;
  buildMask();

  depth = loadDepth();
  rubbed = -Math.log(1 - Math.min(depth, 0.999)) / CONFIG.depthRate;

  window.addEventListener('deviceorientation', onTilt);
  setInterval(saveDepth, 4000);
  window.addEventListener('pagehide', saveDepth);
}

function buildMask() {
  const old = mask;
  mask = createGraphics(
    Math.max(1, Math.floor(width * CONFIG.maskScale)),
    Math.max(1, Math.floor(height * CONFIG.maskScale))
  );
  mask.pixelDensity(1);
  mask.background(0);
  if (old) { mask.image(old, 0, 0, mask.width, mask.height); old.remove(); }
}

// ── loop ─────────────────────────────────────────────────────
function draw() {
  handleRubbing();
  fadeMask();
  updateView();

  shader(opalShader);
  opalShader.setUniform('uRes', [width * pixelDensity(), height * pixelDensity()]);
  opalShader.setUniform('uTime', (performance.now() - startTime) / 1000);
  opalShader.setUniform('uMask', mask);
  opalShader.setUniform('uView', [view.x, view.y]);
  opalShader.setUniform('uDepth', depth);
  opalShader.setUniform('uSeed', seed);
  rect(0, 0, width, height);

  if (frameCount % 30 === 0) measureReveal();
}

// ── rubbing a window ─────────────────────────────────────────
function handleRubbing() {
  if (!mouseIsPressed) { prev = null; return; }
  const k = CONFIG.maskScale;
  const cur = { x: mouseX * k, y: mouseY * k };
  const r = Math.min(mask.width, mask.height) * CONFIG.brushRadius;

  if (prev) {
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / (r * 0.25));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      stamp(prev.x + dx * t, prev.y + dy * t, r, CONFIG.rubStrength);
    }
    // lifetime rubbing → depth
    rubbed += dist / Math.min(mask.width, mask.height);
    depth = 1 - Math.exp(-rubbed * CONFIG.depthRate);
  } else {
    stamp(cur.x, cur.y, r, CONFIG.rubStrength);
  }
  prev = cur;
  lastInput = millis();
  document.body.classList.add('touched');
}

function stamp(x, y, r, a) {
  const g = mask.drawingContext;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(255,255,255,${a})`);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
}

// The window clouds over: subtract 1/255 every few frames.
function fadeMask() {
  if (mouseIsPressed || frameCount % CONFIG.fadeEvery !== 0) return;
  const g = mask.drawingContext;
  g.globalCompositeOperation = 'difference';
  g.fillStyle = 'rgb(1,1,1)';
  g.fillRect(0, 0, mask.width, mask.height);
  g.globalCompositeOperation = 'source-over';
}

// ── viewing angle ────────────────────────────────────────────
function updateView() {
  const idle = millis() - lastInput > CONFIG.idleAfter;
  if (!tiltSeen) {
    if (idle) {
      // nobody's touching it: let the light wander slowly
      const t = millis() / 1000;
      target.x = 0.55 * Math.sin(t * 0.13) + 0.15 * Math.sin(t * 0.41);
      target.y = 0.45 * Math.sin(t * 0.09 + 1.3);
    } else if (mouseX || mouseY) {
      target.x = constrain(mouseX / width * 2 - 1, -1, 1);
      target.y = constrain(mouseY / height * 2 - 1, -1, 1);
    }
  }
  const ease = idle ? 0.02 : 0.08;
  view.x += (target.x - view.x) * ease;
  view.y += (target.y - view.y) * ease;
}

function mouseMoved() { lastInput = millis(); }

function onTilt(e) {
  if (e.gamma == null) return;
  tiltSeen = true;
  lastInput = millis();
  target.x = constrain(e.gamma / 35, -1, 1);
  target.y = constrain((e.beta - 45) / 35, -1, 1);
}

// iOS only allows motion data after a tap
function touchStarted() {
  if (!askedTilt && typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    askedTilt = true;
    DeviceOrientationEvent.requestPermission().catch(() => {});
  }
  return false;
}
function touchMoved() { return false; }   // rub, don't scroll

// ── measuring + events for future layers ─────────────────────
function measureReveal() {
  mask.loadPixels();
  const px = mask.pixels;
  let open = 0, n = 0;
  for (let i = 0; i < px.length; i += 16) { n++; if (px[i] > 110) open++; }
  window.dispatchEvent(new CustomEvent('opal:reveal', { detail: { open: open / n, depth } }));
}

// ── depth persists between visits (sediment) ────────────────
function loadDepth() {
  try { return parseFloat(localStorage.getItem('som.depth')) || 0; } catch (e) { return 0; }
}
function saveDepth() {
  try { localStorage.setItem('som.depth', depth.toFixed(4)); } catch (e) {}
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildMask();
}
