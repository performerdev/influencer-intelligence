/**
 * Particle "i" — one shader drives all three acts:
 *   1. copy:    points leave the solid "i" on a slight arc and assemble (top first, expo.out)
 *   2. idle:    looping simplex breathing + CPU spring offsets from the cursor
 *   3. scatter: on scroll the "i" splits into 10 clusters that land on the card signatures
 * Colors are written straight to the sRGB framebuffer (no tone mapping) so the
 * on-screen values are exactly the palette tokens.
 */

// Ashima Arts / Stefan Gustavson 3D simplex noise (MIT)
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

export const CLUSTERS = 10;

export const particleVertex = /* glsl */ `
uniform float uTime;
uniform float uCopy;      // 0..1 global copy progress
uniform float uScatter;   // 0..1 scroll progress
uniform float uBreath;    // 0..1 breathing enabled
uniform float uHeight;    // logo height (local units)
uniform float uSize;      // css px
uniform float uSigSize;   // css px once landed on a card
uniform float uDpr;
uniform vec3  uCamLocal;  // camera position in the group's local space
uniform vec3  uSlots[${CLUSTERS}];
uniform float uSlotR[${CLUSTERS}];
uniform float uAngles[${CLUSTERS}];
uniform float uDensity[${CLUSTERS}];
uniform float uTilt;

attribute vec3 aSource;   // matching point inside the solid "i"
attribute vec3 aNormal;
attribute vec4 aRand;     // x size, y copy delay (top first), z arc, w scatter delay
attribute float aCluster;
attribute float aLocalIndex;
attribute vec3 aLocal;    // position inside the cluster's signature (unit)
attribute vec3 aOffset;   // cursor spring offset (CPU)

varying float vAlpha;
varying float vLight;

${SIMPLEX}

vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z); }

void main(){
  const float PI = 3.14159265;

  // ── Act 1: the copy ───────────────────────────────────
  float t = clamp((uCopy - aRand.y * 0.58) / 0.42, 0.0, 1.0);
  float e = t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t);            // expo.out
  vec3 arc = vec3(0.0, 0.25 + aRand.z * 0.55, 0.8 + aRand.z * 1.6) * sin(PI * e);

  // ── Act 2: idle breathing (seamless 6s loop) ──────────
  float a = uTime * 6.2831853 / 6.0;
  vec3 q = position * 0.42 + vec3(cos(a), sin(a), 0.0) * 0.55;
  vec3 target = position + aNormal * snoise(q) * uHeight * 0.006 * uBreath + aOffset;
  vec3 hero = mix(aSource, target, e) + arc;

  // ── Act 3: scatter into 10 clusters ───────────────────
  int k = int(aCluster + 0.5);
  float s = clamp((uScatter - aRand.w * 0.3) / 0.7, 0.0, 1.0);
  float se = s < 0.5 ? 4.0 * s * s * s : 1.0 - pow(-2.0 * s + 2.0, 3.0) / 2.0; // power3.inOut
  vec3 loc = rotX(rotY(aLocal, uAngles[k]), uTilt);
  vec3 landed = uSlots[k] + loc * uSlotR[k];
  vec3 drift = vec3(
    snoise(position * 0.6 + 3.1),
    snoise(position * 0.6 + 7.3),
    snoise(position * 0.6 + 11.7)
  ) * uHeight * 0.09;
  vec3 p = mix(hero, landed, se) + drift * sin(PI * se);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // ── Shading ───────────────────────────────────────────
  vec3 view = normalize(uCamLocal - target);
  float facing = dot(aNormal, view);
  float heroAlpha = mix(0.2, 1.0, smoothstep(-0.25, 0.3, facing));  // back of the shell, dimmer
  float rim = 1.0 - abs(facing);                                     // silhouettes read brighter, like the logo
  float sigAlpha = 0.42 + 0.58 * (loc.z * 0.5 + 0.5);                 // front of each blob brighter
  float keep = aLocalIndex < uDensity[k] ? 1.0 : 1.0 - smoothstep(0.55, 0.95, se);

  vAlpha = mix(heroAlpha, sigAlpha, se) * smoothstep(0.0, 0.08, t) * keep;
  vLight = mix(rim * rim * 0.9, 0.15, se);
  gl_PointSize = mix(uSize * aRand.x, uSigSize, se) * uDpr;
}
`;

export const particleFragment = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
varying float vLight;
const vec3 PARTICLE = vec3(0.7255, 0.7216, 0.6980); // #B9B8B2
const vec3 CERAMIC  = vec3(0.9490, 0.9451, 0.9255); // #F2F1EC
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.18, d);
  gl_FragColor = vec4(mix(PARTICLE, CERAMIC, clamp(vLight, 0.0, 1.0)), vAlpha * soft * uOpacity);
}
`;
