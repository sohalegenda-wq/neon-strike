const $ = id => document.getElementById(id);
const KEY = 'neonstrike.profile.v1';
const RANKS = ['Silver', 'Gold Nova', 'Master Guardian', 'Legendary Eagle', 'Supreme', 'Global Elite'];
const AVATARS = ['🦊', '🐺', '🦅', '🐉', '💀', '🤖'];

export const Profile = {
  d: { nick: 'Player', avatar: '🦊', xp: 0, kills: 0, deaths: 0, credits: 0, skins: {} },
  load() { try { Object.assign(this.d, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {} },
  save() { localStorage.setItem(KEY, JSON.stringify(this.d)); },
  get level() { return Math.floor(this.d.xp / 100) + 1; },
  get rank() { return RANKS[Math.min(RANKS.length - 1, Math.floor((this.level - 1) / 3))]; },
  kill() { this.d.kills++; this.d.xp += 20; this.d.credits += 50; this.save(); },
  death() { this.d.deaths++; this.save(); }
};

export const HUD = {
  show(on) { $('hud').classList.toggle('on', on); },
  hp(v) { $('hp').textContent = Math.max(0, Math.ceil(v)); },
  ammo(t) { $('ammo').textContent = t; },
  score(t) { $('score').textContent = t; },
  msg(t) { $('msg').textContent = t; },
  killcam(on) { $('kc').style.display = on ? 'block' : 'none'; },
  hit() { const h = $('hit'); h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 120); },
  dmg() { const d = $('dmg'); d.style.opacity = .9; setTimeout(() => d.style.opacity = 0, 150); }
};

export function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }

export function initUI({ onPlay, onCustomMap, onSkin, defaultMapJson }) {
  Profile.load();
  document.querySelectorAll('.back').forEach(b => b.onclick = () => showScreen('menu'));
  $('bPlay').onclick = onPlay;
  $('bInv').onclick = () => { renderSkins(); showScreen('inv'); };
  $('bProf').onclick = () => { renderProfile(); showScreen('prof'); };
  $('bMap').onclick = () => { $('mapJson').value ||= defaultMapJson; showScreen('mapScr'); };
  $('mapGo').onclick = () => { try { onCustomMap(JSON.parse($('mapJson').value)); } catch (e) { alert('Ошибка JSON: ' + e.message); } };
  $('wSel').onchange = renderSkins;
  $('skinFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.onload = () => { onSkin($('wSel').value, null, img); }; img.src = URL.createObjectURL(f);
  };
  $('avaSel').innerHTML = AVATARS.map(a => `<option>${a}</option>`).join('');
  $('nick').oninput = e => { Profile.d.nick = e.target.value || 'Player'; Profile.save(); };
  $('avaSel').onchange = e => { Profile.d.avatar = e.target.value; Profile.save(); renderProfile(); };
  function renderSkins() {
    const w = $('wSel').value, cur = Profile.d.skins[w] || 'default';
    const bg = { default: '#3a3f4c', asimov: 'linear-gradient(#f5f5f5 40%,#ff7a00 40%)', dragonlore: 'linear-gradient(135deg,#1d5a2a,#d8b25a,#0d2e14)' };
    $('skins').innerHTML = Object.keys(bg).map(k => `<div class="skin ${k === cur ? 'sel' : ''}" data-k="${k}" title="${k}" style="background:${bg[k]}"></div>`).join('');
    $('skins').querySelectorAll('.skin').forEach(el => el.onclick = () => { Profile.d.skins[w] = el.dataset.k; Profile.save(); onSkin(w, el.dataset.k); renderSkins(); });
  }
  function renderProfile() {
    const d = Profile.d; $('ava').textContent = d.avatar; $('nick').value = d.nick; $('avaSel').value = d.avatar;
    $('stats').innerHTML = `Уровень ${Profile.level} · ${Profile.rank}<br>Убийства ${d.kills} · Смерти ${d.deaths} · K/D ${(d.kills / Math.max(1, d.deaths)).toFixed(2)}<br>Кредиты ${d.credits}`;
  }
}
