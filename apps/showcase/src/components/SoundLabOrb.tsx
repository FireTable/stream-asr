import React, { useEffect, useRef, useState } from 'react';
import './SoundLabOrb.css';

const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uFlow;
uniform vec3 uTurn;
uniform float uEnergy;
uniform float uPulse;
uniform vec3 uBands;
uniform float uLight;
uniform vec3 uInk;
uniform vec3 uTint;
uniform float uIntro;
uniform float uHover;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float span(float x, float reach) {
  float a = clamp(1.0 - abs(x) / reach, 0.0, 1.0);
  return a * a * (3.0 - 2.0 * a);
}

vec2 ribbon(vec2 q, float k, float amp, float width, float twist, float flow, float turn, float seed, float reach, float soft) {
  float x = q.x;
  float env = span(x, reach);
  float p1 = k * x + flow;
  float p2 = 1.87 * k * x - 0.71 * flow + seed;
  float p3 = 3.07 * k * x + 1.3 * flow + 2.0 * seed;
  float c = amp * env * (sin(p1) + 0.34 * sin(p2) + 0.12 * sin(p3));
  float slope = amp * env * k * (cos(p1) + 0.636 * cos(p2) + 0.368 * cos(p3));
  float th = twist * x + turn;
  float h = width * (0.3 + 0.7 * env) * sqrt(1.0 + slope * slope);
  float u = (q.y - c) / h;
  float cover = (1.0 - smoothstep(1.0 - soft, 1.0 + 0.5 * soft, abs(u))) * env;
  if (cover <= 0.0) return vec2(0.0);
  float bend = th + u * 0.9;
  vec3 n = normalize(vec3(-slope * 0.3, -sin(bend), cos(bend)));
  vec3 key = normalize(vec3(-0.35, 0.75, 0.6));
  float facing = dot(n, key);
  float grazing = 1.0 - n.z * n.z;
  float glint = dot(n, normalize(key + vec3(0.0, 0.0, 1.0)));
  float shade = (0.2 + 0.55 * facing * facing + 0.5 * grazing * grazing + 0.5 * pow(glint * glint, 12.0)) * (1.0 - 0.2 * u * u);
  return vec2(cover, shade);
}

vec3 satinLight(vec4 s) {
  return 1.0 - exp(-s.rgb * 1.4);
}

vec3 satinInk(vec4 s, vec3 ink, vec3 base) {
  float cover = clamp(s.a, 0.0, 1.0);
  float level = dot(s.rgb, vec3(0.333)) / max(cover, 1e-3);
  vec3 deep = ink * 0.6;
  vec3 pale = mix(ink, vec3(1.0), 0.55);
  vec3 cloth = mix(deep, pale, smoothstep(0.25, 1.15, level));
  return mix(base, cloth, cover * 0.94);
}

const float BEVEL = 0.3;
const float PULL = 0.34;

vec2 lens(vec2 dir, float r, float strength) {
  float t = clamp((r - (1.0 - BEVEL)) / BEVEL, 0.0, 1.0);
  float curve = 1.0 - sqrt(max(1.0 - t * t, 0.0));
  return dir * (r - PULL * strength * curve);
}

vec4 scene(vec2 q) {
  float e = uEnergy;
  float breath = 0.5 + 0.5 * sin(uTime * 0.7);
  float lift = 1.0 + 2.0 * e + 1.2 * uPulse;
  vec2 a = ribbon(q, 2.6, 0.18 * (0.92 + 0.12 * breath) * (lift + 1.2 * uBands.y + 0.6 * uBands.x), 0.21 * (1.0 + 0.4 * e), 1.9 + 0.8 * e, uFlow.x, uTurn.x, 0.0, 1.25, 0.2);
  vec2 b = ribbon(q + vec2(0.0, 0.06), 3.8, 0.12 * (lift + 1.5 * uBands.z), 0.11 * (1.0 + 0.4 * e), 2.9 + e, uFlow.y, uTurn.y, 1.7, 1.2, 0.26);
  float shine = 1.0 + 0.8 * e + 0.7 * uPulse;
  vec3 light = (uInk * a.x * a.y + uTint * b.x * b.y * 0.55 * (1.0 - 0.6 * a.x)) * shine;
  return vec4(light, 1.0 - (1.0 - a.x) * (1.0 - 0.7 * b.x));
}

