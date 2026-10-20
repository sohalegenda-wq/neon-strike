import * as THREE from 'three';
import { Renderer, AssetLoader, Skins } from './render.js';
import { Profile, HUD, initUI, showScreen } from './ui.js';

const DEFAULT_MAP = {
  size: [60, 60],
  blocks: [
    { p: [0, 2, -30], s: [60, 4, 1] }, { p: [0, 2, 30], s: [60, 4, 1] }, { p: [-30, 2, 0], s: [1, 4, 60] }, { p: [30, 2, 0], s: [1, 4, 60] },
    { p: [0, 1.5, 0], s: [8, 3, 8], c: '#7d8696' }, { p: [-14, 1.5, -10], s: [10, 3, 2], c: '#9a7b5a' }, { p: [14, 1.5, 10], s: [10, 3, 2], c: '#9a7b5a' },
    { p: [-12, 1, 14], s: [4, 2, 4], c: '#6f8b70' }, { p: [12, 1, -14], s: [4, 2, 4], c: '#6f8b70' }, { p: [0, .5, 16], s: [6, 1, 3], c: '#8a6f6f' }, { p: [0, .5, -16], s: [6, 1, 3], c: '#8a6f6f' }
  ],
  spawns: [[-24, -24], [24, 24], [-24, 24], [24, -24], [0, 24], [0, -24]],
  waypoints: [[-20, -20], [20, 20], [-20, 20], [20, -20], [0, 12], [0, -12], [-8, 0], [8, 0], [-22, 0], [22, 0]]
};

const WEAPONS = {
  ak47: { name: 'AK-47', dmg: 36, rate: .1, mag: 30, reload: 2.2, spread: .004, recoil: .012, auto: true, size: [.1, .14, .9] },
  m4a1: { name: 'M4A1', dmg: 31, rate: .09, mag: 30, reload: 2.0, spread: .003, recoil: .009, auto: true, size: [.09, .13, .8] },
  knife: { name: 'Нож', dmg: 55, rate: .5, mag: Infinity, reload: 0, spread: 0, recoil: 0, auto: false, size: [.03, .1, .35], range: 2.2 }
};
const SLOTS = ['ak47', 'm4a1', 'knife'];
const GOAL = 20, EYE = 1.6, EYE_C = 1.1, R = .35;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

// AABB-перемещение по осям: возвращает true, если упёрлись
function overlaps(p, h, boxes) {
  for (const b of boxes) if (p.x + R > b.min.x && p.x - R < b.max.x && p.z + R > b.min.z && p.z - R < b.max.z && p.y + h > b.min.y && p.y < b.max.y) return b;
  return null;
}

