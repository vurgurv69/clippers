"use client";

import { useEffect, useRef } from "react";
import type { TimelineClip } from "@/lib/editor-types";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_blur;
uniform float u_vignette;
uniform float u_hue;
uniform float u_grain;
uniform float u_pixel;
uniform float u_shake;
uniform float u_sharpen;
uniform float u_tint;
uniform float u_negate;
uniform float u_rgbsplit;
uniform float u_posterize;
uniform float u_mirror;
uniform float u_wave;
uniform float u_emboss;
uniform float u_bloom;
uniform float u_contrast;
uniform float u_brightness;
uniform sampler2D u_lut;
uniform float u_lutSize;
uniform float u_lutOn;
varying vec2 v_uv;

vec3 rgb2hsv(vec3 c) {
  float cMax = max(c.r, max(c.g, c.b));
  float cMin = min(c.r, min(c.g, c.b));
  float d = cMax - cMin;
  float h = 0.0;
  if (d > 0.0001) {
    if (cMax == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (cMax == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  float s = cMax == 0.0 ? 0.0 : d / cMax;
  return vec3(h, s, cMax);
}
vec3 hsv2rgb(vec3 c) {
  float h = c.x * 6.0;
  float f = fract(h);
  float p = c.z * (1.0 - c.y);
  float q = c.z * (1.0 - f * c.y);
  float t = c.z * (1.0 - (1.0 - f) * c.y);
  if (h < 1.0) return vec3(c.z, t, p);
  if (h < 2.0) return vec3(q, c.z, p);
  if (h < 3.0) return vec3(p, c.z, t);
  if (h < 4.0) return vec3(p, q, c.z);
  if (h < 5.0) return vec3(t, p, c.z);
  return vec3(c.z, p, q);
}
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 uv = v_uv;
  if (u_mirror > 0.5) uv.x = 1.0 - uv.x;
  if (u_wave > 0.001) {
    uv.x += sin(uv.y * 18.0 + u_time * 0.008) * u_wave * 0.02;
  }
  if (u_shake > 0.001) {
    uv += vec2(sin(u_time * 47.0), cos(u_time * 61.0)) * u_shake * 0.01;
  }
  if (u_pixel > 0.001) {
    float blocks = mix(200.0, 12.0, u_pixel);
    uv = floor(uv * blocks) / blocks;
  }
  vec4 col = texture2D(u_tex, uv);
  if (u_rgbsplit > 0.001) {
    float o = u_rgbsplit * 0.008;
    col.r = texture2D(u_tex, uv + vec2(o, 0.0)).r;
    col.b = texture2D(u_tex, uv - vec2(o, 0.0)).b;
  }
  if (u_blur > 0.001) {
    vec2 px = vec2(u_blur * 0.004);
    col = (
      texture2D(u_tex, uv) +
      texture2D(u_tex, uv + vec2(px.x, 0.0)) +
      texture2D(u_tex, uv - vec2(px.x, 0.0)) +
      texture2D(u_tex, uv + vec2(0.0, px.y)) +
      texture2D(u_tex, uv - vec2(0.0, px.y))
    ) * 0.2;
  }
  if (u_sharpen > 0.001) {
    vec2 px = vec2(0.002);
    vec4 blur = (
      texture2D(u_tex, uv + vec2(px.x, 0.0)) +
      texture2D(u_tex, uv - vec2(px.x, 0.0)) +
      texture2D(u_tex, uv + vec2(0.0, px.y)) +
      texture2D(u_tex, uv - vec2(0.0, px.y))
    ) * 0.25;
    col = mix(col, col + (col - blur) * 2.0, u_sharpen);
  }
  if (u_emboss > 0.001) {
    vec2 px = vec2(0.003);
    float d = texture2D(u_tex, uv + px).r - texture2D(u_tex, uv - px).r;
    col.rgb = mix(col.rgb, vec3(0.5 + d), u_emboss);
  }
  if (u_bloom > 0.001) {
    vec2 px = vec2(0.006);
    vec4 soft = (
      texture2D(u_tex, uv) +
      texture2D(u_tex, uv + px) +
      texture2D(u_tex, uv - px)
    ) / 3.0;
    col.rgb += soft.rgb * u_bloom * 0.45;
  }
  if (abs(u_hue) > 0.001 || abs(u_tint) > 0.001) {
    vec3 hsv = rgb2hsv(col.rgb);
    hsv.x = fract(hsv.x + u_hue + u_tint * 0.08);
    col.rgb = hsv2rgb(hsv);
  }
  if (u_posterize > 0.001) {
    float levels = mix(32.0, 3.0, u_posterize);
    col.rgb = floor(col.rgb * levels + 0.5) / levels;
  }
  if (u_negate > 0.5) col.rgb = 1.0 - col.rgb;
  col.rgb = (col.rgb - 0.5) * (1.0 + u_contrast * 0.5) + 0.5 + u_brightness * 0.25;
  if (u_vignette > 0.001) {
    float d = distance(uv, vec2(0.5));
    col.rgb *= 1.0 - smoothstep(0.35, 0.95, d) * u_vignette;
  }
  if (u_grain > 0.001) {
    float g = (rand(uv * u_time) - 0.5) * u_grain * 0.35;
    col.rgb += g;
  }
  if (u_lutOn > 0.5) {
    float n = max(u_lutSize, 2.0);
    float blue = clamp(col.b, 0.0, 1.0) * (n - 1.0);
    float s0 = floor(blue);
    float s1 = min(s0 + 1.0, n - 1.0);
    float bf = fract(blue);
    float rr = clamp(col.r, 0.0, 1.0);
    float gg = clamp(col.g, 0.0, 1.0);
    vec2 uv0 = vec2((s0 * n + rr * (n - 1.0) + 0.5) / (n * n), (gg * (n - 1.0) + 0.5) / n);
    vec2 uv1 = vec2((s1 * n + rr * (n - 1.0) + 0.5) / (n * n), (gg * (n - 1.0) + 0.5) / n);
    vec3 lut0 = texture2D(u_lut, uv0).rgb;
    vec3 lut1 = texture2D(u_lut, uv1).rgb;
    col.rgb = mix(lut0, lut1, bf);
  }
  gl_FragColor = col;
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function fxAmounts(clip: TimelineClip | null) {
  let blur = 0;
  let vignette = clip?.color.vignette ?? 0;
  let hue = (clip?.color.hueShift ?? 0) / 360;
  let grain = 0;
  let pixel = 0;
  let shake = 0;
  let sharpen = clip?.color.sharpen ?? 0;
  let tint = (clip?.color.tint ?? 0) / 100;
  let negate = 0;
  let rgbsplit = 0;
  let posterize = 0;
  let mirror = 0;
  let wave = 0;
  let emboss = 0;
  let bloom = 0;
  const contrast = (clip?.color.contrast ?? 1) - 1;
  const brightness = (clip?.color.brightness ?? 1) - 1;
  for (const fx of clip?.effects || []) {
    if (!fx.enabled) continue;
    const a = Math.max(0, Math.min(100, fx.amount)) / 100;
    switch (fx.kind) {
      case "blur":
      case "motionblur":
      case "glow":
        blur = Math.max(blur, a);
        break;
      case "bloom":
        bloom = Math.max(bloom, a);
        break;
      case "vignette":
        vignette = Math.max(vignette, a);
        break;
      case "hue":
        hue += a;
        break;
      case "grain":
        grain = Math.max(grain, a);
        break;
      case "pixelate":
        pixel = Math.max(pixel, a);
        break;
      case "shake":
        shake = Math.max(shake, a);
        break;
      case "sharpen":
        sharpen = Math.max(sharpen, a);
        break;
      case "tint":
        tint += a * 0.5;
        break;
      case "negate":
        negate = 1;
        break;
      case "rgbsplit":
        rgbsplit = Math.max(rgbsplit, a);
        break;
      case "posterize":
        posterize = Math.max(posterize, a);
        break;
      case "mirror":
        mirror = 1;
        break;
      case "wave":
        wave = Math.max(wave, a);
        break;
      case "emboss":
        emboss = Math.max(emboss, a);
        break;
      case "shadow":
        vignette = Math.max(vignette, a * 0.4);
        break;
      default:
        break;
    }
  }
  return {
    blur,
    vignette,
    hue,
    grain,
    pixel,
    shake,
    sharpen,
    tint,
    negate,
    rgbsplit,
    posterize,
    mirror,
    wave,
    emboss,
    bloom,
    contrast,
    brightness,
  };
}

const U = [
  "u_time",
  "u_blur",
  "u_vignette",
  "u_hue",
  "u_grain",
  "u_pixel",
  "u_shake",
  "u_sharpen",
  "u_tint",
  "u_negate",
  "u_rgbsplit",
  "u_posterize",
  "u_mirror",
  "u_wave",
  "u_emboss",
  "u_bloom",
  "u_contrast",
  "u_brightness",
  "u_lutSize",
  "u_lutOn",
] as const;

/** GPU preview approximating the export effect stack. */
export function WebGLFxPreview({
  video,
  clip,
  enabled,
  lutUrl,
}: {
  video: HTMLVideoElement | null;
  clip: TimelineClip | null;
  enabled: boolean;
  /** Optional .cube LUT URL for live grade preview */
  lutUrl?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<{
    gl: WebGLRenderingContext;
    prog: WebGLProgram;
    tex: WebGLTexture;
    lutTex: WebGLTexture;
    uniforms: Record<string, WebGLUniformLocation | null>;
    lutLoc: WebGLUniformLocation | null;
    texLoc: WebGLUniformLocation | null;
  } | null>(null);
  const lutMeta = useRef<{ url: string; size: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const lutTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 2×2 identity placeholder
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      4,
      2,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([
        0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 0, 255, 0,
        255, 255, 255, 255, 255, 255, 255,
      ]),
    );
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of U) uniforms[name] = gl.getUniformLocation(prog, name);
    const texLoc = gl.getUniformLocation(prog, "u_tex");
    const lutLoc = gl.getUniformLocation(prog, "u_lut");
    gl.uniform1i(texLoc, 0);
    gl.uniform1i(lutLoc, 1);
    glRef.current = { gl, prog, tex, lutTex, uniforms, lutLoc, texLoc };
    return () => {
      glRef.current = null;
      lutMeta.current = null;
    };
  }, []);

  // Load .cube when lutUrl changes — never throw into React
  useEffect(() => {
    const state = glRef.current;
    if (!state) return;
    if (!lutUrl) {
      lutMeta.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { parseCubeLut, cubeToTextureRGBA } = await import("@/lib/cube-lut");
        const res = await fetch(lutUrl);
        if (!res.ok) return;
        const text = await res.text();
        const lut = parseCubeLut(text);
        if (cancelled) return;
        const packed = cubeToTextureRGBA(lut);
        const { gl, lutTex } = state;
        gl.bindTexture(gl.TEXTURE_2D, lutTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          packed.width,
          packed.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          packed.pixels,
        );
        lutMeta.current = { url: lutUrl, size: lut.size };
      } catch {
        lutMeta.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lutUrl]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = (t: number) => {
      const state = glRef.current;
      const canvas = canvasRef.current;
      const v = video;
      if (state && canvas && v && v.readyState >= 2 && v.videoWidth > 0) {
        const { gl, tex, lutTex, uniforms } = state;
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } catch {
          // empty / CORS
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, lutTex);
        const fx = fxAmounts(clip);
        const lutOn = lutMeta.current && lutUrl ? 1 : 0;
        gl.uniform1f(uniforms.u_time, t);
        gl.uniform1f(uniforms.u_blur, fx.blur);
        gl.uniform1f(uniforms.u_vignette, fx.vignette);
        gl.uniform1f(uniforms.u_hue, fx.hue);
        gl.uniform1f(uniforms.u_grain, fx.grain);
        gl.uniform1f(uniforms.u_pixel, fx.pixel);
        gl.uniform1f(uniforms.u_shake, fx.shake);
        gl.uniform1f(uniforms.u_sharpen, fx.sharpen);
        gl.uniform1f(uniforms.u_tint, fx.tint);
        gl.uniform1f(uniforms.u_negate, fx.negate);
        gl.uniform1f(uniforms.u_rgbsplit, fx.rgbsplit);
        gl.uniform1f(uniforms.u_posterize, fx.posterize);
        gl.uniform1f(uniforms.u_mirror, fx.mirror);
        gl.uniform1f(uniforms.u_wave, fx.wave);
        gl.uniform1f(uniforms.u_emboss, fx.emboss);
        gl.uniform1f(uniforms.u_bloom, fx.bloom);
        gl.uniform1f(uniforms.u_contrast, fx.contrast);
        gl.uniform1f(uniforms.u_brightness, fx.brightness);
        gl.uniform1f(uniforms.u_lutSize, lutMeta.current?.size ?? 2);
        gl.uniform1f(uniforms.u_lutOn, lutOn);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, clip, enabled, lutUrl]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="fx-gl-canvas" aria-hidden />;
}
