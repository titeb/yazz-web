"use client";

/**
 * Fond animé du mode vocal en direct : sphère lumineuse (cœur fluide rose /
 * violet / bleu, anneau clair, filaments d'énergie) et dégradés de fond sur
 * toute la page, animés par la voix (volume et intonation).
 *
 * Rendu WebGL (carte graphique, 60 images/s, sans re-rendu React), à
 * résolution réduite pour économiser la batterie. Sans WebGL : dégradé fixe.
 *
 * La sphère est centrée à 42 % de la hauteur, rayon min(24 % largeur,
 * 14 % hauteur) : le texte de l'écran se place en dessous (BELOW_ORB dans
 * yazz-live-voice.tsx).
 */
import { useEffect, useRef } from "react";

export type VisualMode = "idle" | "connecting" | "reconnecting" | "listening" | "thinking" | "speaking" | "muted" | "error";

export interface VoiceLevels {
  agent: number;
  user: number;
  agentTone: number;
  userTone: number;
}

export const ORB_CENTER_Y = 0.42; // fraction de la hauteur, depuis le haut
export const ORB_RADIUS_W = 0.24; // fraction de la largeur
export const ORB_RADIUS_H = 0.14; // fraction de la hauteur

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uTime;
uniform float uFlow;
uniform float uLevel;
uniform float uTone;
uniform float uSpin;
uniform float uDim;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v / 0.875;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - uCenter) / uRadius;
  float d = length(p);
  vec2 dir = d > 0.0001 ? p / d : vec2(1.0, 0.0);
  float t = uTime;
  float lvl = uLevel;

  // Fond : presque noir ; deux nappes bleu-violet très discrètes qui dérivent
  // et respirent avec la voix ; halo bleu autour de la sphère
  vec3 col = vec3(0.006, 0.008, 0.03);
  vec2 g1 = p * 0.22 - vec2(0.30 * sin(t * 0.07), 0.25 * cos(t * 0.05) + 0.10);
  vec2 g2 = p * 0.20 + vec2(0.34 * cos(t * 0.06), 0.28 * sin(t * 0.08) - 0.12);
  col += vec3(0.20, 0.08, 0.45) * exp(-dot(g1, g1) * 1.6) * (0.14 + 0.26 * lvl);
  col += vec3(0.04, 0.10, 0.45) * exp(-dot(g2, g2) * 1.4) * (0.12 + 0.24 * lvl);
  col += vec3(0.22, 0.20, 0.95) * exp(-max(d - 1.0, 0.0) * 1.9) * (0.26 + 0.42 * lvl);

  // Filaments d'énergie (bruit continu tout autour du cercle)
  float ca = cos(uSpin), sa = sin(uSpin);
  vec2 rdir = vec2(ca * dir.x - sa * dir.y, sa * dir.x + ca * dir.y);
  float fil = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float wob = noise(rdir * (1.3 + 0.15 * fi) + vec2(fi * 3.7, t * 0.30 + fi * 1.3)) - 0.5;
    float r = 1.07 + fi * 0.04 + (0.06 + 0.30 * lvl) * wob * 1.4;
    float w = 0.006 + 0.003 * fi;
    float e = (d - r) / w;
    fil += exp(-e * e) * (0.50 - fi * 0.055);
  }
  fil *= 0.5 + 0.5 * noise(rdir * 2.2 + vec2(t * 0.4, 7.0));
  col += vec3(0.60, 0.55, 1.0) * fil * (0.35 + 0.65 * lvl);

  // Anneau clair et sa lueur
  float er = (d - 1.0) / 0.028;
  col += vec3(0.90, 0.88, 1.0) * exp(-er * er) * (0.80 + 0.40 * lvl);
  float eg = (d - 1.0) / 0.12;
  col += vec3(0.42, 0.38, 1.0) * exp(-eg * eg) * 0.35;

  // Cœur : grands dégradés doux rose / violet / lilas, portés par la voix
  if (d < 1.0) {
    vec2 q = p * 0.85;
    vec2 w = vec2(fbm(q + vec2(uFlow * 0.30, -uFlow * 0.22)),
                  fbm(q + vec2(-uFlow * 0.26, uFlow * 0.34) + 3.7));
    float n = fbm(q * 1.1 + 1.7 * w);
    vec3 deep = vec3(0.32, 0.34, 0.96);
    vec3 violet = vec3(0.64, 0.42, 1.0);
    vec3 pink = vec3(1.0, 0.50, 0.86);
    vec3 lilac = vec3(0.88, 0.80, 1.0);
    vec3 inner = mix(deep, violet, smoothstep(0.18, 0.50, n));
    inner = mix(inner, pink, smoothstep(0.40, 0.74, n + 0.30 * (uTone - 0.5) + 0.06));
    inner = mix(inner, lilac, smoothstep(0.70, 0.96, n) * 0.55);
    inner *= 0.82 + 0.26 * (1.0 - d * d);
    vec2 hl = p - vec2(-0.30, 0.36);
    inner += vec3(0.20, 0.18, 0.24) * exp(-dot(hl, hl) * 3.5);
    inner += vec3(0.30, 0.30, 0.60) * smoothstep(0.78, 1.0, d) * 0.35;
    col = mix(col, inner, smoothstep(1.0, 0.985, d));
  }

  // Micro coupé / erreur : couleurs éteintes
  float gr = dot(col, vec3(0.30, 0.59, 0.11));
  col = mix(col, vec3(gr) * 0.75, uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function YazzVoiceVisual({ mode, getLevels }: { mode: VisualMode; getLevels: () => VoiceLevels }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const levelsRef = useRef(getLevels);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { levelsRef.current = getLevels; }, [getLevels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" })
      || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return; // repli : dégradé CSS du conteneur

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("uRes"), uCenter = u("uCenter"), uRadius = u("uRadius"), uTime = u("uTime");
    const uFlow = u("uFlow"), uLevel = u("uLevel"), uTone = u("uTone"), uSpin = u("uSpin"), uDim = u("uDim");

    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Résolution réduite (rendu doux, économe) : ~1 pixel calculé par pixel CSS au maximum
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.7;

    let w = 0, h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * scale));
      h = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let level = 0, tone = 0.5, flow = 0, spin = 0, dim = 0, time = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = modeRef.current;
      const lv = levelsRef.current();
      let target = 0;
      let toneTarget = tone;
      if (m === "speaking") { target = Math.min(1, lv.agent * 5.5); toneTarget = lv.agentTone; }
      else if (m === "listening") { target = Math.min(1, lv.user * 4); toneTarget = lv.userTone; }
      else if (m === "connecting" || m === "reconnecting" || m === "idle") target = 0.12 + 0.08 * Math.sin(now / 700);
      else if (m === "thinking") target = 0.25 + 0.1 * Math.sin(now / 300);
      // Montée rapide, descente douce : suit la voix sans à-coups
      level += (target - level) * (target > level ? Math.min(1, dt * 14) : Math.min(1, dt * 4));
      tone += (toneTarget - tone) * Math.min(1, dt * 3);
      const speed = reduced ? 0.3 : 1;
      time += dt * speed;
      flow += dt * speed * (0.25 + 1.6 * level + (m === "thinking" ? 0.8 : 0));
      spin += dt * speed * (m === "thinking" ? 1.4 : 0.15 + 0.5 * level);
      const dimTarget = m === "muted" || m === "error" ? 1 : m === "reconnecting" ? 0.5 : 0;
      dim += (dimTarget - dim) * Math.min(1, dt * 4);

      const radius = Math.min(w * ORB_RADIUS_W, h * ORB_RADIUS_H) * (1 + 0.08 * level);
      gl.uniform2f(uRes, w, h);
      gl.uniform2f(uCenter, w / 2, h * (1 - ORB_CENTER_Y));
      gl.uniform1f(uRadius, radius);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uFlow, flow);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uTone, tone);
      gl.uniform1f(uSpin, spin);
      gl.uniform1f(uDim, dim);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{ background: "radial-gradient(90% 60% at 50% 42%, #1c1660 0%, #070a24 45%, #02030b 100%)" }}
    />
  );
}