class Game {
  constructor() {
    this.r = new Renderer(); this.assets = new AssetLoader(); this.cam = this.r.camera;
    this.state = 'menu'; this.keys = {}; this.skinCfg = { ...Profile.d.skins }; this.skinImg = {};
    this.ray = new THREE.Raycaster(); this.clock = new THREE.Clock();
    this.hitboxes = []; this.bots = []; this.vm = new THREE.Group(); this.cam.add(this.vm);
    this.mapCfg = DEFAULT_MAP; this.r.loadMap(DEFAULT_MAP);
    this.bindInput(); this.loop();
  }
  bindInput() {
    addEventListener('keydown', e => { this.keys[e.code] = true; if (this.state !== 'play') return;
      if (e.code === 'KeyR') this.reload(); const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0) this.equip(SLOTS[i]);
      if (e.code === 'Escape') { }
    });
    addEventListener('keyup', e => this.keys[e.code] = false);
    addEventListener('mousedown', e => { if (this.state === 'play' && e.button === 0) { this.fire = true; if (!document.pointerLockElement) this.r.renderer.domElement.requestPointerLock(); } });
    addEventListener('mouseup', () => this.fire = false);
    addEventListener('mousemove', e => { if (this.state !== 'play' || !document.pointerLockElement) return;
      this.yaw -= e.movementX * .0022; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * .0022)); });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.state === 'play') { this.stop(); showScreen('menu'); } });
  }
  async start(mapCfg) {
    if (mapCfg) { this.mapCfg = mapCfg; this.r.loadMap(mapCfg); }
    ['hud'].forEach(() => 0); document.querySelectorAll('.screen').forEach(s => s.classList.remove('on')); HUD.show(true);
    this.clearBots(); this.bots = []; for (let i = 0; i < 5; i++) this.bots.push(await this.makeBot(i));
    this.kills = 0; this.hp = 100; this.crouch = false; this.vel = new THREE.Vector3(); this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.recoil = 0; this.cool = 0; this.reloading = 0; this.frames = []; this.replay = null;
    this.ammoState = {}; for (const k of SLOTS) this.ammoState[k] = WEAPONS[k].mag;
    await this.equip('ak47'); this.respawn(); this.state = 'play'; HUD.msg('');
    this.r.renderer.domElement.requestPointerLock();
  }
  stop() { this.state = 'menu'; HUD.show(false); this.fire = false; }
  clearBots() { for (const b of this.bots) this.r.scene.remove(b.mesh); }
  async makeBot(i) {
    const mesh = await this.assets.get(i % 2 ? 'ct' : 'terrorist', () => {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: i % 2 ? '#2f5fa8' : '#a8472f' });
      const body = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.1, .35), m); body.position.y = .95; body.userData.part = 'body';
      const legs = new THREE.Mesh(new THREE.BoxGeometry(.5, .4, .3), m); legs.position.y = .2; legs.userData.part = 'body';
      const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshStandardMaterial({ color: '#e0b890' })); head.position.y = 1.72; head.userData.part = 'head';
      [body, legs, head].forEach(x => { x.castShadow = true; g.add(x); }); return g;
    });
    this.r.scene.add(mesh);
    const b = { mesh, hp: 100, kills: 0, pos: mesh.position, wp: pick(this.mapCfg.waypoints), shoot: rnd(.5, 1.5), dead: 0 };
    mesh.traverse(o => { if (o.isMesh) { o.userData.bot = b; o.userData.part ??= 'body'; } });
    this.respawnBot(b); return b;
  }
  respawnBot(b) { const s = pick(this.mapCfg.spawns); b.pos.set(s[0], 0, s[1]); b.hp = 100; b.dead = 0; b.mesh.visible = true; }
  respawn() { const s = pick(this.mapCfg.spawns); this.pos.set(s[0], 0, s[1]); this.hp = 100; this.vel.set(0, 0, 0); HUD.hp(100); this.killer = null; }
  async equip(k) {
    this.weapon = k; this.vm.clear(); const w = WEAPONS[k];
    const g = await this.assets.get(k, () => { const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(...w.size), new THREE.MeshStandardMaterial({ color: '#888' })); body.userData.skin = true; g.add(body);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(.07, .18, .09), new THREE.MeshStandardMaterial({ color: '#222' })); grip.position.set(0, -.14, .2); grip.userData.keep = true; g.add(grip); return g; });
    g.position.set(.22, -.2, -.45); this.vm.add(g); this.vmObj = g; this.applySkin(k);
    this.flash = new THREE.PointLight('#ffd27a', 0, 6); this.flash.position.set(.22, -.15, -1); this.vm.add(this.flash);
    this.updateHud();
  }
  applySkin(k) { if (k !== this.weapon || !this.vmObj) return; Skins.apply(this.vmObj, Skins.tex(this.skinCfg[k] || 'default', this.skinImg[k])); }
  setSkin(k, name, img) { this.skinCfg[k] = name || 'custom'; this.skinImg[k] = name ? null : img; this.applySkin(k); }
  updateHud() { const w = WEAPONS[this.weapon]; HUD.ammo(w.mag === Infinity ? '∞' : `${this.ammoState[this.weapon]} / ${w.mag}`); HUD.score(`Вы ${this.kills} : ${Math.max(0, ...this.bots.map(b => b.kills))} лидер ботов · до ${GOAL}`); }
  reload() { const w = WEAPONS[this.weapon]; if (w.mag === Infinity || this.reloading) return; this.reloading = w.reload; HUD.ammo('...'); }

  shoot() {
    const w = WEAPONS[this.weapon];
    if (this.cool > 0 || this.reloading) return; if (this.ammoState[this.weapon] <= 0) return this.reload();
    this.cool = w.rate; if (w.mag !== Infinity) this.ammoState[this.weapon]--;
    const sp = w.spread * (1 + this.recoil * 40) * (this.vel.length() > 2 ? 2 : 1);
    const dir = new THREE.Vector3(rnd(-sp, sp), rnd(-sp, sp), -1).normalize().applyQuaternion(this.cam.quaternion);
    this.ray.set(this.cam.getWorldPosition(new THREE.Vector3()), dir); this.ray.far = w.range || 150;
    const targets = [...this.r.walls, ...this.bots.filter(b => b.dead <= 0).map(b => b.mesh)];
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (hit && hit.object.userData.bot) {
      const b = hit.object.userData.bot, head = hit.object.userData.part === 'head';
      b.hp -= w.dmg * (head ? 4 : 1); HUD.hit();
      if (b.hp <= 0 && b.dead <= 0) { b.dead = 2; b.mesh.visible = false; this.kills++; Profile.kill(); if (this.kills >= GOAL) this.end('ПОБЕДА'); }
    }
    this.recoil = Math.min(.08, this.recoil + w.recoil); this.pitch += w.recoil * .6; this.yaw += rnd(-.3, .3) * w.recoil;
    this.flash.intensity = 6; this.vmObj.position.z += .05; this.updateHud();
  }
  end(text) { this.state = 'over'; HUD.msg(text); document.exitPointerLock?.(); setTimeout(() => { HUD.show(false); this.state = 'menu'; showScreen('menu'); HUD.msg(''); }, 2500); }
  damage(n, bot) {
    this.hp -= n; HUD.hp(this.hp); HUD.dmg();
    if (this.hp <= 0 && this.state === 'play') { Profile.death(); bot.kills++; this.killer = bot; if (bot.kills >= GOAL) return this.end('ПОРАЖЕНИЕ'); this.startKillcam(); }
  }

  move(pos, v, h, dt) {
    const b = this.r.colliders; let grounded = false;
    pos.x += v.x * dt; if (overlaps(pos, h, b)) pos.x -= v.x * dt;
    pos.z += v.z * dt; if (overlaps(pos, h, b)) pos.z -= v.z * dt;
    pos.y += v.y * dt; const hit = overlaps(pos, h, b);
    if (hit) { if (v.y < 0) { pos.y = hit.max.y; grounded = true; } else pos.y -= v.y * dt; v.y = 0; }
    if (pos.y <= 0) { pos.y = 0; v.y = 0; grounded = true; }
    const [bx, bz] = this.r.bounds; pos.x = Math.max(-bx, Math.min(bx, pos.x)); pos.z = Math.max(-bz, Math.min(bz, pos.z));
    return grounded;
  }
  updatePlayer(dt) {
    const k = this.keys; this.crouch = !!(k.ControlLeft || k.KeyC);
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sp = this.crouch ? 2.5 : 5.5, c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const wx = (-sn * f + c * s), wz = (-c * f - sn * s), len = Math.hypot(wx, wz) || 1;
    this.vel.x = wx / len * sp * (f || s ? 1 : 0); this.vel.z = wz / len * sp * (f || s ? 1 : 0);
    this.vel.y -= 22 * dt;
    const h = this.crouch ? 1.2 : 1.8; const g = this.move(this.pos, this.vel, h, dt);
    if (g && k.Space && !this.crouch) this.vel.y = 7.5;
    this.eye = THREE.MathUtils.lerp(this.eye || EYE, this.crouch ? EYE_C : EYE, .2);
    this.cam.position.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
    this.cam.rotation.set(this.pitch + this.recoil, this.yaw, 0, 'YXZ');
    this.recoil = Math.max(0, this.recoil - dt * .08);
    this.cool -= dt; if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { this.ammoState[this.weapon] = WEAPONS[this.weapon].mag; this.updateHud(); } }
    if (this.fire && (WEAPONS[this.weapon].auto || !this.wasFire)) this.shoot(); this.wasFire = this.fire;
    this.flash.intensity *= .6; this.vmObj.position.z += (-.45 - this.vmObj.position.z) * .3;
  }
  updateBots(dt) {
    const pe = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    for (const b of this.bots) {
      if (b.dead > 0) { b.dead -= dt; if (b.dead <= 0) this.respawnBot(b); continue; }
      const eye = new THREE.Vector3(b.pos.x, 1.5, b.pos.z), to = pe.clone().sub(eye), dist = to.length();
      this.ray.set(eye, to.clone().normalize()); this.ray.far = dist;
      const see = dist < 40 && !this.ray.intersectObjects(this.r.walls).length;
      let tgt = see ? this.pos : { x: b.wp[0], z: b.wp[1] };
      const dx = tgt.x - b.pos.x, dz = tgt.z - b.pos.z, d = Math.hypot(dx, dz);
      if (!see && d < 1.5) b.wp = pick(this.mapCfg.waypoints);
      const spd = see && d < 9 ? 0 : 3.4; b.vel ??= new THREE.Vector3();
      b.vel.x = dx / d * spd; b.vel.z = dz / d * spd; b.vel.y -= 22 * dt;
      this.move(b.pos, b.vel, 1.8, dt);
      b.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI;
      b.shoot -= dt;
      if (see && b.shoot <= 0 && this.state === 'play') { b.shoot = rnd(.35, .8); if (Math.random() < Math.max(.12, .5 - dist / 90)) this.damage(rnd(6, 11), b); }
    }
  }

  // Killcam: кольцевой буфер ~3 секунд (180 кадров при 60 fps)
  record() {
    this.frames.push({ p: this.cam.position.clone(), q: this.cam.quaternion.clone(), b: this.bots.map(b => b.pos.clone()) });
    if (this.frames.length > 180) this.frames.shift();
  }
  startKillcam() {
    this.state = 'killcam'; this.replay = { i: 0, t: 0 }; HUD.killcam(true); this.vm.visible = false; document.exitPointerLock?.();
  }
  playReplay(dt) {
    const rp = this.replay, n = this.frames.length, speed = rp.i < n * .6 ? 1 : .25; // замедление в финале
    rp.i += dt * 60 * speed; const f = this.frames[Math.min(n - 1, Math.floor(rp.i))];
    this.cam.position.copy(f.p); this.cam.quaternion.copy(f.q); this.bots.forEach((b, j) => b.pos.copy(f.b[j]));
    if (rp.i >= n - 1) { rp.t += dt; if (rp.t > .8) { HUD.killcam(false); this.vm.visible = true; this.respawn(); this.frames = []; this.state = 'play'; this.r.renderer.domElement.requestPointerLock(); } }
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(.05, this.clock.getDelta());
    if (this.state === 'play') { this.updatePlayer(dt); this.updateBots(dt); this.record(); }
    else if (this.state === 'killcam') this.playReplay(dt);
    else if (this.state === 'menu') { const t = performance.now() / 6000; this.cam.position.set(Math.cos(t) * 22, 9, Math.sin(t) * 22); this.cam.lookAt(0, 1, 0); }
    this.r.render();
  };
}

const game = new Game();
initUI({
  onPlay: () => game.start(),
  onCustomMap: cfg => game.start(cfg),
  onSkin: (w, name, img) => game.setSkin(w, name, img),
  defaultMapJson: JSON.stringify(DEFAULT_MAP, null, 1)
});
