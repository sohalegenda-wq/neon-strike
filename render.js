import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Вставьте сюда прямые URL .glb/.gltf — до этого используются плейсхолдеры.
export const MODEL_URLS = { ak47: null, m4a1: null, knife: null, hands: null, terrorist: null, ct: null };

const Grade = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.25 }, contrast: { value: 1.1 }, tint: { value: new THREE.Vector3(1.03, 1, .95) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform sampler2D tDiffuse;uniform float sat,contrast;uniform vec3 tint;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(.299,.587,.114));vec3 r=mix(vec3(l),c.rgb,sat);r=(r-.5)*contrast+.5;gl_FragColor=vec4(r*tint,c.a);}'
};

export class AssetLoader {
  constructor() { this.gltf = new GLTFLoader(); this.cache = {}; }
  async get(key, placeholder) {
    const url = MODEL_URLS[key];
    if (!url) return placeholder();
    try { this.cache[key] ??= await this.gltf.loadAsync(url); return this.cache[key].scene.clone(true); }
    catch (e) { console.warn('Модель не загрузилась:', key, e); return placeholder(); }
  }
}

export class Skins {
  static tex(name, img) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    if (img) g.drawImage(img, 0, 0, 256, 256);
    else if (name === 'asimov') { g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#ff7a00'; for (let i = 0; i < 256; i += 64) g.fillRect(0, i, 256, 32); g.fillStyle = '#111'; g.fillRect(0, 120, 256, 16); }
    else if (name === 'dragonlore') { const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#1d5a2a'); gr.addColorStop(.5, '#d8b25a'); gr.addColorStop(1, '#0d2e14'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#0006'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 40, 0, 6.3); g.stroke(); } }
    else { g.fillStyle = '#3a3f4c'; g.fillRect(0, 0, 256, 256); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  static apply(obj, tex) {
    obj.traverse(m => { if (m.isMesh && (m.userData.skin || !m.userData.keep)) { m.material = m.material.clone(); m.material.map = tex; m.material.needsUpdate = true; } });
  }
}

export class Renderer {
  constructor() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    r.setSize(innerWidth, innerHeight); r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; document.body.prepend(r.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#9fb7d0'); this.scene.fog = new THREE.Fog('#9fb7d0', 30, 110);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .05, 200); this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#4a4034', .8));
    const sun = this.sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(30, 50, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -.0004;
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 140 }); this.scene.add(sun);
    const c = this.composer = new EffectComposer(r);
    c.addPass(new RenderPass(this.scene, this.camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .6, .9));
    c.addPass(new ShaderPass(Grade)); c.addPass(new OutputPass());
    addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); c.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    this.mapGroup = null; this.colliders = []; this.walls = [];
  }
  loadMap(cfg) {
    if (this.mapGroup) this.scene.remove(this.mapGroup);
    const g = this.mapGroup = new THREE.Group(); this.colliders = []; this.walls = [];
    const [W, D] = cfg.size || [60, 60];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#8a8372', roughness: .95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor); this.walls.push(floor);
    for (const b of cfg.blocks) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.s), new THREE.MeshStandardMaterial({ color: b.c || '#a89f8c', roughness: .85 }));
      m.position.set(...b.p); m.castShadow = m.receiveShadow = true; g.add(m); this.walls.push(m);
      this.colliders.push(new THREE.Box3().setFromObject(m));
    }
    this.scene.add(g); this.bounds = [W / 2 - .5, D / 2 - .5];
  }
  render() { this.composer.render(); }
}
