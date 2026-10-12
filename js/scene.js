/* Sahne durumu, öğeler ve geometri */
(function () {
  'use strict';
  const LT = window.LT;
  const S = (LT.state = {
    items: [],
    selId: null,
    hoverId: null,
    W: window.innerWidth,
    H: window.innerHeight,
    set: {
      exposure: 1.0,
      disp: 1.6,
      glow: 0.7,
      refl: 0.6,
      mode: 'light',
      drift: true,
      showNormals: true,
      showFocal: true,
      snapGrid: false,
    },
    time: 0,
    dirty: 2,
    glassDirty: true,
    overlayDirty: true,
  });

  LT.touch = (level) => {
    S.dirty = Math.max(S.dirty, level === undefined ? 2 : level);
  };
  LT.hardReset = () => {
    S.glassDirty = true;
    S.overlayDirty = true;
    LT.touch(3);
  };
  LT.glassChanged = () => {
    S.glassDirty = true;
    S.overlayDirty = true;
    LT.touch(2);
  };

  let uid = 1;
  const DEF = {
    beam: { kind: 'source', stype: 'beam', width: 28, mono: false, lam: 560, power: 1, spread: 60 },
    point: { kind: 'source', stype: 'point', width: 0, mono: false, lam: 560, power: 1, spread: 80 },
    laser: { kind: 'source', stype: 'laser', width: 2, mono: true, lam: 532, power: 1.3, spread: 0 },
    multibeam: { kind: 'source', stype: 'multibeam', width: 72, rayCount: 5, raySpacing: 18, mono: true, lam: 532, power: 1.2 },
    prism: { kind: 'prism', ptype: 'equilateral', mat: 'flint', apex: 60 },
    right_prism: { kind: 'prism', ptype: 'right', mat: 'kron', size: 160 },
    lens: { kind: 'lens', ltype: 'biconvex', mat: 'kron', concave: false, f: 230 },
    plano_lens: { kind: 'lens', ltype: 'planoconvex', mat: 'kron', concave: false, f: 220 },
    block: { kind: 'block', mat: 'kron', bw: 180, bh: 95 },
    dblock: { kind: 'dblock', mat: 'kron', radius: 105 },
    diamond: { kind: 'diamond', mat: 'elmas' },
    bubble: { kind: 'bubble', thick: 1 },
    mirror_flat: { kind: 'mirror', mtype: 'flat', mlen: 170, refl: 0.98 },
    mirror_concave: { kind: 'mirror', mtype: 'concave', f: 180, R: 360, arcH: 190, refl: 0.98 },
    mirror_convex: { kind: 'mirror', mtype: 'convex', f: 180, R: 360, arcH: 190, refl: 0.98 },
    splitter: { kind: 'splitter', slen: 140, ratio: 0.5 },
    screen: { kind: 'screen', slen: 210 },
    aperture: { kind: 'aperture', awidth: 210, gap: 34 },
    sensor: { kind: 'sensor', swidth: 84, sheight: 34 },
    protractor: { kind: 'protractor', radius: 110 },
    ruler: { kind: 'ruler', rlen: 260 },
  };

  LT.NAMES = {
    beam: 'Işın Demeti',
    point: 'Nokta Işık',
    laser: 'Lazer',
    multibeam: 'Çoklu Işın (Işık Kutusu)',
    prism: 'Eşkenar Prizma',
    right_prism: 'Dik Açılı Prizma (90°)',
    lens: 'İki Yüzlü Mercek',
    plano_lens: 'Düzlem-Dışbükey Mercek',
    block: 'Dikdörtgen Cam Blok',
    dblock: 'Yarım Daire Blok (D-Blok)',
    diamond: 'Elmas',
    bubble: 'Sabun Köpüğü',
    mirror_flat: 'Düz Ayna',
    mirror_concave: 'Çukur Ayna (Odaklayıcı)',
    mirror_convex: 'Tümsek Ayna (Dağıtıcı)',
    splitter: 'Işın Bölücü (50/50)',
    screen: 'Gözlem Perdesi / Ekran',
    aperture: 'Diyafram / Yarık',
    sensor: 'Optik Güç Sensörü',
    protractor: 'Açıölçer / İletki',
    ruler: 'Ölçüm Cetveli',
  };

  LT.viewK = () => LT.clamp(Math.min(S.W / 1500, S.H / 850), 0.55, 1);

  LT.newItem = function (type, x, y, extra) {
    const it = Object.assign({ id: uid++, type, x, y, rot: 0, scale: 1, phase: Math.random() * 6.28, popT: 0 }, DEF[type] || DEF.beam, extra || {});
    if (extra === undefined || extra.scale === undefined) it.scale = LT.viewK();
    if (it.kind === 'screen') it.hits = [];
    if (it.kind === 'sensor') it.sensorData = { power: 0, lamSum: 0, hits: 0 };
    it._baseScale = it.scale;
    if (it.f !== undefined) it._baseF = it.f;
    if (it.raySpacing !== undefined) it._baseSpacing = it.raySpacing;
    if (it.width !== undefined) it._baseWidth = it.width;
    if (it.bw !== undefined) it._baseBw = it.bw;
    if (it.bh !== undefined) it._baseBh = it.bh;
    if (it.radius !== undefined) it._baseRadius = it.radius;
    if (it.mlen !== undefined) it._baseMlen = it.mlen;
    if (it.arcH !== undefined) it._baseArcH = it.arcH;
    if (it.rlen !== undefined) it._baseRlen = it.rlen;
    if (it.size !== undefined) it._baseSize = it.size;
    S.items.push(it);
    LT.buildGeo(it, S.time);
    LT.hardReset();
    return it;
  };

  LT.removeItem = function (id) {
    const i = S.items.findIndex((t) => t.id === id);
    if (i >= 0) S.items.splice(i, 1);
    if (S.selId === id) S.selId = null;
    LT.hardReset();
    if (LT.onItemsChanged) LT.onItemsChanged();
  };

  LT.getItem = (id) => S.items.find((t) => t.id === id) || null;

  // ---------- geometri dönüşümleri ----------

  function xf(it, lx, ly) {
    const c = Math.cos(it.rot);
    const s = Math.sin(it.rot);
    lx *= it.scale;
    ly *= it.scale;
    return [it.x + lx * c - ly * s, it.y + lx * s + ly * c];
  }
  function rotv(it, nx, ny) {
    const c = Math.cos(it.rot);
    const s = Math.sin(it.rot);
    return [nx * c - ny * s, nx * s + ny * c];
  }

  function flatPoly(it, pts) {
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p[0];
      cy += p[1];
    }
    cx /= pts.length;
    cy /= pts.length;
    const n = pts.length;
    const segs = new Float64Array(n * 8);
    const poly = [];
    let R = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const l = Math.hypot(nx, ny) || 1;
      const [wnx, wny] = rotv(it, nx / l, ny / l);
      const A = xf(it, a[0], a[1]);
      const B = xf(it, b[0], b[1]);
      segs.set([A[0], A[1], B[0], B[1], wnx, wny, wnx, wny], i * 8);
      poly.push(A);
      R = Math.max(R, Math.hypot(A[0] - it.x, A[1] - it.y));
    }
    return { segs, n, poly, R, cx: it.x, cy: it.y };
  }

  function arcPoly(it, parts) {
    const n = parts.length;
    const segs = new Float64Array(n * 8);
    const poly = [];
    let R = 0;
    for (let i = 0; i < n; i++) {
      const a = parts[i];
      const b = parts[(i + 1) % n];
      const A = xf(it, a.p[0], a.p[1]);
      const B = xf(it, b.p[0], b.p[1]);
      const na = rotv(it, (a.nOut || a.n)[0], (a.nOut || a.n)[1]);
      const nb = rotv(it, (b.nIn || b.n)[0], (b.nIn || b.n)[1]);
      segs.set([A[0], A[1], B[0], B[1], na[0], na[1], nb[0], nb[1]], i * 8);
      poly.push(A);
      R = Math.max(R, Math.hypot(A[0] - it.x, A[1] - it.y));
    }
    return { segs, n, poly, R, cx: it.x, cy: it.y };
  }

  const ARC_N = 36;

  function geoLens(it) {
    const h = 210;
    const half = h / 2;
    const matObj = LT.MATERIALS[it.mat] || LT.MATERIALS.kron;
    const nD = matObj.nD;

    if (it.ltype === 'planoconvex') {
      const R = Math.max((nD - 1) * it.f, half * 1.05);
      const sag = R - Math.sqrt(R * R - half * half);
      const tm = Math.asin(half / R);
      const parts = [];
      const cl = -sag / 2;
      parts.push({ p: [cl, -half], n: [-1, 0], nOut: [-1, 0], nIn: [-1, 0] });
      parts.push({ p: [cl, half], n: [-1, 0], nOut: [0, 1], nIn: [-1, 0] });
      const cr = cl - (R - sag);
      for (let i = 0; i <= ARC_N; i++) {
        const th = tm - (2 * tm * i) / ARC_N;
        parts.push({ p: [cr + R * Math.cos(th), R * Math.sin(th)], n: [Math.cos(th), Math.sin(th)] });
      }
      const g = arcPoly(it, parts);
      g.lensR = R;
      g.lensH = h;
      g.f = it.f;
      return g;
    }

    const R = Math.max(2 * (nD - 1) * it.f, half * 1.12);
    const sag = R - Math.sqrt(R * R - half * half);
    const tm = Math.asin(half / R);
    const parts = [];
    if (!it.concave) {
      const cr = -(R - sag);
      for (let i = 0; i <= ARC_N; i++) {
        const th = -tm + (2 * tm * i) / ARC_N;
        parts.push({ p: [cr + R * Math.cos(th), R * Math.sin(th)], n: [Math.cos(th), Math.sin(th)] });
      }
      const cl = R - sag;
      for (let i = 0; i <= ARC_N; i++) {
        const th = tm - (2 * tm * i) / ARC_N;
        parts.push({ p: [cl - R * Math.cos(th), R * Math.sin(th)], n: [-Math.cos(th), Math.sin(th)] });
      }
    } else {
      const e = h * 0.1;
      const cr = e / 2 - sag + R;
      for (let i = 0; i <= ARC_N; i++) {
        const th = -tm + (2 * tm * i) / ARC_N;
        parts.push({
          p: [cr - R * Math.cos(th), R * Math.sin(th)],
          n: [Math.cos(th), -Math.sin(th)],
          nOut: i === ARC_N ? [0, 1] : null,
          nIn: i === 0 ? [0, -1] : null,
        });
      }
      const cl = -(e / 2 - sag + R);
      for (let i = 0; i <= ARC_N; i++) {
        const th = tm - (2 * tm * i) / ARC_N;
        parts.push({
          p: [cl + R * Math.cos(th), R * Math.sin(th)],
          n: [-Math.cos(th), -Math.sin(th)],
          nOut: i === ARC_N ? [0, -1] : null,
          nIn: i === 0 ? [0, 1] : null,
        });
      }
    }
    const g = arcPoly(it, parts);
    g.lensR = R;
    g.lensH = h;
    g.f = it.f;
    return g;
  }

  function geoPrism(it) {
    if (it.ptype === 'right') {
      const S = (it.size || 160) * 1.1;
      const cx = S / 3;
      const cy = S / 3;
      return flatPoly(it, [
        [-cx, -cy],
        [S - cx, -cy],
        [-cx, S - cy],
      ]);
    }
    const L = 200;
    const a = ((it.apex || 60) * Math.PI) / 180;
    const w = L * Math.sin(a / 2);
    const H = L * Math.cos(a / 2);
    return flatPoly(it, [
      [0, (-2 * H) / 3],
      [w, H / 3],
      [-w, H / 3],
    ]);
  }

  function geoBlock(it) {
    const w = (it.bw || 180) / 2;
    const h = (it.bh || 95) / 2;
    return flatPoly(it, [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ]);
  }

  function geoDBlock(it) {
    const R = it.radius || 105;
    const parts = [];
    parts.push({ p: [0, -R], n: [-1, 0], nOut: [-1, 0], nIn: [-1, 0] });
    parts.push({ p: [0, R], n: [-1, 0], nOut: [0, 1], nIn: [-1, 0] });
    for (let i = 0; i <= ARC_N; i++) {
      const th = Math.PI / 2 - (Math.PI * i) / ARC_N;
      parts.push({ p: [R * Math.cos(th), R * Math.sin(th)], n: [Math.cos(th), Math.sin(th)] });
    }
    const g = arcPoly(it, parts);
    g.radius = R;
    return g;
  }

  function geoCurvedMirror(it) {
    const isConcave = it.mtype === 'concave';
    const f = it.f || 180;
    const R = Math.max(2 * f, 120);
    const H = it.arcH || 190;
    const half = H / 2;
    const tm = Math.asin(Math.min(0.92, half / R));
    const parts = [];
    const T = 8;

    if (isConcave && it.hole && it.hole > 0) {
      const hole = Math.min(it.hole, H * 0.85);
      const hH = hole / 2;
      const thH = Math.asin(Math.min(0.92, hH / R));
      const nHalf = Math.max(8, Math.round(ARC_N / 2));

      const parts1 = [];
      for (let i = 0; i <= nHalf; i++) {
        const th = thH + ((tm - thH) * i) / nHalf;
        parts1.push({
          p: [R - R * Math.cos(th), R * Math.sin(th)],
          n: [-Math.cos(th), -Math.sin(th)],
          nOut: i === nHalf ? [1, 0] : null,
          nIn: i === 0 ? [1, 0] : null,
        });
      }
      for (let i = 0; i <= nHalf; i++) {
        const th = tm - ((tm - thH) * i) / nHalf;
        parts1.push({
          p: [R - R * Math.cos(th) + T, R * Math.sin(th)],
          n: [Math.cos(th), Math.sin(th)],
          nOut: i === nHalf ? [-1, 0] : null,
          nIn: i === 0 ? [-1, 0] : null,
        });
      }

      const parts2 = [];
      for (let i = 0; i <= nHalf; i++) {
        const th = -tm + ((tm - thH) * i) / nHalf;
        parts2.push({
          p: [R - R * Math.cos(th), R * Math.sin(th)],
          n: [-Math.cos(th), -Math.sin(th)],
          nOut: i === nHalf ? [1, 0] : null,
          nIn: i === 0 ? [1, 0] : null,
        });
      }
      for (let i = 0; i <= nHalf; i++) {
        const th = -thH - ((tm - thH) * i) / nHalf;
        parts2.push({
          p: [R - R * Math.cos(th) + T, R * Math.sin(th)],
          n: [Math.cos(th), Math.sin(th)],
          nOut: i === nHalf ? [-1, 0] : null,
          nIn: i === 0 ? [-1, 0] : null,
        });
      }

      const g1 = arcPoly(it, parts1);
      const g2 = arcPoly(it, parts2);
      const segs = new Float64Array(g1.segs.length + g2.segs.length);
      segs.set(g1.segs, 0);
      segs.set(g2.segs, g1.segs.length);
      return {
        segs,
        n: g1.n + g2.n,
        poly: g1.poly.concat(g2.poly),
        poly1: g1.poly,
        poly2: g2.poly,
        R,
        f,
        mtype: it.mtype,
        refl: it.refl || 0.98,
        hole: it.hole,
        cx: it.x,
        cy: it.y,
      };
    }

    if (isConcave) {
      for (let i = 0; i <= ARC_N; i++) {
        const th = -tm + (2 * tm * i) / ARC_N;
        parts.push({
          p: [R - R * Math.cos(th), R * Math.sin(th)],
          n: [-Math.cos(th), -Math.sin(th)],
          nOut: i === ARC_N ? [1, 0] : null,
          nIn: i === 0 ? [1, 0] : null,
        });
      }
      for (let i = 0; i <= ARC_N; i++) {
        const th = tm - (2 * tm * i) / ARC_N;
        parts.push({
          p: [R - R * Math.cos(th) + T, R * Math.sin(th)],
          n: [Math.cos(th), Math.sin(th)],
          nOut: i === ARC_N ? [-1, 0] : null,
          nIn: i === 0 ? [-1, 0] : null,
        });
      }
    } else {
      for (let i = 0; i <= ARC_N; i++) {
        const th = -tm + (2 * tm * i) / ARC_N;
        parts.push({
          p: [R * Math.cos(th) - R, R * Math.sin(th)],
          n: [Math.cos(th), Math.sin(th)],
          nOut: i === ARC_N ? [-1, 0] : null,
          nIn: i === 0 ? [-1, 0] : null,
        });
      }
      for (let i = 0; i <= ARC_N; i++) {
        const th = tm - (2 * tm * i) / ARC_N;
        parts.push({
          p: [R * Math.cos(th) - R - T, R * Math.sin(th)],
          n: [-Math.cos(th), -Math.sin(th)],
          nOut: i === ARC_N ? [1, 0] : null,
          nIn: i === 0 ? [1, 0] : null,
        });
      }
    }
    const g = arcPoly(it, parts);
    g.R = R;
    g.f = f;
    g.mtype = it.mtype;
    g.refl = it.refl || 0.98;
    return g;
  }

  function geoFlatMirror(it) {
    const L = (it.mlen || 170) / 2;
    const T = 7;
    const g = flatPoly(it, [
      [-L, -T],
      [L, -T],
      [L, T],
      [-L, T],
    ]);
    g.mtype = 'flat';
    g.refl = it.refl || 0.98;
    return g;
  }

  function geoSplitter(it) {
    const L = (it.slen || 140) / 2;
    const T = 6;
    const g = flatPoly(it, [
      [-L, -T],
      [L, -T],
      [L, T],
      [-L, T],
    ]);
    g.ratio = it.ratio || 0.5;
    return g;
  }

  function geoScreen(it) {
    const L = (it.slen || 210) / 2;
    const T = 7;
    const g = flatPoly(it, [
      [-T, -L],
      [T, -L],
      [T, L],
      [-T, L],
    ]);
    g.stype = 'screen';
    return g;
  }

  function geoAperture(it) {
    const W = (it.awidth || 210) / 2;
    const gap = (it.gap || 34) / 2;
    const T = 8;
    const g1 = flatPoly(it, [
      [-T, gap],
      [T, gap],
      [T, W],
      [-T, W],
    ]);
    const g2 = flatPoly(it, [
      [-T, -W],
      [T, -W],
      [T, -gap],
      [-T, -gap],
    ]);
    const segs = new Float64Array(g1.segs.length + g2.segs.length);
    segs.set(g1.segs, 0);
    segs.set(g2.segs, g1.segs.length);
    const poly = g1.poly.concat(g2.poly);
    return {
      segs,
      n: g1.n + g2.n,
      poly,
      R: Math.hypot(T, W) * it.scale,
      cx: it.x,
      cy: it.y,
      stype: 'aperture',
      gap: it.gap,
    };
  }

  function geoSensor(it) {
    const w = (it.swidth || 84) / 2;
    const h = (it.sheight || 34) / 2;
    const g = flatPoly(it, [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ]);
    g.stype = 'sensor';
    return g;
  }

  const DIAMOND = [
    [-0.27, -0.21],
    [0.27, -0.21],
    [0.5, -0.05],
    [0.5, -0.02],
    [0, 0.42],
    [-0.5, -0.02],
    [-0.5, -0.05],
  ];
  LT.DIAMOND_LOCAL = DIAMOND;
  const DIAMOND_SIZE = 175;

  LT.buildGeo = function (it, t) {
    const mat = LT.MATERIALS[it.mat] || null;
    let g;
    if (it.kind === 'prism') g = geoPrism(it);
    else if (it.kind === 'lens') g = geoLens(it);
    else if (it.kind === 'block') g = geoBlock(it);
    else if (it.kind === 'dblock') g = geoDBlock(it);
    else if (it.kind === 'mirror') {
      g = it.mtype === 'flat' ? geoFlatMirror(it) : geoCurvedMirror(it);
    } else if (it.kind === 'splitter') g = geoSplitter(it);
    else if (it.kind === 'screen') g = geoScreen(it);
    else if (it.kind === 'aperture') g = geoAperture(it);
    else if (it.kind === 'sensor') g = geoSensor(it);
    else if (it.kind === 'protractor') {
      const R = (it.radius || 110) * it.scale;
      g = { R, cx: it.x, cy: it.y, radius: R, poly: [] };
    } else if (it.kind === 'ruler') {
      const L = (it.rlen || 260) / 2;
      const W = 18;
      g = flatPoly(it, [
        [-L, -W],
        [L, -W],
        [L, W],
        [-L, W],
      ]);
      g.rlen = it.rlen;
    } else if (it.kind === 'diamond') {
      const k = DIAMOND_SIZE;
      g = flatPoly(
        it,
        DIAMOND.map((p) => [p[0] * k, p[1] * k])
      );
    } else if (it.kind === 'bubble') {
      const R = 72 * it.scale;
      const w = 0.03 * Math.sin(t * 1.7 + it.phase) + 0.015 * Math.sin(t * 2.9 + it.phase * 2.1);
      let dx = 0;
      let dy = 0;
      if (S.set.drift) {
        dx = 7 * Math.sin(t * 0.37 + it.phase * 1.7);
        dy = 5 * Math.cos(t * 0.29 + it.phase);
      }
      const pop = it.popT;
      const rot = 0.35 * Math.sin(t * 0.4 + it.phase);
      g = {
        cx: it.x + dx,
        cy: it.y + dy,
        ax: R * (1 + w),
        ay: R * (1 - w),
        cr: Math.cos(rot),
        sr: Math.sin(rot),
        rot,
        R: R * 1.05,
        pop,
      };
    } else {
      // Işık kaynağı gövdesi
      const dxr = Math.cos(it.rot);
      const dyr = Math.sin(it.rot);
      let bx0 = -36;
      let bx1 = 16;
      let hh = 17;
      let front = 18;
      if (it.stype === 'beam') hh = LT.clamp(it.width / 2 + 9, 17, 220);
      else if (it.stype === 'multibeam') {
        hh = LT.clamp(((it.rayCount || 5) * (it.raySpacing || 18)) / 2 + 10, 24, 180);
        bx0 = -40;
        bx1 = 18;
        front = 20;
      } else if (it.stype === 'point') {
        bx0 = -15;
        bx1 = 15;
        hh = 15;
        front = 16;
      } else {
        bx0 = -46;
        bx1 = 10;
        hh = 9;
        front = 13;
      }
      g = { dx: dxr, dy: dyr, bx0, bx1, hh, front, R: Math.max(40, hh), cx: it.x, cy: it.y };
    }
    g.mat = mat;
    it.geo = g;
    return g;
  };

  LT.rebuildGeo = function (t) {
    for (const it of S.items) LT.buildGeo(it, t);
  };

  // ---------- seçme ve tıklama kontrolü ----------

  function inPoly(poly, x, y) {
    if (!poly || poly.length < 3) return false;
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  LT.inPoly = inPoly;

  function ptSegDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x0, py - y0);
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  }

  function inOrNearPoly(poly, x, y, tol) {
    if (!poly || poly.length < 2) return false;
    if (inPoly(poly, x, y)) return true;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (ptSegDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) <= tol) return true;
    }
    return false;
  }

  LT.pick = function (x, y) {
    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i];
      const g = it.geo;
      if (!g) continue;
      if (it.kind === 'source') {
        const dx = x - it.x;
        const dy = y - it.y;
        const lx = dx * g.dx + dy * g.dy;
        const ly = -dx * g.dy + dy * g.dx;
        if (lx >= g.bx0 - 6 && lx <= g.bx1 + 6 && Math.abs(ly) <= g.hh + 6) return it;
      } else if (it.kind === 'bubble') {
        if (it.popT > 0) continue;
        const px = x - g.cx;
        const py = y - g.cy;
        const lx = (px * g.cr + py * g.sr) / g.ax;
        const ly = (-px * g.sr + py * g.cr) / g.ay;
        if (lx * lx + ly * ly <= 1.08) return it;
      } else if (it.kind === 'protractor') {
        if (Math.hypot(x - it.x, y - it.y) <= (g.R || 110) * 1.05) return it;
      } else if (g.poly && inOrNearPoly(g.poly, x, y, 12)) return it;
    }
    return null;
  };

  LT.bringToFront = function (it) {
    const i = S.items.indexOf(it);
    if (i >= 0 && i < S.items.length - 1) {
      S.items.splice(i, 1);
      S.items.push(it);
      LT.glassChanged();
    }
  };

  // ---------- hazır laboratuvar deneyleri ----------

  function fr(x, y) {
    return [x * S.W, y * S.H];
  }
  function addPx(type, x, y, extra) {
    const k = LT.viewK();
    const e = Object.assign({}, extra);
    e.scale = (e.scale || 1) * k;
    if (e.width) e.width = Math.max(2, e.width * k);
    return LT.newItem(type, x, y, e);
  }
  function add(type, fx, fy, extra) {
    const p = fr(fx, fy);
    return addPx(type, p[0], p[1], extra);
  }
  const D = Math.PI / 180;

  LT.presets = {
    // 1. Temiz, sade ve ferah başlangıç deneyi (Lazer -> Prizma)
    karma() {
      const pc = fr(0.48, 0.48);
      const ang = -18 * D;
      const src = [pc[0] - 380 * Math.cos(ang), pc[1] - 380 * Math.sin(ang)];
      addPx('laser', src[0], src[1], { rot: ang, lam: 532, power: 1.4 });
      addPx('prism', pc[0], pc[1], { scale: 1.3, apex: 60, mat: 'flint' });
    },

    // Boş Masa (Kendi deneyini sıfırdan kurmak isteyenler için)
    bos() {
      S.items.length = 0;
    },

    // 2. Snell Kanunu & Kritik Açı (D-Blok Laboratuvar Deneyi)
    snell_dblock() {
      const db = fr(0.52, 0.5);
      addPx('dblock', db[0], db[1], { rot: 0, scale: 1.45, mat: 'kron' });
      const theta = -40 * D;
      const src = [db[0] - 320 * Math.cos(theta), db[1] - 320 * Math.sin(theta)];
      addPx('laser', src[0], src[1], { rot: theta, lam: 532, power: 1.3 });
      addPx('protractor', db[0], db[1], { scale: 1.1, rot: 0 });
    },

    // 3. Newton Prizması ve Gökkuşağı Ayrışması
    prizma() {
      const pc = fr(0.42, 0.46);
      const ang = -22 * D;
      const src = [pc[0] - 420 * Math.cos(ang), pc[1] - 420 * Math.sin(ang)];
      addPx('beam', src[0], src[1], { width: 18, rot: ang, power: 1.4 });
      addPx('prism', pc[0], pc[1], { scale: 1.4, apex: 60, mat: 'agir_flint' });
    },

    // 4. Aynalar: Çukur & Tümsek Ayna Odaklama
    aynalar() {
      const s1 = fr(0.12, 0.32);
      addPx('multibeam', s1[0], s1[1], { rot: 0, rayCount: 5, raySpacing: 18, lam: 532, power: 1.2 });
      const mConcave = fr(0.55, 0.32);
      addPx('mirror_concave', mConcave[0], mConcave[1], { f: 180, arcH: 210, scale: 1.15, rot: Math.PI });

      const s2 = fr(0.12, 0.72);
      addPx('multibeam', s2[0], s2[1], { rot: 0, rayCount: 5, raySpacing: 18, lam: 633, power: 1.2 });
      const mConvex = fr(0.55, 0.72);
      addPx('mirror_convex', mConvex[0], mConvex[1], { f: 180, arcH: 210, scale: 1.15, rot: Math.PI });
    },

    // 5. Kepler Astronomik Teleskobu (İki Dışbükey Mercek, M = 2.5x, L = 392 mm)
    teleskop_kepler() {
      const y0 = fr(0.5, 0.5)[1];
      const xObj = fr(0.32, 0.5)[0];
      const fObj = 280;
      const fEye = 112;
      const xEye = xObj + fObj + fEye;
      addPx('multibeam', xObj - 260, y0, { rot: 0, rayCount: 5, raySpacing: 16, lam: 532, power: 1.3 });
      addPx('lens', xObj, y0, { f: fObj, scale: 1.3, mat: 'kron' });
      addPx('lens', xEye, y0, { f: fEye, scale: 0.85, mat: 'kron' });
    },
    teleskop() {
      LT.presets.teleskop_kepler();
    },

    // Galileo Karasal Teleskobu (Dışbükey Objektif + İçbükey Oküler, M = 2.5x, L = 168 mm)
    teleskop_galileo() {
      const y0 = fr(0.5, 0.5)[1];
      const xObj = fr(0.34, 0.5)[0];
      const fObj = 280;
      const fEye = 112;
      const xEye = xObj + fObj - fEye;
      addPx('multibeam', xObj - 260, y0, { rot: 0, rayCount: 5, raySpacing: 16, lam: 633, power: 1.3 });
      addPx('lens', xObj, y0, { f: fObj, scale: 1.3, mat: 'kron' });
      addPx('lens', xEye, y0, { f: fEye, concave: true, scale: 0.85, mat: 'kron' });
    },

    // Newton Aynalı Teleskobu (Çukur Ayna + 45° Düz Ayna + Oküler, Sıfır Renk Sapıncı)
    teleskop_newton() {
      const y0 = fr(0.5, 0.56)[1];
      const xPri = fr(0.72, 0.56)[0];
      const fPri = 260;
      const dSec = 170;
      const xSec = xPri - dSec;
      addPx('multibeam', fr(0.12, 0.56)[0], y0, { rot: 0, rayCount: 5, raySpacing: 22, lam: 532, power: 1.3 });
      addPx('mirror_concave', xPri, y0, { f: fPri, arcH: 230, scale: 1.25, rot: 0 });
      addPx('mirror_flat', xSec, y0, { rot: Math.PI / 4, mlen: 110, scale: 0.85 });
      const yEye = y0 - (fPri - dSec + 60);
      addPx('lens', xSec, yEye, { f: 85, scale: 0.8, rot: Math.PI / 2, mat: 'kron' });
    },

    // Klasik Cassegrain Teleskobu (Parabolik Delikli Birincil + Hiperbolik İkincil + Arka Oküler)
    teleskop_cassegrain() {
      const y0 = fr(0.5, 0.5)[1];
      const xPri = fr(0.74, 0.5)[0];
      const fPri = 340;
      const xSec = xPri - 250;
      const xEye = xPri + 110;
      addPx('multibeam', fr(0.12, 0.5)[0], y0, { rot: 0, rayCount: 5, raySpacing: 26, lam: 532, power: 1.3 });
      addPx('mirror_concave', xPri, y0, { f: fPri, arcH: 220, hole: 75, scale: 1.25, rot: 0 });
      addPx('mirror_convex', xSec, y0, { f: 140, arcH: 65, scale: 0.9, rot: 0 });
      addPx('lens', xEye, y0, { f: 70, scale: 0.85, mat: 'kron' });
    },

    // Maksutov-Cassegrain Teleskobu (Menisküs Düzeltici + Küresel Birincil + Gümüş Benek İkincil)
    teleskop_mak() {
      const y0 = fr(0.5, 0.5)[1];
      const xPri = fr(0.74, 0.5)[0];
      const fPri = 320;
      const xSec = xPri - 260;
      const xEye = xPri + 110;
      addPx('multibeam', fr(0.12, 0.5)[0], y0, { rot: 0, rayCount: 5, raySpacing: 26, lam: 532, power: 1.3 });
      addPx('lens', xSec - 6, y0, { f: 1200, concave: true, scale: 1.35, mat: 'kron' });
      addPx('mirror_convex', xSec, y0, { f: 130, arcH: 60, scale: 0.85, rot: 0 });
      addPx('mirror_concave', xPri, y0, { f: fPri, arcH: 220, hole: 75, scale: 1.25, rot: 0 });
      addPx('lens', xEye, y0, { f: 65, scale: 0.85, mat: 'kron' });
    },

    // Schmidt-Cassegrain Teleskobu (Schmidt Düzeltici Plaka + Hızlı f/2 Birincil + Kompakt Katlama)
    teleskop_sct() {
      const y0 = fr(0.5, 0.5)[1];
      const xPri = fr(0.72, 0.5)[0];
      const fPri = 270;
      const xSec = xPri - 240;
      const xEye = xPri + 110;
      addPx('multibeam', fr(0.12, 0.5)[0], y0, { rot: 0, rayCount: 5, raySpacing: 26, lam: 532, power: 1.3 });
      addPx('block', xSec - 8, y0, { bw: 14, bh: 220, scale: 1.2, mat: 'kron' });
      addPx('mirror_convex', xSec, y0, { f: 120, arcH: 58, scale: 0.85, rot: 0 });
      addPx('mirror_concave', xPri, y0, { f: fPri, arcH: 220, hole: 75, scale: 1.25, rot: 0 });
      addPx('lens', xEye, y0, { f: 65, scale: 0.85, mat: 'kron' });
    },

    // Gregoryen Teleskobu (İki Çukur Ayna, Ara Odak Ötesi İkincil, Doğal Düz Görüntü)
    teleskop_gregory() {
      const y0 = fr(0.5, 0.5)[1];
      const xPri = fr(0.70, 0.5)[0];
      const fPri = 260;
      const xSec = xPri - 370;
      const xEye = xPri + 110;
      addPx('multibeam', fr(0.12, 0.5)[0], y0, { rot: 0, rayCount: 5, raySpacing: 26, lam: 532, power: 1.3 });
      addPx('mirror_concave', xSec, y0, { f: 125, arcH: 76, scale: 0.9, rot: Math.PI });
      addPx('mirror_concave', xPri, y0, { f: fPri, arcH: 220, hole: 75, scale: 1.25, rot: 0 });
      addPx('lens', xEye, y0, { f: 65, scale: 0.85, mat: 'kron' });
    },

    // Lazer Işın Genişletici (Kolimatör / Beam Expander)
    teleskop_expander() {
      const y0 = fr(0.5, 0.5)[1];
      const x0 = fr(0.18, 0.5)[0];
      const f1 = 80;
      const f2 = 240;
      const x1 = x0 + 160;
      const x2 = x1 + f1 + f2;
      addPx('laser', x0, y0, { rot: 0, lam: 532, power: 1.4 });
      addPx('lens', x1, y0, { f: f1, scale: 0.75, mat: 'kron' });
      addPx('lens', x2, y0, { f: f2, scale: 1.35, mat: 'kron' });
    },

    // 6. Cam Plakada Paralel Kayma Deneyi
    blok_kayma() {
      const bk = fr(0.5, 0.5);
      addPx('block', bk[0], bk[1], { rot: 32 * D, bw: 210, bh: 110, scale: 1.2, mat: 'flint' });
      const src = fr(0.12, 0.5);
      addPx('laser', src[0], src[1], { rot: 0, lam: 633, power: 1.3 });
      const sn = fr(0.86, 0.5);
      addPx('sensor', sn[0], sn[1], { rot: Math.PI / 2, scale: 1.2 });
    },

    // 7. Michelson / Işın Bölücü Düzeni
    splitter_lab() {
      const src = fr(0.15, 0.5);
      addPx('laser', src[0], src[1], { rot: 0, lam: 532, power: 1.4 });
      const sp = fr(0.48, 0.5);
      addPx('splitter', sp[0], sp[1], { rot: Math.PI / 4, scale: 1.15 });
      const m1 = fr(0.48, 0.16);
      addPx('mirror_flat', m1[0], m1[1], { rot: 0, scale: 0.95 });
      const m2 = fr(0.82, 0.5);
      addPx('mirror_flat', m2[0], m2[1], { rot: Math.PI / 2, scale: 0.95 });
      const sc = fr(0.48, 0.84);
      addPx('screen', sc[0], sc[1], { rot: 0, scale: 1.2 });
    },

    // 8. Elmas Işıltısı ve Tam İç Yansıma
    elmas() {
      const dm = fr(0.52, 0.52);
      const src = fr(0.12, 0.4);
      const aim = Math.atan2(dm[1] - src[1], dm[0] - src[0]) + 4 * D;
      addPx('beam', src[0], src[1], { width: 36, rot: aim, power: 1.3 });
      addPx('diamond', dm[0], dm[1], { scale: 1.9, rot: -0.15 });
    },

    // 9. Sabun Köpüğü İnce Film Girişimi
    kopuk() {
      add('beam', 0.05, 0.5, { width: 230, rot: 0, power: 1.1 });
      add('bubble', 0.36, 0.42, { scale: 1.8, phase: 0.6 });
      add('bubble', 0.6, 0.66, { scale: 1.25, phase: 2.2, thick: 1.3 });
      add('bubble', 0.7, 0.26, { scale: 0.85, phase: 3.7, thick: 0.8 });
      add('bubble', 0.86, 0.55, { scale: 1.5, phase: 5.1, thick: 1.1 });
    },
  };

  LT.loadPreset = function (name) {
    S.items.length = 0;
    S.selId = null;
    (LT.presets[name] || LT.presets.karma)();
    LT.hardReset();
  };
})();
