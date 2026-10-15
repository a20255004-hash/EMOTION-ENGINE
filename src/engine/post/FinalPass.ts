import * as THREE from 'three';

/** Pase final: aberración cromática, giro de tono, saturación, viñeta, grano y fundido. */
export const FinalShader = {
  name: 'EmotionFinalShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.12 },
    uChromatic: { value: 0.1 },
    uSaturation: { value: 1 },
    uHue: { value: 0 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color('#000000') },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uChromatic;
    uniform float uSaturation; uniform float uHue; uniform float uFade; uniform vec3 uFadeColor; uniform vec2 uResolution;
    varying vec2 vUv;
    vec3 hueRotate(vec3 c, float a){
      const vec3 k = vec3(0.57735);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }
    void main(){
      vec2 d = vUv - 0.5;
      float ca = uChromatic * 0.012 * length(d);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * ca * 2.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d * ca * 2.0).b;
      col = hueRotate(col, uHue);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSaturation), 0.0);
      float vig = 1.0 - smoothstep(0.35, 0.95, length(d * vec2(1.15, 1.0)) * 1.25);
      col *= mix(1.0, vig, uVignette);
      float g = fract(sin(dot(vUv * uResolution + fract(uTime * 7.13) * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain * 0.14;
      col = mix(col, uFadeColor, clamp(uFade, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};