vec4 wrap(vec2 dir) {
  float angle = atan(dir.y, dir.x);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int k = -4; k <= 4; k++) {
    float f = float(k);
    float w = exp(-f * f / 7.0);
    sum += scene(vec2(cos(angle + f * 0.045), sin(angle + f * 0.045)) * 0.8) * w;
    total += w;
  }
  return sum / total;
}

void main() {
  vec2 res = uResolution;
  float m = min(res.x, res.y);
  vec2 frag = (gl_FragCoord.xy - 0.5 * res) / m;
  float appear = smoothstep(0.0, 1.0, uIntro);
  float R = 0.44 * mix(0.94, 1.0, appear) * (1.0 + 0.026 * uEnergy + 0.02 * uPulse);
  vec2 p = frag / R;
  float r = length(p);
  float px = 1.0 / (m * R);
  vec2 key = normalize(vec2(-0.55, 0.83));
  float grain = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  if (r > 1.0 + 2.0 * px) {
    float under = exp(-pow((r - 1.0) / 0.09, 2.0)) * smoothstep(0.2, -0.8, p.y);
    fragColor = vec4(vec3(0.0), uLight * 0.06 * under * appear);
    return;
  }
  float inside = clamp((1.0 - r) / px + 0.5, 0.0, 1.0);
  float rr = min(r, 0.9995);
  vec2 dir = r > 1e-5 ? p / r : vec2(0.0, 1.0);
  float t = clamp((rr - (1.0 - BEVEL)) / BEVEL, 0.0, 1.0);
  vec4 S = scene(lens(dir, rr, 1.0));
  if (t > 0.0) {
    vec4 rim = wrap(dir) * pow(t, 1.6);
    S.rgb += rim.rgb * 1.1;
    S.a = 1.0 - (1.0 - S.a) * (1.0 - rim.a * 0.7);
  }
  float fade = smoothstep(0.2, 1.0, uIntro);
  S.rgb *= fade;
  S.a *= fade;
  float lit = pow(max(dot(dir, key), 0.0), 2.0);
  float back = pow(max(dot(dir, -key), 0.0), 3.0);
  float hair = exp(-pow((1.0 - rr) / (0.004 + 1.2 * px), 2.0));
  float bevel = smoothstep(0.0, 1.0, t);
  if (uLight < 0.5) {
    vec3 rgb = satinLight(S);
    rgb += vec3(hair * (0.1 + 0.7 * lit + 0.35 * back) * (1.0 + 0.4 * uHover + 0.5 * uEnergy));
    rgb = (rgb + vec3(0.012)) * inside * appear + grain;
    fragColor = vec4(max(rgb, 0.0), clamp(max(max(rgb.r, rgb.g), rgb.b), 0.0, 1.0));
  } else {
    // Light Mode: Transparent Crystal Plate with Translucent White Pearl Silk & Sky-Cyan Glow
    float cover = clamp(S.a, 0.0, 1.0);
    float fold = dot(S.rgb, vec3(0.333));
    
    // Pure Pearl White Silk with soft Sky-Cyan Subsurface Glow (轻盈半透白丝绸 + 幽蓝衬底)
    vec3 blueSub   = vec3(0.20, 0.65, 0.96); // Soft brand sky-blue in translucent depths
    vec3 pearlSilk = vec3(0.92, 0.96, 1.0);  // Silky pearl white body
    vec3 pureWhite = vec3(1.0, 1.0, 1.0);    // Pure brilliant white crest highlight

    // Multi-stop blend: subtle translucent sky-blue depth -> luminous pearl white silk -> crisp white glint
    vec3 silkCol = mix(blueSub, pearlSilk, smoothstep(0.08, 0.42, fold));
    silkCol = mix(silkCol, pureWhite, smoothstep(0.42, 0.90, fold));

    // Delicate Crystal Rim (Hair boundary & Specular Glint)
    vec3 rimCol = mix(vec3(0.22, 0.62, 0.95), vec3(0.72, 0.92, 1.0), lit);
    float rimA = hair * (0.38 + 0.62 * lit + 0.3 * back) * (1.0 + 0.3 * uHover + 0.4 * uEnergy);

    // Subtle Bevel Glass Accent around boundary
    float bevelA = pow(t, 2.5) * 0.12 * (0.5 + 0.5 * lit);
    vec3 bevelCol = mix(vec3(0.22, 0.62, 0.95), vec3(0.70, 0.90, 1.0), lit);

    // "之前白色多加点透明度": Translucent airy silk veil (0.42 ~ 0.68 opacity instead of 0.96 opaque)
    // Allows background particles and the ambient sky-blue radial glow to breathe right through!
    float waveA = cover * mix(0.42, 0.68, smoothstep(0.2, 0.8, fold));
    vec3 rgb = silkCol * waveA + rimCol * rimA + bevelCol * bevelA;
    float a = clamp(waveA + rimA + bevelA, 0.0, 1.0) * inside * appear;

    fragColor = vec4(rgb, a);
  }
}
`;

const PALETTES = {
  // FireTable brand silk palette (Ice pearl white in dark, ethereal pearl white & sky cyan in light)
  default: {
    dark: { ink: [0.92, 0.96, 1.0], tint: [0.22, 0.74, 0.97] },
    light: { ink: [0.92, 0.96, 1.0], tint: [0.25, 0.72, 0.98] }
  },
  // FireTable Electric Cyan voice/sound active variant (#38bdf8)
  active: {
    dark: { ink: [0.22, 0.74, 0.97], tint: [0.55, 0.88, 1.0] },
    light: { ink: [0.35, 0.80, 1.0], tint: [0.85, 0.96, 1.0] }
  }
};

const EE = {
  flow: [0.42, -0.58, 0.3],
  turn: [0.36, 0.52, -0.27]
};

function isLightTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.getAttribute('data-theme') === 'light' ||
    !document.documentElement.classList.contains('dark')
  );
}

export interface SoundLabOrbProps {
  audioLevel?: number; // 0.0 to 1.0
  isActive?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function SoundLabOrb({
  audioLevel = 0,
  isActive = false,
  className = '',
  onClick
}: SoundLabOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef(0);
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const [isGlReady, setIsGlReady] = useState(false);
  const isGlReadyRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isRunning = true;
    let animId = 0;
    let isInitialized = false;

    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let vaoBuffer: WebGLBuffer | null = null;
    let u: Record<string, WebGLUniformLocation | null> = {};

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    // Cap DPR to 1.5 for silky smooth 60/120fps raymarching while slashing pixel fillrate overhead by 44%
    const maxDpr = 1.5;

    const state = {
      flow: [0.8, 2.3, 4.1] as [number, number, number],
      turn: [1.1, 0.3, 2.4] as [number, number, number],
      energy: 0,
      shown: 0,
      slow: 0,
      pulse: 0,
      bands: [0, 0, 0] as [number, number, number],
      hover: 0,
      activeTransition: 0,
      start: performance.now(),
      last: performance.now(),
      visible: true,
      light: isLightTheme(),
      quality: 1,
      cost: 1 / 60,
      lag: 0,
      calm: 0
    };

    const updateSize = () => {
      if (!canvas || !gl || gl.isContextLost()) return;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = Math.max(1, Math.round((canvas.clientWidth || 320) * dpr));
      const h = Math.max(1, Math.round((canvas.clientHeight || 320) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const stopLoop = () => {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = 0;
      }
    };

    const startLoopIfReady = () => {
      if (!animId && isRunning && state.visible && !document.hidden && isInitialized) {
        state.last = performance.now();
        animId = requestAnimationFrame(render);
      }
    };

    const initWebGL = () => {
      if (!canvas || !isRunning) return;
      try {
        if (!gl || gl.isContextLost()) {
          gl = canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            powerPreference: 'low-power'
          });
        }
        if (!gl || gl.isContextLost()) return;

        // Compile vertex shader
        vs = gl.createShader(gl.VERTEX_SHADER);
        if (!vs) return;
        gl.shaderSource(vs, VERTEX_SHADER);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
          console.warn('[SoundLabOrb] Vertex shader compile failed:', gl.getShaderInfoLog(vs));
          return;
        }

        // Compile fragment shader
        fs = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fs) return;
        gl.shaderSource(fs, FRAGMENT_SHADER);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
          console.warn('[SoundLabOrb] Fragment shader compile failed:', gl.getShaderInfoLog(fs));
          return;
        }

        program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, 'position');
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.warn('[SoundLabOrb] Shader link failed:', gl.getProgramInfoLog(program));
          return;
        }

        vaoBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vaoBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.useProgram(program);

        const uniformNames = [
          'uResolution',
          'uTime',
          'uFlow',
          'uTurn',
          'uEnergy',
          'uPulse',
          'uBands',
          'uLight',
          'uInk',
          'uTint',
          'uIntro',
          'uHover'
        ];
        u = Object.fromEntries(
          uniformNames.map(name => [name, gl!.getUniformLocation(program!, name)])
        );

        isInitialized = true;
        updateSize();
        startLoopIfReady();
      } catch (err) {
        console.warn('[SoundLabOrb] WebGL initialization error:', err);
      }
    };

    const render = (now: number) => {
      animId = 0;
      if (!isRunning || !state.visible || document.hidden) return;
      if (!gl || gl.isContextLost() || !program || !isInitialized) {
        if (isGlReadyRef.current) {
          isGlReadyRef.current = false;
          setIsGlReady(false);
        }
        return;
      }

      // Maintain smooth frame pacing without judder across 60Hz and 120Hz/ProMotion displays
      const rawDt = (now - state.last) / 1000;
      if (rawDt < 0.008) {
        animId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min(0.04, Math.max(0.001, rawDt));
      state.last = now;

      // Audio dynamics & organic living vitality
      const elapsed = (now - state.start) / 1000;
      const isListening = isActiveRef.current;
      const S = audioLevelRef.current;

      // Natural meditative breathing cycle when idle, subtle alert hum when listening in silence
      const idleBreathing = 0.05 * (0.5 + 0.5 * Math.sin(elapsed * 1.4)) + 0.02 * Math.cos(elapsed * 0.9);
      const activePulse = 0.12 + 0.04 * Math.sin(elapsed * 2.4);
      const baselineEnergy = isListening ? activePulse : idleBreathing;

      const effectiveInput = Math.max(baselineEnergy, S);
      const decay = Math.exp(-dt / 0.4);
      state.energy = Math.max(effectiveInput, state.energy * decay);
      state.shown += (state.energy - state.shown) * (1 - Math.exp(-dt / 0.04));

      if (S - state.slow > 0.03) {
        state.pulse = Math.min(1, state.pulse + (S - state.slow) * 3.5);
      }
      state.pulse *= Math.exp(-dt / 0.28);
      state.slow += (S - state.slow) * (1 - Math.exp(-dt / (S > state.slow ? 0.12 : 0.3)));

      // Frequency bands
      state.bands[0] = Math.max(effectiveInput * 0.85, state.bands[0] * decay);
      state.bands[1] = Math.max(effectiveInput * 1.15, state.bands[1] * decay);
      state.bands[2] = Math.max(effectiveInput * 0.65, state.bands[2] * decay);

      state.hover += (hoverRef.current - state.hover) * (1 - Math.exp(-dt / 0.15));

      const targetActiveWeight = isListening ? 1.0 : Math.min(1.0, state.shown * 2.5);
      state.activeTransition += (targetActiveWeight - state.activeTransition) * (1 - Math.exp(-dt / 0.2));

      const speedFactor = prefersReducedMotion
        ? 0.15
        : (isListening ? 1.6 : 0.9) + 5.2 * state.shown + 3.0 * state.pulse + 0.8 * state.hover;

      for (let i = 0; i < 3; i++) {
        state.flow[i] += dt * EE.flow[i] * speedFactor;
        state.turn[i] += dt * EE.turn[i] * speedFactor;
      }

      try {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const themeKey = state.light ? 'light' : 'dark';

        // Interpolate between FireTable pearl silk and electric cyan when voice/audio is active
        const activeWeight = Math.min(1.0, Math.max(0.0, state.activeTransition));
        const basePal = PALETTES.default[themeKey];
        const cyanPal = PALETTES.active[themeKey];

        const ink = [
          basePal.ink[0] * (1 - activeWeight) + cyanPal.ink[0] * activeWeight,
          basePal.ink[1] * (1 - activeWeight) + cyanPal.ink[1] * activeWeight,
          basePal.ink[2] * (1 - activeWeight) + cyanPal.ink[2] * activeWeight,
        ];
        const tint = [
          basePal.tint[0] * (1 - activeWeight) + cyanPal.tint[0] * activeWeight,
          basePal.tint[1] * (1 - activeWeight) + cyanPal.tint[1] * activeWeight,
          basePal.tint[2] * (1 - activeWeight) + cyanPal.tint[2] * activeWeight,
        ];

        gl.useProgram(program);
        if (u.uResolution) gl.uniform2f(u.uResolution, canvas.width, canvas.height);
        if (u.uTime) gl.uniform1f(u.uTime, prefersReducedMotion ? 0 : elapsed);
        if (u.uFlow) gl.uniform3f(u.uFlow, state.flow[0], state.flow[1], state.flow[2]);
        if (u.uTurn) gl.uniform3f(u.uTurn, state.turn[0], state.turn[1], state.turn[2]);
        if (u.uEnergy) gl.uniform1f(u.uEnergy, prefersReducedMotion ? state.shown * 0.5 : state.shown);
        if (u.uPulse) gl.uniform1f(u.uPulse, prefersReducedMotion ? 0 : state.pulse);
        if (u.uBands) gl.uniform3f(u.uBands, state.bands[0], state.bands[1], state.bands[2]);
        if (u.uLight) gl.uniform1f(u.uLight, state.light ? 1 : 0);
        if (u.uInk) gl.uniform3f(u.uInk, ink[0], ink[1], ink[2]);
        if (u.uTint) gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        if (u.uIntro) gl.uniform1f(u.uIntro, Math.min(1, elapsed / 1.1));
        if (u.uHover) gl.uniform1f(u.uHover, state.hover);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (!isGlReadyRef.current) {
          isGlReadyRef.current = true;
          setIsGlReady(true);
        }
      } catch (err) {
        console.warn('[SoundLabOrb] Render frame error:', err);
      }

      if (isRunning && state.visible && !document.hidden) {
        animId = requestAnimationFrame(render);
      }
    };

    // WebGL 上下文丢失 (手机切后台 / 电脑休眠 / GPU 内存回收):
    // 关键: preventDefault 告诉浏览器将恢复上下文, 否则直接永久抛弃!
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      stopLoop();
      isInitialized = false;
      isGlReadyRef.current = false;
      setIsGlReady(false);
    };

    // WebGL 上下文恢复 (切回前台 / GPU 资源重组):
    // 重置所有 GL 资源指针并全量重新编译 Shader 与绑定 Buffer
    const handleContextRestored = () => {
      if (!isRunning) return;
      program = null;
      vs = null;
      fs = null;
      vaoBuffer = null;
      u = {};
      isInitialized = false;
      state.last = performance.now();
      state.start = performance.now();
      if (state.visible && !document.hidden) {
        initWebGL();
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // 页面能见度与后台调度 (手机切后台立即取消 RAF, 切回前台安全恢复)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
        return;
      }
      state.last = performance.now();
      if (!gl || gl.isContextLost()) {
        isGlReadyRef.current = false;
        setIsGlReady(false);
        return;
      }
      if (!isInitialized) {
        initWebGL();
      } else {
        startLoopIfReady();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // bfcache 恢复 (pageshow persisted)
    window.addEventListener('pageshow', handleVisibilityChange);

    const io = new IntersectionObserver(entries => {
      state.visible = entries.some(e => e.isIntersecting);
      if (state.visible) {
        startLoopIfReady();
      } else {
        stopLoop();
      }
    });
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      updateSize();
      startLoopIfReady();
    });
    ro.observe(canvas);

    const mo = new MutationObserver(() => {
      state.light = isLightTheme();
      startLoopIfReady();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    // 初始启动 WebGL 初始化
    initWebGL();

    return () => {
      isRunning = false;
      stopLoop();
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      if (gl && !gl.isContextLost()) {
        if (vaoBuffer) gl.deleteBuffer(vaoBuffer);
        if (program) gl.deleteProgram(program);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
      }
    };
  }, []);

  return (
    <button
      type="button"
      className={`snd-orb ${className}`}
      onClick={onClick}
      onPointerEnter={() => {
        hoverRef.current = 1;
      }}
      onPointerLeave={() => {
        hoverRef.current = 0;
      }}
      aria-label="Sound Lab Acoustic Sphere"
    >
      <canvas
        ref={canvasRef}
        className={`snd-orb-canvas absolute inset-0 w-full h-full block rounded-full transition-opacity duration-300 pointer-events-none ${
          isGlReady ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
