import { TRANSITIONS } from './transitions.js';

// --- picture ---
const LINE_CSS_PX = 3;         // scanline spacing in CSS px; lower = more, finer lines
const SAMPLE_MHZ = 315 / 88 * 4; // composite sampling rate: 4 samples per color subcarrier cycle
const H_SAMPLES = 753;         // samples across a 4:3 width: SAMPLE_MHZ x 52.6 µs of visible line
const LUMA_MHZ = 4.2;          // transmitted brightness bandwidth; lower = blurrier
const CHROMA_I_MHZ = 1.3;      // transmitted orange/blue bandwidth; lower = more color bleed
const CHROMA_Q_MHZ = 0.6;      // transmitted purple/green bandwidth; lower = more color bleed, more shader taps
const DECODER_MHZ = 1.3;       // receiver color bandwidth; lower = more color bleed
const COLOR = 1;               // TV color knob; 1 = source saturation
const COMPOSITE_SHARPENING = 0.3; // boosts high frequencies of the composite signal: sharper edges, stronger color (gain = 1 + 0.665 x this)
const SHARPENING_SAMPLES = 0.94; // sharpening blur width; 0.94 matches the color gain of ntsc-rs
const SEPARATION = 'notch';    // brightness/color split: 'notch' = dot crawl and rainbows on fine detail; 'comb1' or 'comb2' = sharper, artifacts only on vertical color changes
const NOTCH_SAMPLES = 3;       // notch filter length; lower = softer brightness, stronger dot crawl

// --- electron beam ---
const BEAM_MIN = [0.18, 0.18, 0.18]; // [R, G, B] beam thickness on dark lines, in line heights; lower = darker gaps
const BEAM_MAX = [0.45, 0.45, 0.45]; // [R, G, B] beam thickness on bright lines; higher = bright areas fill the gaps
const CONVERGENCE_CENTER = 0;  // red/blue beam offset from green at screen center, in CSS px
const CONVERGENCE_EDGE = 0.75; // extra offset at the left/right edges, in CSS px; 0 = perfect convergence

// --- phosphor mask (aperture grille: vertical R/G/B stripes) ---
const MASK_STRENGTH = 0.1;     // 0 = off, 1 = fully separated stripes (brightness is compensated)
const MASK_TRIAD_CSS_PX = 1.5; // width of one R+G+B triad; never below 3 device px to avoid moiré

// --- gamma ---
const SIGNAL_GAMMA = 2.4;      // CRT response; higher = deeper shadows
const DISPLAY_GAMMA = 2.2;     // your screen's response; keep at 2.2

// --- bloom (glow around highlights) ---
const BLOOM_STRENGTH = 0.2;    // 0 = off
const BLOOM_THRESHOLD = 0.35;  // brightness where glow starts; must stay below 0.5
const BLOOM_SPREAD = 1.5;      // glow size; +1 doubles the radius

// --- halation (light scattered inside the glass: wide, faint, no threshold) ---
const HALATION_STRENGTH = 0.02;        // share of light spread into the halo; 0 = off
const HALATION_SPREAD = 3.5;             // halo size; +1 doubles the radius
const HALATION_TINT = [1, 0.85, 0.7];  // [R, G, B] halo color; warm by default

// --- interlace ---
const FIELD_RATE = 60;         // fields per second (NTSC 60, PAL 50)
const INTERLACE = 0.5;           // 1 = odd/even lines update alternately (full line shift); 0 = all lines update together
const FREEZE_MS = 100;         // how long F freezes the current field

// --- keyboard ---
const SEEK_STEP = 5;           // seconds jumped by the left/right arrows

// --- transitions ---
const MASK_SCALE = 1 / 4;      // transition mask resolution vs screen
const MASK_PAD = 20;           // mask border in px, so the soft edge isn't clipped
const SOFTNESS = 0.025;        // transition edge blur, relative to width

const f = n => n.toFixed(6);
const v3 = a => `vec3(${a.map(f)})`;

