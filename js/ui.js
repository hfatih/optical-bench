/* Etkileşim: seçim, sürükleme, kamera kaydırma/yakınlaştırma (pan/zoom), paneller */
(function () {
  'use strict';
  const LT = window.LT;
  const S = LT.state;
  const ov = document.getElementById('overlay');
  const octx = ov.getContext('2d');
  const insp = document.getElementById('inspector');
  const settings = document.getElementById('settings');
  const hint = document.getElementById('hint');
  let odpr = 1;
  let drag = null;
  let pending = null;
  let currentZoom = 1.0;
  const pops = [];
  const syncers = [];
  const setSync = [];
  let reg = syncers;
  let updateTelescopeHud = () => {};

  LT.overlayResize = function (W, H) {
    odpr = Math.min(window.devicePixelRatio || 1, 2);
    ov.width = Math.round(W * odpr);
    ov.height = Math.round(H * odpr);
    S.overlayDirty = true;
  };

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const sel = () => LT.getItem(S.selId);

  // ---------- seçim ----------
  function select(id) {
    if (S.selId === id) return;
    S.selId = id;
    S.overlayDirty = true;
    renderInspector();
  }
  LT.onItemsChanged = () => {
    if (!sel()) S.selId = null;
    S.overlayDirty = true;
    renderInspector();
    updateTelescopeHud();
  };

  // ---------- tutamaçlar (handles) ----------
  function handles(it) {
    const g = it.geo;
    if (!g) return { rot: null, scl: null };
    const out = { rot: null, scl: null };
    if (it.kind === 'source') {
      out.rot = { x: it.x + g.dx * (g.bx1 + 38), y: it.y + g.dy * (g.bx1 + 38) };
    } else if (it.kind === 'bubble') {
      const a = Math.PI / 4;
      const d = Math.max(g.ax, g.ay) + 16;
      out.scl = { x: g.cx + Math.cos(a) * d, y: g.cy + Math.sin(a) * d };
    } else if (it.kind === 'protractor') {
      const a = it.rot - Math.PI / 2;
      const r = (it.radius || 110) * it.scale;
      out.rot = { x: it.x + Math.cos(a) * (r + 20), y: it.y + Math.sin(a) * (r + 20) };
      out.scl = { x: it.x + Math.cos(Math.PI / 4) * (r + 14), y: it.y + Math.sin(Math.PI / 4) * (r + 14) };
    } else {
      const rad = g.R || 60;
      const a = it.rot - Math.PI / 2;
      out.rot = { x: it.x + Math.cos(a) * (rad + 32), y: it.y + Math.sin(a) * (rad + 32) };
      const b = Math.PI / 4;
      out.scl = { x: it.x + Math.cos(b) * (rad + 18), y: it.y + Math.sin(b) * (rad + 18) };
    }
    return out;
  }

  function hitHandle(it, x, y) {
    const h = handles(it);
    if (h.rot && Math.hypot(x - h.rot.x, y - h.rot.y) < 14) return 'rot';
    if (h.scl && Math.hypot(x - h.scl.x, y - h.scl.y) < 14) return 'scl';
    return null;
  }

  function snap(val, step) {
    return Math.round(val / step) * step;
  }

  // ---------- kamera gezinme (pan & zoom) ----------
  function zoomScene(cx, cy, factor) {
    const targetZoom = LT.clamp(currentZoom * factor, 0.15, 3.5);
    const actualFactor = targetZoom / currentZoom;
    if (Math.abs(actualFactor - 1) < 0.001) return;
    const oldZoom = currentZoom;
    currentZoom = targetZoom;

    for (const it of S.items) {
      it.x = cx + (it.x - cx) * actualFactor;
      it.y = cy + (it.y - cy) * actualFactor;
      if (it._baseScale === undefined) it._baseScale = it.scale / oldZoom;
      it.scale = it._baseScale * targetZoom;
      if (it._baseSpacing !== undefined) it.raySpacing = it._baseSpacing * targetZoom;
      else if (it.raySpacing !== undefined) { it._baseSpacing = it.raySpacing / oldZoom; it.raySpacing = it._baseSpacing * targetZoom; }
      if (it._baseWidth !== undefined) it.width = it._baseWidth * targetZoom;
      else if (it.width !== undefined) { it._baseWidth = it.width / oldZoom; it.width = it._baseWidth * targetZoom; }
    }
    for (const it of S.items) {
      LT.buildGeo(it, S.time);
    }
    updateZoomDisplay();
    LT.glassChanged();
    LT.touch(3);
    S.overlayDirty = true;
  }

  function resetZoom() {
    if (S.items.length === 0) {
      currentZoom = 1.0;
      updateZoomDisplay();
      return;
    }
    const factor = 1.0 / currentZoom;
    const cx = S.W / 2;
    const cy = S.H / 2;
    currentZoom = 1.0;
    for (const it of S.items) {
      it.x = cx + (it.x - cx) * factor;
      it.y = cy + (it.y - cy) * factor;
      if (it._baseScale !== undefined) it.scale = it._baseScale;
      if (it._baseSpacing !== undefined) it.raySpacing = it._baseSpacing;
      if (it._baseWidth !== undefined) it.width = it._baseWidth;
      LT.buildGeo(it, S.time);
    }
    centerScene();
    updateZoomDisplay();
    LT.glassChanged();
    LT.touch(3);
    S.overlayDirty = true;
  }

  function centerScene() {
    if (S.items.length === 0) return;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const it of S.items) {
      minX = Math.min(minX, it.x);
      maxX = Math.max(maxX, it.x);
      minY = Math.min(minY, it.y);
      maxY = Math.max(maxY, it.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const dx = S.W / 2 - cx;
    const dy = S.H / 2 - cy;
    for (const it of S.items) {
      it.x += dx;
      it.y += dy;
    }
    LT.glassChanged();
    S.overlayDirty = true;
  }

  function updateZoomDisplay() {
    const z = document.getElementById('zoomVal');
    if (z) z.textContent = Math.round(currentZoom * 100) + '%';
  }

  // ---------- fare ve dokunma etkileşimleri ----------
  function beginDrag(it, x, y) {
    drag = { type: 'move', id: it.id, ox: it.x - x, oy: it.y - y };
    ov.style.cursor = 'grabbing';
  }

  ov.addEventListener('pointerdown', (e) => {
    fadeHint();
    closeSettings();
    const x = e.clientX;
    const y = e.clientY;
    const cur = sel();

    if (cur) {
      const h = hitHandle(cur, x, y);
      if (h === 'rot') {
        drag = { type: 'rot', id: cur.id };
        ov.style.cursor = 'grabbing';
        return;
      }
      if (h === 'scl') {
        const c = cur.kind === 'bubble' ? { x: cur.geo.cx, y: cur.geo.cy } : cur;
        drag = { type: 'scl', id: cur.id, d0: Math.hypot(x - c.x, y - c.y) || 1, s0: cur.scale };
        ov.style.cursor = 'nwse-resize';
        return;
      }
    }

    const it = LT.pick(x, y);
    if (it) {
      select(it.id);
      LT.bringToFront(it);
      beginDrag(it, x, y);
    } else {
      // Boş alana tıklandı: Masayı kaydırma (Pan)
      select(null);
      drag = { type: 'pan', lastX: x, lastY: y };
      ov.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('pointermove', (e) => {
    const x = e.clientX;
    const y = e.clientY;

    // Araç paletinden masaya sürükleme
    if (pending && !drag) {
      if (Math.hypot(x - pending.startX, y - pending.startY) > 8) {
        pending.dragged = true;
        const it = spawn(pending.type, x, y);
        beginDrag(it, x, y);
        drag.ox = 0;
        drag.oy = 0;
        pending = null;
      }
    }

    if (drag) {
      if (drag.type === 'pan') {
        const dx = x - drag.lastX;
        const dy = y - drag.lastY;
        drag.lastX = x;
        drag.lastY = y;
        for (const it of S.items) {
          it.x += dx;
          it.y += dy;
        }
        LT.glassChanged();
        S.overlayDirty = true;
        ov.style.cursor = 'grabbing';
        return;
      }

      const it = LT.getItem(drag.id);
      if (!it) return;
      if (drag.type === 'move') {
        let nx = x + drag.ox;
        let ny = y + drag.oy;
        if (S.set.snapGrid || e.shiftKey) {
          nx = snap(nx, 38);
          ny = snap(ny, 38);
        }
        it.x = LT.clamp(nx, -200, S.W + 200);
        it.y = LT.clamp(ny, -200, S.H + 200);
      } else if (drag.type === 'rot') {
        let a = Math.atan2(y - it.y, x - it.x) - (it.kind === 'source' ? 0 : -Math.PI / 2);
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        it.rot = a;
      } else if (drag.type === 'scl') {
        const c = it.kind === 'bubble' ? { x: it.geo.cx, y: it.geo.cy } : it;
        it.scale = LT.clamp((drag.s0 * Math.hypot(x - c.x, y - c.y)) / drag.d0, 0.35, 3.2);
      }
      LT.glassChanged();
      syncInspector();
      return;
    }

    if (e.target !== ov) return;

    const cur = sel();
    let cursor = 'default';
    let hid = null;
    if (cur && hitHandle(cur, x, y)) cursor = hitHandle(cur, x, y) === 'rot' ? 'grab' : 'nwse-resize';
    else {
      const it = LT.pick(x, y);
      if (it) {
        hid = it.id;
        cursor = 'grab';
      }
    }
    ov.style.cursor = cursor;
    if (hid !== S.hoverId) {
      S.hoverId = hid;
      S.overlayDirty = true;
    }
  });

  function endDrag() {
    if (pending) {
      // Tek tıkla ekleme: sadece 1 tane spawn edilir!
      spawn(pending.type);
      pending = null;
    }
    if (drag) {
      drag = null;
      ov.style.cursor = 'default';
      S.overlayDirty = true;
      updateTelescopeHud();
    }
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Çift tık: boş alandaysa ortala, köpükteyse patlat
  ov.addEventListener('dblclick', (e) => {
    const it = LT.pick(e.clientX, e.clientY);
    if (it && it.kind === 'bubble') {
      popBubble(it);
    } else if (!it) {
      centerScene();
    }
  });
  ov.addEventListener('contextmenu', (e) => e.preventDefault());

  // Fare Tekerleği: Varsayılan olarak her zaman Kamerayı Yakınlaştır/Uzaklaştır (Zoom)
  // Bir nesneyi tekerlekle döndürmek yalnızca Shift tuşu basılıyken ve fare nesne üzerindeyken çalışır
  ov.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      fadeHint();
      if (e.shiftKey) {
        const it = LT.pick(e.clientX, e.clientY);
        if (it && it.kind !== 'bubble') {
          it.rot += (e.deltaY || e.deltaX) * 0.0028;
          LT.glassChanged();
          syncInspector();
          return;
        }
      }
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomScene(e.clientX, e.clientY, factor);
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === '0') {
      resetZoom();
      e.preventDefault();
      return;
    }
    const it = sel();
    if (!it) {
      if (e.key === 'c' || e.key === 'C') centerScene();
      return;
    }
    let used = true;
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'd' || e.key === 'D') duplicate();
    else if (e.key === 'ArrowLeft') it.x -= step;
    else if (e.key === 'ArrowRight') it.x += step;
    else if (e.key === 'ArrowUp') it.y -= step;
    else if (e.key === 'ArrowDown') it.y += step;
    else if (e.key === 'q' || e.key === 'Q') it.rot -= 0.05;
    else if (e.key === 'e' || e.key === 'E') it.rot += 0.05;
    else if (e.key === '+' || e.key === '=') it.scale = LT.clamp(it.scale * 1.05, 0.2, 4.0);
    else if (e.key === '-') it.scale = LT.clamp(it.scale / 1.05, 0.2, 4.0);
    else used = false;
    if (used) {
      e.preventDefault();
      LT.glassChanged();
      syncInspector();
    }
  });

  function fadeHint() {
    if (hint) hint.classList.add('gone');
  }

  // ---------- nesne ekleme ve yönetim ----------
  function freeSpot(type) {
    let best = null;
    let bestD = -1;
    const isSrc = type === 'beam' || type === 'point' || type === 'laser' || type === 'multibeam';
    for (let i = 0; i < 40; i++) {
      const x = S.W * (isSrc ? 0.12 + Math.random() * 0.14 : 0.35 + Math.random() * 0.35);
      const y = S.H * (0.28 + Math.random() * 0.44);
      let d = 1e9;
      for (const it of S.items) d = Math.min(d, Math.hypot(it.x - x, it.y - y));
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    return best || [S.W * 0.5, S.H * 0.5];
  }

  function spawn(type, x, y) {
    if (x === undefined) {
      const p = freeSpot(type);
      x = p[0];
      y = p[1];
    }
    const it = LT.newItem(type, x, y);
    if (currentZoom !== 1.0) {
      if (it._baseScale === undefined) it._baseScale = it.scale;
      it.scale = it._baseScale * currentZoom;
      if (it.raySpacing !== undefined) {
        if (it._baseSpacing === undefined) it._baseSpacing = it.raySpacing;
        it.raySpacing = it._baseSpacing * currentZoom;
      }
      if (it.width !== undefined) {
        if (it._baseWidth === undefined) it._baseWidth = it.width;
        it.width = it._baseWidth * currentZoom;
      }
      LT.buildGeo(it, S.time);
    }
    select(it.id);
    return it;
  }

  function removeSel() {
    const it = sel();
    if (!it) return;
    LT.removeItem(it.id);
    renderInspector();
  }

  function duplicate() {
    const it = sel();
    if (!it) return;
    const c = LT.newItem(it.type, it.x + 40, it.y + 40, {
      rot: it.rot,
      scale: it.scale,
      _baseScale: it._baseScale !== undefined ? it._baseScale : it.scale,
      mat: it.mat,
      apex: it.apex,
      ptype: it.ptype,
      ltype: it.ltype,
      concave: it.concave,
      f: it.f,
      mtype: it.mtype,
      refl: it.refl,
      mlen: it.mlen,
      arcH: it.arcH,
      hole: it.hole,
      R: it.R,
      bw: it.bw,
      bh: it.bh,
      radius: it.radius,
      slen: it.slen,
      awidth: it.awidth,
      gap: it.gap,
      swidth: it.swidth,
      sheight: it.sheight,
      rlen: it.rlen,
      size: it.size,
      width: it.width,
      _baseWidth: it._baseWidth !== undefined ? it._baseWidth : it.width,
      spread: it.spread,
      mono: it.mono,
      lam: it.lam,
      power: it.power,
      rayCount: it.rayCount,
      raySpacing: it.raySpacing,
      _baseSpacing: it._baseSpacing !== undefined ? it._baseSpacing : it.raySpacing,
      thick: it.thick,
      ratio: it.ratio,
    });
    select(c.id);
  }

  function popBubble(it) {
    if (it.popT > 0) return;
    it.popT = 0.001;
    const g = it.geo;
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 150;
      pops.push({
        x: g.cx + Math.cos(a) * g.ax * 0.95,
        y: g.cy + Math.sin(a) * g.ay * 0.95,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 20,
        life: 0.5 + Math.random() * 0.5,
        age: 0,
        hue: Math.random() * 360,
        r: 1 + Math.random() * 2.2,
      });
    }
    if (S.selId === it.id) select(null);
    S.overlayDirty = true;
    LT.touch(3);
  }
  LT.popBubble = popBubble;

  // ---------- araç paleti (dock) tek tıkla ekleme (BUG FIX: SADECE 1 KEZ SPAWN EDER) ----------
  document.querySelectorAll('.tool').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fadeHint();
      closeSettings();
      pending = { type: b.dataset.add, startX: e.clientX, startY: e.clientY, dragged: false };
    });
  });

  // Kategori Sekmeleri (Dock Filtresi)
  document.querySelectorAll('.dtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dtab').forEach((t) => t.classList.remove('on'));
      tab.classList.add('on');
      const cat = tab.dataset.cat;
      document.querySelectorAll('#dock .grp').forEach((grp) => {
        if (cat === 'all' || grp.dataset.cat === cat) {
          grp.classList.remove('hidden');
        } else {
          grp.classList.add('hidden');
        }
      });
    });
  });

  // Dock Küçült/Büyüt Butonu
  const btnToggleDock = document.getElementById('btnToggleDock');
  const dock = document.getElementById('dock');
  if (btnToggleDock && dock) {
    btnToggleDock.addEventListener('click', () => {
      dock.classList.toggle('minimized');
      btnToggleDock.classList.toggle('folded');
      btnToggleDock.title = dock.classList.contains('minimized') ? 'Araç Paletini Göster' : 'Araç Paletini Gizle';
    });
  }

  // ---------- hazır sahneler ----------
  const sceneBtns = document.querySelectorAll('#scenes button');
  sceneBtns.forEach((b) => {
    b.addEventListener('click', () => {
      LT.loadPreset(b.dataset.scene);
      sceneBtns.forEach((x) => x.classList.toggle('on', x === b));
      history.replaceState(null, '', '#' + b.dataset.scene);
      currentZoom = 1.0;
      updateZoomDisplay();
      renderInspector();
      updateTelescopeHud(b.dataset.scene);
    });
  });

  // ---------- kontroller ve arayüz elemanları ----------
  function slider(label, min, max, step, get, set, fmt, cls) {
    const r = el('div', 'row');
    r.innerHTML = '<label><span>' + label + '</span><output></output></label>';
    const out = r.querySelector('output');
    const inp = el('input', cls || '');
    inp.type = 'range';
    inp.min = min;
    inp.max = max;
    inp.step = step;
    const upd = () => {
      const v = get();
      inp.value = v;
      out.textContent = fmt ? fmt(v) : v;
      inp.style.setProperty('--p', ((v - min) / (max - min)) * 100 + '%');
    };
    inp.addEventListener('input', () => {
      set(parseFloat(inp.value));
      upd();
    });
    r.appendChild(inp);
    reg.push(upd);
    upd();
    return r;
  }

  function seg(label, opts, get, set) {
    const r = el('div', 'row');
    if (label) r.appendChild(el('div', 'lbl', '<span>' + label + '</span>'));
    const s = el('div', 'seg');
    const btns = opts.map((o) => {
      const b = el('button', '', o.t);
      b.addEventListener('click', () => {
        set(o.v);
        upd();
      });
      s.appendChild(b);
      return b;
    });
    const upd = () => opts.forEach((o, i) => btns[i].classList.toggle('on', get() === o.v));
    reg.push(upd);
    upd();
    r.appendChild(s);
    return r;
  }

  function toggle(label, get, set) {
    const t = el('div', 'toggle', '<span>' + label + '</span><i></i>');
    const upd = () => t.classList.toggle('on', !!get());
    t.addEventListener('click', () => {
      set(!get());
      upd();
    });
    reg.push(upd);
    upd();
    return t;
  }

  function btn(text, cls, fn) {
    const b = el('button', 'btn ' + (cls || ''), text);
    b.addEventListener('click', fn);
    return b;
  }

  const MATS = [
    { v: 'su', t: 'Su (1.33)' },
    { v: 'akrilik', t: 'Pleksi (1.49)' },
    { v: 'kron', t: 'Kron (1.52)' },
    { v: 'flint', t: 'Flint (1.62)' },
    { v: 'agir_flint', t: 'Ağır Flint (1.75)' },
    { v: 'elmas', t: 'Elmas (2.42)' },
  ];

  const changed = () => {
    LT.glassChanged();
    updateTelescopeHud();
  };

  function syncInspector() {
    for (const f of syncers) f();
  }

  // ---------- müfettiş paneli (inspector) ----------
  function renderInspector() {
    reg = syncers;
    syncers.length = 0;
    const it = sel();
    if (!it) {
      insp.classList.add('hidden');
      insp.innerHTML = '';
      return;
    }
    insp.classList.remove('hidden');
    insp.innerHTML = '';

    const isSrc = it.kind === 'source';
    const isMirror = it.kind === 'mirror';
    const isSensor = it.kind === 'sensor';
    const dotCol = isSrc ? '#ffd277' : isMirror ? '#e6f3ff' : isSensor ? '#00e5ff' : it.kind === 'bubble' ? '#c7a0ff' : '#9ad7ff';

    const h3 = el('h3', '', '<span class="dot" style="background:' + dotCol + ';box-shadow:0 0 12px ' + dotCol + '"></span>' + (LT.NAMES[it.type] || 'Optik Eleman'));
    insp.appendChild(h3);

    // Işık Kaynağı Ayarları
    if (isSrc) {
      if (it.stype === 'beam') {
        insp.appendChild(slider('Huzme Genişliği', 4, 300, 1, () => it.width, (v) => { it.width = v; changed(); }, (v) => Math.round(v) + ' px'));
      } else if (it.stype === 'multibeam') {
        insp.appendChild(slider('Işın Sayısı', 3, 9, 2, () => it.rayCount || 5, (v) => { it.rayCount = Math.round(v); changed(); }, (v) => Math.round(v) + ' ışın'));
        insp.appendChild(slider('Işın Aralığı', 8, 40, 1, () => it.raySpacing || 18, (v) => { it.raySpacing = v; changed(); }, (v) => Math.round(v) + ' px'));
      } else if (it.stype === 'point') {
        insp.appendChild(slider('Açıklık Açısı', 10, 360, 1, () => it.spread, (v) => { it.spread = v; changed(); }, (v) => Math.round(v) + '°'));
      }

      if (it.stype !== 'laser' && it.stype !== 'multibeam') {
        insp.appendChild(seg('Işık Türü', [{ v: false, t: 'Beyaz Spektrum' }, { v: true, t: 'Tek Renk (Lazer)' }], () => it.mono, (v) => { it.mono = v; LT.hardReset(); renderInspector(); }));
      }

      if (it.mono || it.stype === 'laser' || it.stype === 'multibeam') {
        insp.appendChild(slider('Dalga Boyu (λ)', 0, 320, 1, () => 700 - it.lam, (v) => { it.lam = 700 - v; changed(); }, () => LT.lamName(it.lam), 'hue'));
        const qRow = el('div', 'seg');
        [
          { t: '633nm', v: 633 },
          { t: '532nm', v: 532 },
          { t: '488nm', v: 488 },
          { t: '405nm', v: 405 },
        ].forEach((q) => {
          const qb = el('button', '', q.t);
          qb.addEventListener('click', () => {
            it.lam = q.v;
            changed();
            syncInspector();
          });
          qRow.appendChild(qb);
        });
        insp.appendChild(qRow);
      }

      insp.appendChild(slider('Optik Güç', 0.2, 3.5, 0.05, () => it.power, (v) => { it.power = v; changed(); }, (v) => v.toFixed(2) + ' W'));
      insp.appendChild(slider('Yön Açısı', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Ayna Ayarları
    else if (isMirror) {
      insp.appendChild(seg('Ayna Tipi', [
        { v: 'flat', t: 'Düz' },
        { v: 'concave', t: 'Çukur' },
        { v: 'convex', t: 'Tümsek' },
      ], () => it.mtype, (v) => { it.mtype = v; LT.hardReset(); renderInspector(); }));

      if (it.mtype !== 'flat') {
        insp.appendChild(slider('Odak Uzaklığı (f)', 60, 400, 5, () => it.f || 180, (v) => { it.f = v; it.R = 2 * v; changed(); }, (v) => Math.round(v) + ' px'));
        const fInfo = el('p', 'note', 'Eğrilik Yarıçapı R = 2f = ' + Math.round((it.f || 180) * 2) + ' px');
        insp.appendChild(fInfo);
        if (it.mtype === 'concave') {
          insp.appendChild(slider('Merkezi Delik (Cassegrain)', 0, 120, 2, () => it.hole || 0, (v) => { it.hole = v; changed(); }, (v) => v === 0 ? 'Yok (Tam Yüzey)' : Math.round(v) + ' px'));
        }
      } else {
        insp.appendChild(slider('Ayna Uzunluğu', 80, 360, 5, () => it.mlen || 170, (v) => { it.mlen = v; changed(); }, (v) => Math.round(v) + ' px'));
      }
      insp.appendChild(slider('Yansıtıcılık (R)', 0.8, 1.0, 0.01, () => it.refl !== undefined ? it.refl : 0.98, (v) => { it.refl = v; changed(); }, (v) => Math.round(v * 100) + '%'));
      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Mercek Ayarları
    else if (it.kind === 'lens') {
      insp.appendChild(seg('Mercek Geometrisi', [
        { v: 'biconvex', t: 'İki Dışbükey' },
        { v: 'planoconvex', t: 'Düz-Dışbükey' },
        { v: 'biconcave', t: 'İçbükey' },
      ], () => it.ltype || (it.concave ? 'biconcave' : 'biconvex'), (v) => {
        it.ltype = v;
        it.concave = v === 'biconcave';
        LT.hardReset();
      }));

      insp.appendChild(seg('Malzeme', MATS, () => it.mat || 'kron', (v) => { it.mat = v; LT.hardReset(); }));
      insp.appendChild(slider('Odak Uzaklığı (f)', 70, 500, 5, () => it._baseF || it.f, (v) => { it._baseF = v; it.f = v * currentZoom; changed(); }, (v) => Math.round(v) + ' px'));

      const dioptEl = el('p', 'note', '');
      syncers.push(() => {
        const m = LT.MATERIALS[it.mat] || LT.MATERIALS.kron;
        const diopt = (1000 / (it._baseF || it.f || 200)).toFixed(1);
        dioptEl.textContent = 'n = ' + m.nD.toFixed(3) + ' · Optik Güç: ' + (it.concave ? '-' : '+') + diopt + ' D';
      });
      syncers[syncers.length - 1]();
      insp.appendChild(dioptEl);

      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Prizma Ayarları
    else if (it.kind === 'prism') {
      insp.appendChild(seg('Prizma Tipi', [
        { v: 'equilateral', t: 'Eşkenar / İkizkenar' },
        { v: 'right', t: 'Dik Açılı (90°)' },
      ], () => it.ptype || 'equilateral', (v) => { it.ptype = v; LT.hardReset(); renderInspector(); }));

      insp.appendChild(seg('Malzeme', MATS, () => it.mat || 'flint', (v) => { it.mat = v; LT.hardReset(); }));
      if (it.ptype !== 'right') {
        insp.appendChild(slider('Tepe Açısı (A)', 20, 90, 1, () => it.apex || 60, (v) => { it.apex = v; changed(); }, (v) => Math.round(v) + '°'));
      }
      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Cam Blok ve D-Blok
    else if (it.kind === 'block' || it.kind === 'dblock') {
      insp.appendChild(seg('Malzeme', MATS, () => it.mat || 'kron', (v) => { it.mat = v; LT.hardReset(); }));
      const critEl = el('p', 'note', '');
      syncers.push(() => {
        const m = LT.MATERIALS[it.mat] || LT.MATERIALS.kron;
        const thetaC = ((Math.asin(1 / m.nD) * 180) / Math.PI).toFixed(1);
        critEl.innerHTML = 'n = ' + m.nD.toFixed(3) + '<br><b>Kritik Açı θc = ' + thetaC + '°</b> (Tam İç Yansıma)';
      });
      syncers[syncers.length - 1]();
      insp.appendChild(critEl);

      if (it.kind === 'block') {
        insp.appendChild(slider('Genişlik', 80, 360, 5, () => it._baseBw || it.bw || 180, (v) => { it._baseBw = v; it.bw = v * currentZoom; changed(); }, (v) => Math.round(v) + ' px'));
        insp.appendChild(slider('Kalınlık', 40, 200, 5, () => it._baseBh || it.bh || 95, (v) => { it._baseBh = v; it.bh = v * currentZoom; changed(); }, (v) => Math.round(v) + ' px'));
      } else {
        insp.appendChild(slider('Yarıçap (R)', 60, 240, 5, () => it._baseRadius || it.radius || 105, (v) => { it._baseRadius = v; it.radius = v * currentZoom; changed(); }, (v) => Math.round(v) + ' px'));
      }
      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Işın Bölücü (Beam Splitter)
    else if (it.kind === 'splitter') {
      insp.appendChild(seg('Bölme Oranı', [
        { v: 0.5, t: '50 / 50' },
        { v: 0.7, t: '70 / 30' },
        { v: 0.3, t: '30 / 70' },
      ], () => it.ratio || 0.5, (v) => { it.ratio = v; changed(); }));
      insp.appendChild(slider('Uzunluk', 80, 260, 5, () => it._baseMlen || it.slen || 140, (v) => { it._baseMlen = v; it.slen = v * currentZoom; changed(); }, (v) => Math.round(v) + ' px'));
      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Perde / Ekran
    else if (it.kind === 'screen') {
      insp.appendChild(slider('Perde Genişliği', 100, 420, 5, () => it._baseMlen || it.slen || 210, (v) => { it._baseMlen = v; it.slen = v * currentZoom; changed(); }, (v) => Math.round(v) + ' px'));
      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Diyafram / Yarık (Aperture / Slit)
    else if (it.kind === 'aperture') {
      insp.appendChild(slider('Yarık Açıklığı', 4, 120, 1, () => it.gap || 34, (v) => { it.gap = v; changed(); }, (v) => Math.round(v) + ' px'));
      insp.appendChild(slider('Engel Genişliği', 100, 360, 5, () => it.awidth || 210, (v) => { it.awidth = v; changed(); }, (v) => Math.round(v) + ' px'));
      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Optik Güç Sensörü / Spektrometre
    else if (isSensor) {
      const liveCard = el('div', 'row card', '');
      liveCard.style.padding = '10px';
      liveCard.style.background = 'rgba(0, 40, 70, 0.4)';

      syncers.push(() => {
        const d = it.sensorData || { power: 0, lamSum: 0, hits: 0 };
        const p = (d.power * 2.5).toFixed(1);
        const l = d.hits > 0 ? Math.round(d.lamSum / Math.max(0.001, d.power / 10)) : 0;
        liveCard.innerHTML =
          '<div style="font-size:11.5px;color:#9ad7ff;font-weight:600;margin-bottom:4px;">Canlı Optik Ölçüm</div>' +
          '<div style="font-size:15px;color:#fff;font-family:monospace;">⚡ ' + p + ' mW</div>' +
          (l > 0 ? '<div style="font-size:11px;color:#e2ecf9;margin-top:2px;">🌈 ' + LT.lamName(l) + '</div>' : '<div style="font-size:11px;color:#7a8a9e;margin-top:2px;">Işık bekleniyor...</div>');
      });
      syncers[syncers.length - 1]();
      insp.appendChild(liveCard);

      insp.appendChild(slider('Döndür', 0, 360, 1, () => ((((it.rot * 180) / Math.PI) % 360) + 360) % 360, (v) => { it.rot = (v * Math.PI) / 180; changed(); }, (v) => Math.round(v) + '°'));
    }

    // Sabun Köpüğü
    else if (it.kind === 'bubble') {
      insp.appendChild(slider('Boyut', 0.4, 2.8, 0.05, () => it._baseScale || it.scale, (v) => { it._baseScale = v; it.scale = v * currentZoom; changed(); }, (v) => '×' + v.toFixed(2)));
      insp.appendChild(slider('Film Kalınlığı', 0.4, 2.2, 0.05, () => it.thick, (v) => { it.thick = v; changed(); }, (v) => Math.round(v * 300) + ' nm'));
      insp.appendChild(btn('Patlat', '', () => popBubble(it)));
      insp.lastChild.style.width = '100%';
      insp.lastChild.style.marginBottom = '10px';
    }

    // Genel Boyutlandırma
    if (it.kind !== 'protractor' && it.kind !== 'bubble' && !isSrc) {
      insp.appendChild(slider('Ölçek / Boyut', 0.4, 2.8, 0.05, () => it._baseScale || it.scale, (v) => { it._baseScale = v; it.scale = v * currentZoom; changed(); }, (v) => '×' + v.toFixed(2)));
    }

    // Aksiyon Butonları
    const row = el('div', 'btns');
    row.appendChild(btn('↺ 90° Döndür', '', () => {
      it.rot += Math.PI / 2;
      changed();
      syncInspector();
    }));
    row.appendChild(btn('Çoğalt', '', duplicate));
    row.appendChild(btn('Sil', 'danger', removeSel));
    insp.appendChild(row);
  }

  // ---------- ayarlar paneli ----------
  const settingsBody = document.getElementById('settingsBody');
  function buildSettings() {
    reg = setSync;
    setSync.length = 0;
    settingsBody.innerHTML = '';
    const set = S.set;
    const redraw = () => LT.redraw();

    settingsBody.appendChild(toggle('Normal Çizgisi & Açıları Göster (θ1, θ2)', () => set.showNormals, (v) => { set.showNormals = v; S.overlayDirty = true; }));
    settingsBody.appendChild(toggle('Odak Noktalarını Göster (F, 2F)', () => set.showFocal, (v) => { set.showFocal = v; S.overlayDirty = true; }));
    settingsBody.appendChild(toggle('Optik Masa Izgarasına Hizala (Snap)', () => set.snapGrid, (v) => { set.snapGrid = v; }));

    settingsBody.appendChild(slider('Işık Parlaklığı', 0.3, 3, 0.05, () => set.exposure, (v) => { set.exposure = v; redraw(); }, (v) => v.toFixed(2)));
    settingsBody.appendChild(slider('Dispersiyon Şiddeti', 0, 4, 0.05, () => set.disp, (v) => { set.disp = v; LT.touch(2); }, (v) => (v === 0 ? 'Kapalı' : '×' + v.toFixed(2))));
    settingsBody.appendChild(slider('Işıma / Sis Efekti', 0, 2, 0.05, () => set.glow, (v) => { set.glow = v; redraw(); }, (v) => v.toFixed(2)));
    settingsBody.appendChild(slider('Yüzey Yansımaları', 0, 1, 0.05, () => set.refl, (v) => { set.refl = v; LT.touch(2); }, (v) => Math.round(v * 100) + '%'));
    settingsBody.appendChild(seg('Görünüm Modu', [{ v: 'light', t: 'Fiziksel Huzme' }, { v: 'rays', t: 'Işın Çizgileri' }], () => set.mode, (v) => { set.mode = v; LT.touch(3); }));
    settingsBody.appendChild(toggle('Köpükler Havada Süzülsün', () => set.drift, (v) => { set.drift = v; LT.touch(3); }));

    const row = el('div', 'btns');
    row.appendChild(
      btn('PNG Ekran Resmi Al', '', () =>
        LT.snapshot((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'optik-masasi.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        })
      )
    );
    row.appendChild(
      btn('Masayı Temizle', 'danger', () => {
        S.items.length = 0;
        select(null);
        LT.hardReset();
        sceneBtns.forEach((x) => x.classList.remove('on'));
      })
    );
    settingsBody.appendChild(row);
    reg = syncers;
  }

  function closeSettings() {
    settings.classList.add('hidden');
  }

  document.getElementById('btnSettings').addEventListener('click', (e) => {
    e.stopPropagation();
    if (settings.classList.contains('hidden')) {
      buildSettings();
      settings.classList.remove('hidden');
    } else {
      closeSettings();
      renderInspector();
    }
  });

  // ---------- kaplama (overlay) ve görsel göstergeler ----------
  function drawSelection(it, hover) {
    const g = it.geo;
    if (!g) return;
    octx.save();
    octx.lineJoin = 'round';
    if (hover) {
      octx.strokeStyle = 'rgba(255, 225, 234, 0.4)';
      octx.lineWidth = 1.3;
    } else {
      octx.strokeStyle = 'rgba(240, 171, 197, 0.95)';
      octx.lineWidth = 1.6;
      octx.setLineDash([5, 4]);
    }
    octx.beginPath();
    if (it.kind === 'source') {
      octx.translate(it.x, it.y);
      octx.rotate(it.rot);
      octx.roundRect(g.bx0 - 6, -g.hh - 6, g.bx1 - g.bx0 + 12, g.hh * 2 + 12, 8);
    } else if (it.kind === 'bubble') {
      octx.translate(g.cx, g.cy);
      octx.rotate(g.rot);
      octx.ellipse(0, 0, g.ax * 1.06, g.ay * 1.06, 0, 0, Math.PI * 2);
    } else if (it.kind === 'protractor') {
      octx.arc(it.x, it.y, (it.radius || 110) * it.scale + 6, 0, Math.PI * 2);
    } else if (g.poly1 && g.poly2) {
      octx.moveTo(g.poly1[0][0], g.poly1[0][1]);
      for (let i = 1; i < g.poly1.length; i++) octx.lineTo(g.poly1[i][0], g.poly1[i][1]);
      octx.closePath();
      octx.moveTo(g.poly2[0][0], g.poly2[0][1]);
      for (let i = 1; i < g.poly2.length; i++) octx.lineTo(g.poly2[i][0], g.poly2[i][1]);
      octx.closePath();
    } else if (g.poly && g.poly.length > 2) {
      octx.moveTo(g.poly[0][0], g.poly[0][1]);
      for (let i = 1; i < g.poly.length; i++) octx.lineTo(g.poly[i][0], g.poly[i][1]);
      octx.closePath();
    }
    octx.stroke();
    octx.restore();
  }

  function drawHandles(it) {
    const h = handles(it);
    octx.save();
    octx.strokeStyle = 'rgba(240, 171, 197, 0.95)';
    octx.fillStyle = 'rgba(21, 10, 20, 0.92)';
    octx.lineWidth = 1.5;

    if (h.rot) {
      const a = it.kind === 'source' ? { x: it.x + it.geo.dx * it.geo.bx1, y: it.y + it.geo.dy * it.geo.bx1 } : { x: it.x, y: it.y };
      octx.globalAlpha = 0.55;
      octx.beginPath();
      octx.moveTo(a.x, a.y);
      octx.lineTo(h.rot.x, h.rot.y);
      octx.stroke();
      octx.globalAlpha = 1;
      octx.beginPath();
      octx.arc(h.rot.x, h.rot.y, 7.5, 0, Math.PI * 2);
      octx.fill();
      octx.stroke();
      octx.beginPath();
      octx.arc(h.rot.x, h.rot.y, 3.5, -2.4, 1.6);
      octx.stroke();
    }
    if (h.scl) {
      octx.beginPath();
      octx.arc(h.scl.x, h.scl.y, 7, 0, Math.PI * 2);
      octx.fill();
      octx.stroke();
      const ux = Math.SQRT1_2;
      octx.beginPath();
      octx.moveTo(h.scl.x - ux * 3.5, h.scl.y - ux * 3.5);
      octx.lineTo(h.scl.x + ux * 3.5, h.scl.y + ux * 3.5);
      octx.stroke();
    }
    octx.restore();
  }

  // Odak Noktaları Çizimi
  function drawFocalPoints(it) {
    if (!S.set.showFocal) return;
    const isLens = it.kind === 'lens';
    const isMirror = it.kind === 'mirror' && it.mtype !== 'flat';
    if (!isLens && !isMirror) return;

    const f = (it.f || (isMirror ? (it.R || 360) / 2 : 200)) * it.scale;
    const rad = it.rot;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);

    const axLen = Math.max(450, Math.abs(f) * 2.5 + 40);

    octx.save();
    octx.strokeStyle = 'rgba(240, 171, 197, 0.35)';
    octx.setLineDash([4, 4]);
    octx.lineWidth = 1;
    octx.beginPath();
    octx.moveTo(it.x - dx * axLen, it.y - dy * axLen);
    octx.lineTo(it.x + dx * axLen, it.y + dy * axLen);
    octx.stroke();
    octx.setLineDash([]);

    const pts = isLens
      ? [
          { name: 'F', d: f, col: '#ffd3e0' },
          { name: "F'", d: -f, col: '#ffd3e0' },
          { name: '2F', d: 2 * f, col: '#f0abc5' },
          { name: "2F'", d: -2 * f, col: '#f0abc5' },
        ]
      : [
          { name: 'F', d: it.mtype === 'concave' ? -f : f, col: '#ffd3e0' },
          { name: 'M (2F)', d: it.mtype === 'concave' ? -2 * f : 2 * f, col: '#f0abc5' },
        ];

    octx.font = '10px "JetBrains Mono", monospace';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';

    for (const p of pts) {
      const fx = it.x + dx * p.d;
      const fy = it.y + dy * p.d;
      octx.fillStyle = p.col;
      octx.beginPath();
      octx.arc(fx, fy, 3, 0, Math.PI * 2);
      octx.fill();
      octx.fillStyle = 'rgba(255,255,255,0.9)';
      octx.fillText(p.name, fx, fy - 10);
    }
    octx.restore();
  }

  // Normal ve Açı Gösterimi: SADECE seçili eleman varsa veya ilk ışın için TEK kart çizer (EKRANI BOĞMAZ)
  function drawRayAngles() {
    if (!S.set.showNormals || !LT.rayHits || LT.rayHits.length === 0) return;
    const cur = sel();
    const hits = cur ? LT.rayHits.filter((h) => h.id === cur.id) : [LT.rayHits[0]];
    if (!hits || hits.length === 0 || !hits[0]) return;

    octx.save();
    octx.font = '11px ui-sans-serif, system-ui, sans-serif';
    octx.textAlign = 'left';
    octx.textBaseline = 'middle';

    const h = hits[0];
    const nx = h.nx;
    const ny = h.ny;
    const len = 36;

    octx.strokeStyle = 'rgba(232, 184, 109, 0.85)';
    octx.lineWidth = 1.3;
    octx.setLineDash([4, 3]);
    octx.beginPath();
    octx.moveTo(h.x - nx * len, h.y - ny * len);
    octx.lineTo(h.x + nx * len, h.y + ny * len);
    octx.stroke();
    octx.setLineDash([]);

    const th1Deg = ((h.th1 * 180) / Math.PI).toFixed(1);
    const th2Deg = ((h.th2 * 180) / Math.PI).toFixed(1);

    const text =
      h.kind === 'reflect'
        ? 'Yansıma: θg = θy = ' + th1Deg + '°'
        : h.kind === 'tir'
        ? 'Tam İç Yansıma (θ ≥ θc): θ = ' + th1Deg + '°'
        : 'Kırılma: θ1 = ' + th1Deg + '° → θ2 = ' + th2Deg + '° (Snell)';

    const tw = octx.measureText(text).width;
    const bx = Math.max(12, Math.min(h.x + 14, S.W - tw - 24));
    const by = Math.max(14, Math.min(h.y - 12, S.H - 28));

    octx.fillStyle = 'rgba(21, 10, 20, 0.92)';
    octx.strokeStyle = 'rgba(240, 171, 197, 0.45)';
    octx.lineWidth = 1;
    octx.roundRect(bx, by, tw + 18, 24, 6);
    octx.fill();
    octx.stroke();

    octx.fillStyle = '#ffe1ea';
    octx.fillText(text, bx + 9, by + 12);
    octx.restore();
  }

  // ---------- teleskop optik telemetrisi ve analiz kartı ----------
  let telManuallyClosed = false;

  updateTelescopeHud = function (forcePresetName) {
    const hud = document.getElementById('telescopeHud');
    if (!hud) return;

    const currentHash = (location.hash || '').replace('#', '');
    const presetName = forcePresetName || currentHash;

    if (forcePresetName && forcePresetName.startsWith('teleskop')) {
      telManuallyClosed = false;
    }
    if (telManuallyClosed) {
      hud.classList.add('hidden');
      return;
    }

    const lenses = S.items.filter((it) => it.kind === 'lens');
    const mirrors = S.items.filter((it) => it.kind === 'mirror');
    const concMirrors = mirrors.filter((it) => it.mtype === 'concave');
    const flatMirrors = mirrors.filter((it) => it.mtype === 'flat');
    const convMirrors = mirrors.filter((it) => it.mtype === 'convex');

    const isCassegrain = presetName === 'teleskop_cassegrain' || (concMirrors.length >= 1 && convMirrors.length >= 1 && !presetName.includes('mak') && !presetName.includes('sct') && !S.items.some((i) => i.type === 'block'));
    const isMak = presetName === 'teleskop_mak' || (concMirrors.length >= 1 && convMirrors.length >= 1 && lenses.some((l) => l.concave && l.f > 500));
    const isSCT = presetName === 'teleskop_sct' || (concMirrors.length >= 1 && convMirrors.length >= 1 && S.items.some((i) => i.type === 'block'));
    const isGregory = presetName === 'teleskop_gregory' || concMirrors.length >= 2;
    const isNewton = presetName === 'teleskop_newton' || (concMirrors.length >= 1 && flatMirrors.length >= 1 && lenses.length >= 1);
    const isExpander = presetName === 'teleskop_expander';
    const isGalileo = presetName === 'teleskop_galileo' || (lenses.length >= 2 && lenses.some((l) => l.concave));
    const isKepler = presetName === 'teleskop_kepler' || presetName === 'teleskop' || (lenses.length >= 2 && lenses.every((l) => !l.concave));

    if (!isCassegrain && !isMak && !isSCT && !isGregory && !isNewton && !isExpander && !isGalileo && !isKepler) {
      hud.classList.add('hidden');
      return;
    }

    hud.classList.remove('hidden');

    const titleEl = document.getElementById('telTypeTitle');
    const badgeEl = document.getElementById('telBadge');
    const magEl = document.getElementById('telMag');
    const magSubEl = document.getElementById('telMagSub');
    const tubeEl = document.getElementById('telTube');
    const tubeSubEl = document.getElementById('telTubeSub');
    const objLblEl = document.getElementById('telObjLbl');
    const objFEl = document.getElementById('telObjF');
    const objSubEl = document.getElementById('telObjSub');
    const eyeLblEl = document.getElementById('telEyeLbl');
    const eyeFEl = document.getElementById('telEyeF');
    const eyeSubEl = document.getElementById('telEyeSub');
    const orientEl = document.getElementById('telOrient');
    const aberrEl = document.getElementById('telAberr');
    const descEl = document.getElementById('telDesc');

    if (isCassegrain) {
      const pri = concMirrors[0] || { f: 340, scale: 1 };
      const sec = convMirrors[0] || { f: 140, scale: 1 };
      const eye = lenses[0] || { f: 70, scale: 1 };
      const fPri = Math.round((pri._baseF || pri.f || 340) * (pri._baseScale || pri.scale || 1));
      const fSec = Math.round((sec._baseF || sec.f || 140) * (sec._baseScale || sec.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 70) * (eye._baseScale || eye.scale || 1));
      const fEff = Math.round(fPri * 3.1);
      const M = (fEff / Math.max(1, fEye)).toFixed(1);
      const L = 250;

      if (titleEl) titleEl.textContent = 'Klasik Cassegrain Teleskobu';
      if (badgeEl) { badgeEl.textContent = 'KATADIOPTİK / REFLEKTÖR'; badgeEl.style.color = '#c7a0ff'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = F_eff / f_oküler (F_eff ≈ ' + fEff + ' mm)';
      if (tubeEl) tubeEl.textContent = '~' + L + ' mm';
      if (tubeSubEl) tubeSubEl.textContent = 'Katlama Oranı: ~4.2× (Ultra Kompakt)';
      if (objLblEl) objLblEl.textContent = 'Birincil Ayna (f_pri)';
      if (objFEl) objFEl.textContent = '+' + fPri + ' mm';
      if (objSubEl) objSubEl.textContent = 'Parabolik çukur ayna (Delikli)';
      if (eyeLblEl) eyeLblEl.textContent = 'İkincil Ayna & Oküler';
      if (eyeFEl) eyeFEl.textContent = '−' + fSec + ' / +' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Tümsek ayna + oküler mercek';
      if (orientEl) orientEl.textContent = '🔄 Ters Görüntü (Astronomik)';
      if (aberrEl) { aberrEl.textContent = '✨ Sıfır Renk Sapıncı & Düşük Koma'; aberrEl.style.color = '#c7a0ff'; }
      if (descEl) descEl.textContent = 'Klasik Cassegrain, delikli parabolik birincil ayna ve hiperbolik dışbükey ikincil ayna kullanır. Işık tüp içinde katlanarak kısa fiziksel tüpte devasa odak uzaklığı (f/10 - f/15) sunar. Hubble Uzay Teleskobu ve profesyonel rasathanelerin temelidir.';
    } else if (isMak) {
      const pri = concMirrors[0] || { f: 320, scale: 1 };
      const sec = convMirrors[0] || { f: 130, scale: 1 };
      const eye = lenses.find((l) => !l.concave || l.f < 300) || { f: 65, scale: 1 };
      const fPri = Math.round((pri._baseF || pri.f || 320) * (pri._baseScale || pri.scale || 1));
      const fSec = Math.round((sec._baseF || sec.f || 130) * (sec._baseScale || sec.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 65) * (eye._baseScale || eye.scale || 1));
      const fEff = Math.round(fPri * 4.0);
      const M = (fEff / Math.max(1, fEye)).toFixed(1);
      const L = 260;

      if (titleEl) titleEl.textContent = 'Maksutov-Cassegrain (Mak)';
      if (badgeEl) { badgeEl.textContent = 'KATADIOPTİK (MAKSUTOV)'; badgeEl.style.color = '#f0abc5'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = F_eff / f_oküler (F_eff ≈ ' + fEff + ' mm)';
      if (tubeEl) tubeEl.textContent = '~' + L + ' mm';
      if (tubeSubEl) tubeSubEl.textContent = 'Katlama Oranı: ~5× (Kapalı Tüp)';
      if (objLblEl) objLblEl.textContent = 'Ön Menisküs Düzeltici';
      if (objFEl) objFEl.textContent = 'Aküromatik';
      if (objSubEl) objSubEl.textContent = 'Küresel sapıncı yok eden menisküs';
      if (eyeLblEl) eyeLblEl.textContent = 'Gümüş Benek & Oküler';
      if (eyeFEl) eyeFEl.textContent = '−' + fSec + ' / +' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Menisküs merkezinde ikincil benek';
      if (orientEl) orientEl.textContent = '🔄 Ters Görüntü (Yüksek Kontrast)';
      if (aberrEl) { aberrEl.textContent = '💎 Sıfır Koma & Küresel Sapınç'; aberrEl.style.color = '#f0abc5'; }
      if (descEl) descEl.textContent = 'Maksutov tasarımında ön açıklıktaki kalın içbükey menisküs mercek küresel sapınçları tamamen sıfırlar. İkincil ayna menisküsün merkezine doğrudan kaplanmış gümüş bir benektir. Kapalı tüp hava türbülansını önler; Ay ve gezegen gözleminde rakipsiz keskinlik sunar.';
    } else if (isSCT) {
      const pri = concMirrors[0] || { f: 270, scale: 1 };
      const sec = convMirrors[0] || { f: 120, scale: 1 };
      const eye = lenses[0] || { f: 65, scale: 1 };
      const fPri = Math.round((pri._baseF || pri.f || 270) * (pri._baseScale || pri.scale || 1));
      const fSec = Math.round((sec._baseF || sec.f || 120) * (sec._baseScale || sec.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 65) * (eye._baseScale || eye.scale || 1));
      const fEff = Math.round(fPri * 4.6);
      const M = (fEff / Math.max(1, fEye)).toFixed(1);
      const L = 240;

      if (titleEl) titleEl.textContent = 'Schmidt-Cassegrain (SCT)';
      if (badgeEl) { badgeEl.textContent = 'KATADIOPTİK (SCHMIDT)'; badgeEl.style.color = '#7df9ff'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = F_eff / f_oküler (F_eff ≈ ' + fEff + ' mm)';
      if (tubeEl) tubeEl.textContent = '~' + L + ' mm';
      if (tubeSubEl) tubeSubEl.textContent = 'Katlama Oranı: ~5.2× (Portatif)';
      if (objLblEl) objLblEl.textContent = 'Schmidt Plaka & f/2 Ayna';
      if (objFEl) objFEl.textContent = '+' + fPri + ' mm (f/2 Hızlı)';
      if (objSubEl) objSubEl.textContent = 'Asferik düzeltici + hızlı birincil';
      if (eyeLblEl) eyeLblEl.textContent = '5× İkincil & Oküler';
      if (eyeFEl) eyeFEl.textContent = '−' + fSec + ' / +' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Kompakt tümsek ayna hücresi + oküler';
      if (orientEl) orientEl.textContent = '🔄 Ters Görüntü';
      if (aberrEl) { aberrEl.textContent = '🌌 Geniş Düz Alan (Aplanatik)'; aberrEl.style.color = '#7df9ff'; }
      if (descEl) descEl.textContent = 'Schmidt-Cassegrain, amatör astronominin en popüler ve çok yönlü teleskobudur. İnce asferik Schmidt cam plakası küresel sapıncı engellerken 5x büyütücü ikincil ayna 240 mm tüp içine 1250 mm optik yol sığdırır. Hem derin uzay hem gezegen için mükemmeldir.';
    } else if (isGregory) {
      const pri = concMirrors.find((m) => m.rot === 0) || concMirrors[0] || { f: 260, scale: 1 };
      const sec = concMirrors.find((m) => Math.abs(m.rot - Math.PI) < 0.1) || concMirrors[1] || { f: 125, scale: 1 };
      const eye = lenses[0] || { f: 65, scale: 1 };
      const fPri = Math.round((pri._baseF || pri.f || 260) * (pri._baseScale || pri.scale || 1));
      const fSec = Math.round((sec._baseF || sec.f || 125) * (sec._baseScale || sec.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 65) * (eye._baseScale || eye.scale || 1));
      const fEff = Math.round(fPri * 3.0);
      const M = (fEff / Math.max(1, fEye)).toFixed(1);
      const L = 370;

      if (titleEl) titleEl.textContent = 'Gregoryen Teleskobu';
      if (badgeEl) { badgeEl.textContent = 'REFLEKTÖR (ÇİFT ÇUKUR)'; badgeEl.style.color = '#5bffb0'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = F_eff / f_oküler (F_eff ≈ ' + fEff + ' mm)';
      if (tubeEl) tubeEl.textContent = '~' + L + ' mm';
      if (tubeSubEl) tubeSubEl.textContent = 'L = f_pri + d (Ara Odak Ötesi)';
      if (objLblEl) objLblEl.textContent = 'Birincil Ayna (f_pri)';
      if (objFEl) objFEl.textContent = '+' + fPri + ' mm';
      if (objSubEl) objSubEl.textContent = 'Parabolik delikli çukur ayna';
      if (eyeLblEl) eyeLblEl.textContent = 'İkincil Çukur Ayna';
      if (eyeFEl) eyeFEl.textContent = '+' + fSec + ' / +' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Ara odak ötesi eliptik çukur ayna';
      if (orientEl) orientEl.textContent = '⬆️ Doğal Düz Görüntü (Prizmasız)';
      if (aberrEl) { aberrEl.textContent = '☀️ Isı Filtresi (Solar & GMT)'; aberrEl.style.color = '#5bffb0'; }
      if (descEl) descEl.textContent = '1663 yılında James Gregory tarafından icat edilen bu teleskopta iki çukur ayna kullanılır. İkincil ayna ara odağın ÖTESİNE yerleştirildiği için görüntüyü ikinci kez çevirerek prizma gerektirmeden doğal düz görüntü sağlar. Dev Magellan Teleskobu (GMT) bu tasarımı kullanır.';
    } else if (isNewton) {
      const pri = concMirrors[0] || { f: 260, scale: 1 };
      const eye = lenses[0] || { f: 85, scale: 1 };
      const fPri = Math.round((pri._baseF || pri.f || 260) * (pri._baseScale || pri.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 85) * (eye._baseScale || eye.scale || 1));
      const M = (fPri / Math.max(1, fEye)).toFixed(2);
      const L = fPri;

      if (titleEl) titleEl.textContent = 'Newton Aynalı Teleskobu';
      if (badgeEl) { badgeEl.textContent = 'REFLEKTÖR'; badgeEl.style.color = '#7df9ff'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = f_birincil / f_oküler';
      if (tubeEl) tubeEl.textContent = '~' + L + ' mm';
      if (tubeSubEl) tubeSubEl.textContent = 'L ≈ f_birincil (Optik Yol)';
      if (objLblEl) objLblEl.textContent = 'Birincil Ayna (f_pri)';
      if (objFEl) objFEl.textContent = '+' + fPri + ' mm';
      if (objSubEl) objSubEl.textContent = 'Işık toplayan çukur ayna';
      if (eyeLblEl) eyeLblEl.textContent = 'Oküler Odak (f_eye)';
      if (eyeFEl) eyeFEl.textContent = '+' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Gözlem oküleri (mercek)';
      if (orientEl) orientEl.textContent = '🔄 Ters Görüntü';
      if (aberrEl) { aberrEl.textContent = '✨ Sıfır Renk Sapıncı'; aberrEl.style.color = '#7df9ff'; }
      if (descEl) descEl.textContent = 'Newton reflektöründe ışık büyük bir çukur ayna ile toplanır. Aynalar ışığı kırmadığı için renk sapıncı (kromatik aberasyon) SIFIRDIR. 45° düz ikincil ayna ışığı tüpün dışındaki okülere yönlendirir.';
    } else if (isExpander) {
      const sortedLenses = lenses.slice().sort((a, b) => a.x - b.x);
      const l1 = sortedLenses[0] || { f: 80, scale: 1 };
      const l2 = sortedLenses[1] || { f: 240, scale: 1 };
      const f1 = Math.round((l1._baseF || l1.f || 80) * (l1._baseScale || l1.scale || 1));
      const f2 = Math.round((l2._baseF || l2.f || 240) * (l2._baseScale || l2.scale || 1));
      const ratio = (f2 / Math.max(1, f1)).toFixed(2);
      const L = f1 + f2;
      const actDist = sortedLenses.length >= 2 ? Math.round(Math.abs(sortedLenses[1].x - sortedLenses[0].x) / currentZoom) : L;

      if (titleEl) titleEl.textContent = 'Işın Genişletici (Kolimatör)';
      if (badgeEl) { badgeEl.textContent = 'AFOKAL SİSTEM'; badgeEl.style.color = '#5bffb0'; }
      if (magEl) magEl.textContent = ratio + '×';
      if (magSubEl) magSubEl.textContent = 'Genişletme: m = f2 / f1';
      if (tubeEl) tubeEl.textContent = L + ' mm (' + actDist + ' mm)';
      if (tubeSubEl) tubeSubEl.textContent = 'L = f1 + f2 (Eşodaklı)';
      if (objLblEl) objLblEl.textContent = 'Giriş Merceği (f1)';
      if (objFEl) objFEl.textContent = '+' + f1 + ' mm';
      if (objSubEl) objSubEl.textContent = 'Işığı odaklayan mercek';
      if (eyeLblEl) eyeLblEl.textContent = 'Çıkış Merceği (f2)';
      if (eyeFEl) eyeFEl.textContent = '+' + f2 + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Geniş demeti kolime eden mercek';
      if (orientEl) orientEl.textContent = '🔦 Genişletilmiş Huzme';
      if (aberrEl) { aberrEl.textContent = '🎯 Minimum Iraksama'; aberrEl.style.color = '#5bffb0'; }
      if (descEl) descEl.textContent = 'İki dışbükey merceğin odakları çakıştırılarak oluşturulan ters teleskop sistemidir. Lazer ışınının demet çapı m kat genişlerken açısal ıraksaması m kat azalır; ışın uzak mesafelere dağılmadan ulaşır.';
    } else if (isGalileo) {
      const sortedLenses = lenses.slice().sort((a, b) => a.x - b.x);
      const obj = sortedLenses[0] || { f: 280, scale: 1 };
      const eye = sortedLenses[1] || { f: 112, scale: 1, concave: true };
      const fObj = Math.round((obj._baseF || obj.f || 280) * (obj._baseScale || obj.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 112) * (eye._baseScale || eye.scale || 1));
      const M = (fObj / Math.max(1, fEye)).toFixed(2);
      const L = Math.round(fObj - fEye);
      const actDist = sortedLenses.length >= 2 ? Math.round(Math.abs(sortedLenses[1].x - sortedLenses[0].x) / currentZoom) : L;

      if (titleEl) titleEl.textContent = 'Galileo Karasal Teleskobu';
      if (badgeEl) { badgeEl.textContent = 'DÜRBÜN (REFRAKTÖR)'; badgeEl.style.color = '#ffd277'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = f_obj / |f_eye|';
      if (tubeEl) tubeEl.textContent = L + ' mm (' + actDist + ' mm)';
      if (tubeSubEl) tubeSubEl.textContent = 'L = f_obj − |f_eye|';
      if (objLblEl) objLblEl.textContent = 'Objektif Odak (f_obj)';
      if (objFEl) objFEl.textContent = '+' + fObj + ' mm';
      if (objSubEl) objSubEl.textContent = 'Dışbükey (Işığı toplayan)';
      if (eyeLblEl) eyeLblEl.textContent = 'Oküler Odak (f_eye)';
      if (eyeFEl) eyeFEl.textContent = '−' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'İçbükey (Iraksak oküler)';
      if (orientEl) orientEl.textContent = '⬆️ Düz Görüntü (Doğrultulmuş)';
      if (aberrEl) { aberrEl.textContent = '🔍 Kısa Tüp / Kompakt'; aberrEl.style.color = '#ffd277'; }
      if (descEl) descEl.textContent = 'Galileo teleskobunda dışbükey objektif ve içbükey (ıraksak) oküler kullanılır. Görüntü ara odak oluşmadan doğrudan göze düz (baş yukarı) ulaşır. Tiyatro ve deniz dürbünlerinin temel optik yapısıdır.';
    } else {
      // Kepler
      const sortedLenses = lenses.slice().sort((a, b) => a.x - b.x);
      const obj = sortedLenses[0] || { f: 280, scale: 1 };
      const eye = sortedLenses[1] || { f: 112, scale: 1 };
      const fObj = Math.round((obj._baseF || obj.f || 280) * (obj._baseScale || obj.scale || 1));
      const fEye = Math.round((eye._baseF || eye.f || 112) * (eye._baseScale || eye.scale || 1));
      const M = (fObj / Math.max(1, fEye)).toFixed(2);
      const L = fObj + fEye;
      const actDist = sortedLenses.length >= 2 ? Math.round(Math.abs(sortedLenses[1].x - sortedLenses[0].x) / currentZoom) : L;

      if (titleEl) titleEl.textContent = 'Kepler Astronomik Teleskobu';
      if (badgeEl) { badgeEl.textContent = 'REFRAKTÖR (MERCEKLİ)'; badgeEl.style.color = '#ffd277'; }
      if (magEl) magEl.textContent = M + '×';
      if (magSubEl) magSubEl.textContent = 'M = f_obj / f_eye';
      if (tubeEl) tubeEl.textContent = L + ' mm (' + actDist + ' mm)';
      if (tubeSubEl) tubeSubEl.textContent = 'L = f_obj + f_eye (Eşodaklı)';
      if (objLblEl) objLblEl.textContent = 'Objektif Odak (f_obj)';
      if (objFEl) objFEl.textContent = '+' + fObj + ' mm';
      if (objSubEl) objSubEl.textContent = 'Uzun odaklı dışbükey mercek';
      if (eyeLblEl) eyeLblEl.textContent = 'Oküler Odak (f_eye)';
      if (eyeFEl) eyeFEl.textContent = '+' + fEye + ' mm';
      if (eyeSubEl) eyeSubEl.textContent = 'Kısa odaklı göz merceği';
      if (orientEl) orientEl.textContent = '🔄 Ters Görüntü (Astronomik)';
      if (aberrEl) { aberrEl.textContent = '🌌 Geniş Görüş Alanı'; aberrEl.style.color = '#ffd277'; }
      if (descEl) descEl.textContent = 'İki dışbükey mercekten oluşur. Objektif mercek sonsuzdaki cismin gerçek ve ters bir ara görüntüsünü odakta kurar; oküler ise bunu büyüterek göze paralel gönderir. Astronomide geniş görüş alanı sağlar.';
    }
  };
  LT.updateTelescopeHud = updateTelescopeHud;

  LT.drawOverlay = function (dt) {
    const active = pops.length > 0;
    octx.setTransform(odpr, 0, 0, odpr, 0, 0);
    octx.clearRect(0, 0, S.W, S.H);

    for (const it of S.items) drawFocalPoints(it);

    const hov = LT.getItem(S.hoverId);
    const cur = sel();
    if (hov && hov !== cur && !drag) drawSelection(hov, true);
    if (cur) {
      drawSelection(cur, false);
      drawHandles(cur);
    }

    drawRayAngles();

    if (active) {
      octx.save();
      octx.globalCompositeOperation = 'lighter';
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.age += dt;
        if (p.age >= p.life) {
          pops.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
        p.vx *= 0.985;
        const k = 1 - p.age / p.life;
        octx.fillStyle = 'hsla(' + p.hue + ',90%,72%,' + k * 0.9 + ')';
        octx.beginPath();
        octx.arc(p.x, p.y, p.r * (0.5 + k), 0, Math.PI * 2);
        octx.fill();
      }
      octx.restore();
    }
  };

  LT.uiInit = function () {
    renderInspector();
    updateZoomDisplay();
    updateTelescopeHud();

    const btnTelClose = document.getElementById('btnTelClose');
    if (btnTelClose) {
      btnTelClose.addEventListener('click', () => {
        const hud = document.getElementById('telescopeHud');
        if (hud) hud.classList.add('hidden');
        telManuallyClosed = true;
      });
    }

    // Üst Hızlı Kontroller
    const btnNormals = document.getElementById('btnQuickNormals');
    if (btnNormals) {
      btnNormals.addEventListener('click', () => {
        S.set.showNormals = !S.set.showNormals;
        btnNormals.classList.toggle('on', S.set.showNormals);
        S.overlayDirty = true;
      });
    }
    const btnFocal = document.getElementById('btnQuickFocal');
    if (btnFocal) {
      btnFocal.addEventListener('click', () => {
        S.set.showFocal = !S.set.showFocal;
        btnFocal.classList.toggle('on', S.set.showFocal);
        S.overlayDirty = true;
      });
    }
    const btnGrid = document.getElementById('btnQuickGrid');
    if (btnGrid) {
      btnGrid.addEventListener('click', () => {
        S.set.snapGrid = !S.set.snapGrid;
        btnGrid.classList.toggle('on', S.set.snapGrid);
      });
    }
    const btnSnap = document.getElementById('btnSnapshot');
    if (btnSnap) {
      btnSnap.addEventListener('click', () => {
        LT.snapshot((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'optik-masasi.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
      });
    }

    // Kamera / Yakınlaştırma (Zoom) Butonları
    const btnZIn = document.getElementById('btnZoomIn');
    if (btnZIn) btnZIn.addEventListener('click', () => zoomScene(S.W / 2, S.H / 2, 1.15));
    const btnZOut = document.getElementById('btnZoomOut');
    if (btnZOut) btnZOut.addEventListener('click', () => zoomScene(S.W / 2, S.H / 2, 0.85));
    const btnZReset = document.getElementById('btnZoomReset');
    if (btnZReset) btnZReset.addEventListener('click', resetZoom);
    const btnCent = document.getElementById('btnCenter');
    if (btnCent) btnCent.addEventListener('click', centerScene);

    // Alt menü üzerindeyken de fare tekerleğinin masayı yakınlaştırıp/uzaklaştırmasını sağla (menü sabit kalsın)
    const dockWrap = document.getElementById('dock-wrapper');
    if (dockWrap) {
      dockWrap.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.08 : 0.92;
          zoomScene(e.clientX || S.W / 2, e.clientY || S.H / 2, factor);
        },
        { passive: false }
      );
    }
  };

  LT.ui = { select, spawn, popBubble, removeSel, duplicate, centerScene, resetZoom, zoomScene, getZoom: () => currentZoom };
})();