const sigma = mhz => 0.1325 * SAMPLE_MHZ / mhz;
const TAPS = Math.ceil(6 * sigma(CHROMA_Q_MHZ));
const WEIGHT = x => f(1 / (2 * x * x));

const REMOTE_FILES = 'https://tv-website-assets.roccopunghellini.com/';
const LOCAL_FILES = '/files/';
const FILES = [
  'storm.mp4', 'perfect-days.mp4', 'rafman-test.mp4'
];

const VS = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`;

const CARRIER = `
const float IM[4] = float[4](1., 0., -1., 0.);
const float QM[4] = float[4](0., 1., 0., -1.);
int phase(ivec2 p) { return (p.x + 2 * ((p.y + FRAME) & 1)) & 3; }`;

const ENCODE_FS = `#version 300 es
precision highp float;
uniform sampler2D V0, V1, M;
uniform vec2 C0, C1, S;
uniform vec4 B;
uniform float MIX;
uniform int FRAME;
out vec4 o;
const mat3 TO_YIQ = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312);
const vec3 W = vec3(${WEIGHT(sigma(LUMA_MHZ))}, ${WEIGHT(sigma(CHROMA_I_MHZ))}, ${WEIGHT(sigma(CHROMA_Q_MHZ))});
${CARRIER}
vec3 src(vec2 uv) {
  vec3 a = texture(V0, .5 + (uv - .5) * C0).rgb;
  vec3 b = texture(V1, .5 + (uv - .5) * C1).rgb;
  return mix(a, b, MIX * texture(M, B.xy + uv * B.zw).a);
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / S.x, 1. - gl_FragCoord.y / S.y);
  vec3 acc = vec3(0), sum = vec3(0);
  for (int k = -${TAPS}; k <= ${TAPS}; k++) {
    float d = float(k) * .5;
    vec3 wt = exp(-d * d * W);
    acc += TO_YIQ * src(uv + vec2(d / S.x, 0)) * wt;
    sum += wt;
  }
  vec3 yiq = acc / sum;
  int n = phase(ivec2(gl_FragCoord.xy));
  o = vec4(yiq.x + yiq.y * IM[n] + yiq.z * QM[n], 0, 0, 1);
}`;

const SHARPEN_FS = `#version 300 es
precision highp float;
uniform sampler2D C;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int last = textureSize(C, 0).x - 1;
  float soft = 0., sum = 0.;
  for (int k = -3; k <= 3; k++) {
    float w = exp(-float(k * k) * ${WEIGHT(SHARPENING_SAMPLES)});
    soft += texelFetch(C, ivec2(clamp(p.x + k, 0, last), p.y), 0).r * w;
    sum += w;
  }
  float s = texelFetch(C, p, 0).r;
  o = vec4(s + ${f(COMPOSITE_SHARPENING)} * (s - soft / sum), 0, 0, 1);
}`;

const SEPARATE_FS = `#version 300 es
precision highp float;
uniform sampler2D C;
out vec4 o;
const float IM[4] = float[4](1., 0., -1., 0.);
const int MODE = ${['notch', 'comb1', 'comb2'].indexOf(SEPARATION)};
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), size = textureSize(C, 0);
  float s = texelFetch(C, p, 0).r, chroma = 0.;
  float up = texelFetch(C, ivec2(p.x, p.y == 0 ? 1 : p.y - 1), 0).r;
  float down = texelFetch(C, ivec2(p.x, p.y == size.y - 1 ? p.y - 1 : p.y + 1), 0).r;
  if (MODE == 1) chroma = .5 * (s - up);
  else if (MODE == 2) chroma = .5 * s - .25 * (up + down);
  else {
    float sum = 0.;
    for (int k = -${3 * NOTCH_SAMPLES}; k <= ${3 * NOTCH_SAMPLES}; k++) {
      float w = exp(-float(k * k) * ${WEIGHT(NOTCH_SAMPLES)});
      chroma += 2. * w * IM[k & 3] * texelFetch(C, ivec2(clamp(p.x + k, 0, size.x - 1), p.y), 0).r;
      sum += w;
    }
    chroma /= sum;
  }
  o = vec4(s - chroma, chroma, 0, 1);
}`;

const DECODE_FS = `#version 300 es
precision highp float;
uniform sampler2D YC;
uniform int FRAME, FIELD;
out vec4 o;
const float INTERLACE = ${f(INTERLACE)}, GIN = ${f(SIGNAL_GAMMA)}, COLOR = ${f(COLOR)};
const mat3 TO_RGB = mat3(1, 1, 1, .956, -.272, -1.106, .621, -.647, 1.703);
${CARRIER}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float a = (p.y & 1) == FIELD ? 1. : 1. - INTERLACE;
  if (a == 0.) discard;
  int last = textureSize(YC, 0).x - 1;
  vec2 iq = vec2(0);
  float sum = 0.;
  for (int k = -6; k <= 6; k++) {
    ivec2 t = ivec2(p.x + k, p.y);
    int n = phase(t);
    float w = exp(-float(k * k) * ${WEIGHT(sigma(DECODER_MHZ))});
    iq += 2. * w * texelFetch(YC, ivec2(clamp(t.x, 0, last), p.y), 0).g * vec2(IM[n], QM[n]);
    sum += w;
  }
  vec3 yiq = vec3(texelFetch(YC, p, 0).r, COLOR * iq / sum);
  o = vec4(pow(max(TO_RGB * yiq, vec3(0)), vec3(GIN)), a);
}`;

const BEAM_FS = `#version 300 es
precision highp float;
uniform sampler2D L;
uniform vec2 R;
uniform float N, P, T, D;
out vec4 o;
const float CONV_C = ${f(CONVERGENCE_CENTER)}, CONV_E = ${f(CONVERGENCE_EDGE)}, MASK_K = ${f(MASK_STRENGTH)};
const vec3 SMIN = ${v3(BEAM_MIN)}, SMAX = ${v3(BEAM_MAX)}, HAL_TINT = ${v3(HALATION_TINT)};
const float HAL_K = ${f(HALATION_STRENGTH)}, HAL_LOD = ${f(HALATION_SPREAD)};
const float BLOOM_LOD = ${f(BLOOM_SPREAD)}, BLOOM_T = ${f(BLOOM_THRESHOLD)}, BLOOM_K = ${f(BLOOM_STRENGTH)};
const float GIN = ${f(SIGNAL_GAMMA)}, GOUT = ${f(DISPLAY_GAMMA)};
void main() {
  vec2 uv = gl_FragCoord.xy / R;
  float y = uv.y * N;
  float dx = (CONV_C + CONV_E * (2. * uv.x - 1.)) * D;
  vec3 c = vec3(0);
  for (float k = -1.; k <= 1.; k++) {
    float i = floor(y) + k;
    if (i < 0. || i >= N) continue;
    float ty = (i + .5) / N;
    vec3 lin = vec3(textureLod(L, vec2(uv.x + dx, ty), 0.).r, textureLod(L, vec2(uv.x, ty), 0.).g, textureLod(L, vec2(uv.x - dx, ty), 0.).b);
    vec3 s = mix(SMIN, SMAX, lin);
    s = sqrt(s * s + 1. / (12. * P * P));
    float d = y - i - .5;
    c += lin * exp(-d * d / (2. * s * s)) / (s * 2.5066);
  }
  vec3 m = .5 + .5 * cos(6.2832 * (gl_FragCoord.x / T - vec3(0, 1, 2) / 3.));
  c *= mix(vec3(1), m, MASK_K) / (1. - .5 * MASK_K);
  c = mix(c, HAL_TINT * textureLod(L, uv, HAL_LOD).rgb, HAL_K);
  vec3 g = pow(textureLod(L, uv, BLOOM_LOD).rgb, vec3(1. / GIN));
  o = vec4(pow(c, vec3(1. / GOUT)) + BLOOM_K * clamp((g - BLOOM_T) / (1. - 2. * BLOOM_T), 0., 1.), 1);
}`;

export function startTv({ tube, pick, seek, vids }) {
  const controller = new AbortController(), { signal } = controller;
  const gl = tube.getContext('webgl2');
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d');

  // gl setup

  const program = fs => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const uniforms = (p, ...names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Composite signal needs EXT_color_buffer_float');
  const A = program(ENCODE_FS), Sh = program(SHARPEN_FS), Se = program(SEPARATE_FS), De = program(DECODE_FS), Bp = program(BEAM_FS);
  const ua = uniforms(A, 'V0', 'V1', 'M', 'C0', 'C1', 'S', 'B', 'MIX', 'FRAME');
  const ud = uniforms(De, 'YC', 'FRAME', 'FIELD');
  const ub = uniforms(Bp, 'L', 'R', 'N', 'P', 'T', 'D');
  gl.useProgram(A); gl.uniform1i(ua.M, 2);
  gl.useProgram(Sh); gl.uniform1i(gl.getUniformLocation(Sh, 'C'), 4);
  gl.useProgram(Se); gl.uniform1i(gl.getUniformLocation(Se, 'C'), 5);
  gl.useProgram(De); gl.uniform1i(ud.YC, 6);
  gl.useProgram(Bp); gl.uniform1i(ub.L, 3);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  for (let i = 0; i < 4; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, i === 3 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gl.getParameter(gl.TEXTURE_BINDING_2D), 0);

  const SIGNALS = [[4, 'R16F', 'RED'], [5, 'R16F', 'RED'], [6, 'RG16F', 'RG']];
  const [fbComposite, fbSharpened, fbSeparated] = SIGNALS.map(([unit]) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const target = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return target;
  });

  const upload = (unit, src) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  };

  let w, h, cssH;
  const fit = () => {
    h = Math.ceil(innerHeight / LINE_CSS_PX);
    cssH = h * LINE_CSS_PX;
    w = Math.round(H_SAMPLES * innerWidth / (cssH * 4 / 3));
    tube.style.height = cssH + 'px';
    tube.width = Math.round(innerWidth * devicePixelRatio);
    tube.height = Math.round(cssH * devicePixelRatio);
    mask.width = Math.ceil(innerWidth * MASK_SCALE) + 2 * MASK_PAD;
    mask.height = Math.ceil(cssH * MASK_SCALE) + 2 * MASK_PAD;
    gl.activeTexture(gl.TEXTURE3);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [unit, internal, format] of SIGNALS) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl[internal], w, h, 0, gl[format], gl.HALF_FLOAT, null);
    }
    gl.useProgram(A);
    gl.uniform2f(ua.S, w, h);
    gl.uniform4f(ua.B, MASK_PAD / mask.width, MASK_PAD / mask.height, 1 - 2 * MASK_PAD / mask.width, 1 - 2 * MASK_PAD / mask.height);
    gl.useProgram(Bp);
    gl.uniform2f(ub.R, tube.width, tube.height);
    gl.uniform1f(ub.N, h);
    gl.uniform1f(ub.P, tube.height / h);
    gl.uniform1f(ub.T, Math.max(3, Math.round(MASK_TRIAD_CSS_PX * devicePixelRatio)));
    gl.uniform1f(ub.D, devicePixelRatio / tube.width);
  };
  fit();
  addEventListener('resize', fit, { signal });

  // playback

  let cur = 0, idx = 0;
  const load = (v, i) => {
    v.onerror = () => {
      v.onerror = null;
      v.src = LOCAL_FILES + FILES[i];
      v.play();
    };
    v.src = REMOTE_FILES + FILES[i];
    v.play();
  };

  pick.innerHTML = FILES.map(f => `<option>${f}</option>`).join('');
  pick.onchange = () => load(vids[cur], idx = pick.selectedIndex);
  load(vids[cur], 0);

  seek.oninput = () => vids[cur].currentTime = seek.value * vids[cur].duration;

  let soundPending = true;
  const togglePause = () => { const v = vids[cur]; v.paused ? v.play() : v.pause(); };

  tube.onclick = () => {
    if (!soundPending) return togglePause();
    soundPending = false;
    vids[cur].muted = false;
  };

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const v = vids[cur], inControl = e.target.matches('input, select');
    if (soundPending && e.code !== 'KeyM') v.muted = false;
    soundPending = false;
    if (e.code === 'ArrowRight' && !inControl) v.currentTime += SEEK_STEP;
    else if (e.code === 'ArrowLeft' && !inControl) v.currentTime -= SEEK_STEP;
    else if (e.repeat) return;
    else if (e.code === 'KeyM') v.muted = !v.muted;
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyF') freeze();
  }, { signal });

  // freeze

  let drawn = 0, frozen = null, release;
  const freeze = () => {
    frozen = drawn % 2;
    clearTimeout(release);
    release = setTimeout(() => frozen = null, FREEZE_MS);
  };

  // transitions

  const names = Object.keys(TRANSITIONS);
  let trans = null, lastName = null;

  const randomTransition = () => {
    const pool = names.filter(n => n !== lastName);
    return lastName = pool[Math.floor(Math.random() * pool.length)];
  };

  addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (trans) return;
    trans = { start: null, ...TRANSITIONS[randomTransition()] };
    const next = vids[1 - cur];
    load(next, idx = (idx + 1) % FILES.length);
    pick.selectedIndex = idx;
    next.addEventListener('playing', () => trans.start = performance.now(), { once: true });
  }, { signal });

  const drawMask = p => {
    const W = mask.width, H = mask.height;
    mctx.clearRect(0, 0, W, H);
    mctx.filter = `blur(${W * SOFTNESS}px)`;
    mctx.beginPath();
    trans.shape(mctx, W, H, p);
    mctx.fill();
    return mask;
  };

  // render

  const crossfadeAudio = p => {
    const [from, to] = [vids[cur], vids[1 - cur]];
    to.muted = from.muted;
    from.volume = Math.cos(p * Math.PI / 2);
    to.volume = Math.sin(p * Math.PI / 2);
  };

  const cover = v => {
    const k = Math.max(innerWidth / v.videoWidth, cssH / v.videoHeight);
    return [innerWidth / (v.videoWidth * k), cssH / (v.videoHeight * k)];
  };

  const render = (t, field) => {
    const on = !!trans?.start, p = on ? Math.min((t - trans.start) / trans.ms, 1) : 0;
    gl.useProgram(A);
    upload(cur, vids[cur]);
    gl.uniform1i(ua.V0, cur);
    gl.uniform1i(ua.V1, 1 - cur);
    gl.uniform2fv(ua.C0, cover(vids[cur]));
    if (on) {
      upload(1 - cur, vids[1 - cur]);
      upload(2, drawMask(p));
      gl.uniform2fv(ua.C1, cover(vids[1 - cur]));
      crossfadeAudio(p);
    }
    gl.uniform1f(ua.MIX, on ? 1 : 0);
    const frame = field >> 1;
    gl.uniform1i(ua.FRAME, frame);
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbComposite);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(Sh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbSharpened);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(Se);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbSeparated);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(De);
    gl.uniform1i(ud.FRAME, frame);
    gl.uniform1i(ud.FIELD, field & 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.enable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE3);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.useProgram(Bp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, tube.width, tube.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (p === 1) {
      vids[cur].pause();
      vids[cur].muted = true;
      vids[cur].volume = 1;
      cur = 1 - cur;
      trans = null;
    }
  };

  let last = -1, raf;
  (function tick(t = 0) {
    const field = Math.floor(t * FIELD_RATE / 1000);
    if (field !== last && vids[cur].readyState > 1 && field % 2 !== frozen) {
      last = drawn = field;
      render(t, field);
      if (!seek.matches(':active')) seek.value = vids[cur].currentTime / vids[cur].duration;
    }
    raf = requestAnimationFrame(tick);
  })();

  return () => {
    controller.abort();
    cancelAnimationFrame(raf);
  };
}
