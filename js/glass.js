/* Cam nesneleri, aynalar, optik aparatlar ve ışık kaynaklarını çizer */
(function () {
  'use strict';
  const LT = window.LT;
  const S = LT.state;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  LT.glassCanvas = cv;
  let dpr = 1;

  LT.glassResize = function (W, H, scale) {
    dpr = scale;
    cv.width = Math.round(W * scale);
    cv.height = Math.round(H * scale);
    S.glassDirty = true;
  };

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function path(poly) {
    if (!poly || poly.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }
  function bbox(poly) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of poly) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    return [x0, y0, x1, y1];
  }

  // ---- Cam Gövdeleri (Prizma, Mercek, Blok, D-Blok, Elmas) ----
  function drawGlassBody(it) {
    const g = it.geo;
    if (!g || !g.poly || g.poly.length < 3) return;
    const poly = g.poly;
    const matObj = LT.MATERIALS[it.mat] || LT.MATERIALS.kron;
    const tint = matObj.tint;
    const b = bbox(poly);

    ctx.save();
    path(poly);
    const gr = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
    gr.addColorStop(0, rgba(tint, 0.22));
    gr.addColorStop(0.55, rgba(tint, 0.08));
    gr.addColorStop(1, rgba(tint, 0.15));
    ctx.fillStyle = gr;
    ctx.fill();

    // İç kenar ışıltısı ve parıltı
    ctx.save();
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = rgba(tint, 0.06);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.strokeStyle = rgba(tint, 0.09);
    ctx.stroke();

    const hl = ctx.createLinearGradient(b[0], b[1], b[0] + (b[2] - b[0]) * 0.75, b[1] + (b[3] - b[1]) * 0.75);
    hl.addColorStop(0, 'rgba(255,255,255,0.78)');
    hl.addColorStop(0.45, 'rgba(255,255,255,0.09)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.lineWidth = 4;
    ctx.strokeStyle = hl;
    ctx.stroke();

    const hl2 = ctx.createLinearGradient(b[2], b[3], b[2] - (b[2] - b[0]) * 0.6, b[3] - (b[3] - b[1]) * 0.6);
    hl2.addColorStop(0, rgba(tint, 0.38));
    hl2.addColorStop(1, rgba(tint, 0));
    ctx.lineWidth = 3;
    ctx.strokeStyle = hl2;
    ctx.stroke();
    ctx.restore();

    // İnce dış sınır çizgisi
    path(poly);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(225,242,255,0.72)';
    ctx.stroke();
    ctx.restore();
  }

  // ---- Aynalar (Düz, Çukur, Tümsek) ----
  function drawMirror(it) {
    const g = it.geo;
    if (!g || !g.poly) return;
    ctx.save();

    // Gövde dolgusu
    ctx.fillStyle = '#18202d';
    if (g.poly1 && g.poly2) {
      path(g.poly1);
      ctx.fill();
      path(g.poly2);
      ctx.fill();
    } else {
      path(g.poly);
      ctx.fill();
    }

    if (it.mtype === 'flat') {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      const L = ((it.mlen || 170) / 2) * it.scale;
      const T = 7 * it.scale;
      // Ön gümüşlü yüzey
      ctx.beginPath();
      ctx.moveTo(-L, -T);
      ctx.lineTo(L, -T);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#e6f3ff';
      ctx.shadowColor = 'rgba(180,225,255,0.7)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowColor = 'transparent';

      // Arka taraftaki optik koruma çizgileri (hashing)
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      for (let x = -L + 8; x <= L - 8; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, -T + 1);
        ctx.lineTo(x + 7, T);
        ctx.stroke();
      }
      // Mekanik tutucu
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(-18, T - 1, 36, 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.strokeRect(-18, T - 1, 36, 12);
      ctx.restore();
    } else {
      // Çukur / Tümsek ayna (dünya koordinatlarında)
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#e6f4ff';
      ctx.shadowColor = 'rgba(180,225,255,0.75)';
      ctx.shadowBlur = 9;
      if (g.poly1 && g.poly2) {
        path(g.poly1);
        ctx.stroke();
        path(g.poly2);
        ctx.stroke();
      } else {
        path(g.poly);
        ctx.stroke();
      }
      ctx.shadowColor = 'transparent';

      // Tepe noktası optik merkez çizgisi (delik yoksa)
      if (!g.hole) {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-2, -3, 4, 6);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---- Işın Bölücü (50/50 Beam Splitter) ----
  function drawSplitter(it) {
    const g = it.geo;
    if (!g || !g.poly) return;
    drawGlassBody(it);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const L = (it.slen || 140) / 2 * it.scale;
    // Yarı yansıtıcı kaplama çizgisi
    ctx.beginPath();
    ctx.moveTo(-L, 0);
    ctx.lineTo(L, 0);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.85)';
    ctx.stroke();
    ctx.restore();
  }

  // ---- Gözlem Perdesi / Ekran ----
  function drawScreen(it) {
    const g = it.geo;
    if (!g || !g.poly) return;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const L = (it.slen || 210) / 2 * it.scale;
    const T = 7 * it.scale;

    // Perde gövdesi (mat beyaz optik difüzör)
    ctx.fillStyle = '#0f1724';
    ctx.fillRect(-T, -L, T * 2, L * 2);
    ctx.fillStyle = '#f0f5fc';
    ctx.fillRect(-T, -L, 3, L * 2);

    // Milimetre cetvel çizgileri
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let y = -L + 10; y <= L - 10; y += 12) {
      ctx.fillRect(-T + 3, y, y % 24 === 0 ? 6 : 3, 1);
    }
    // Dış kontur
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-T, -L, T * 2, L * 2);

    // Ayak tutucu
    ctx.fillStyle = '#222d3d';
    ctx.fillRect(-T - 6, -14, T * 2 + 12, 28);
    ctx.strokeRect(-T - 6, -14, T * 2 + 12, 28);

    // Işık çarptığında yüzeyde parıldayan lekeler
    if (it.hits && it.hits.length > 0) {
      for (const h of it.hits) {
        const lx = (h.x - it.x) * Math.cos(-it.rot) - (h.y - it.y) * Math.sin(-it.rot);
        const ly = (h.x - it.x) * Math.sin(-it.rot) + (h.y - it.y) * Math.cos(-it.rot);
        const col = h.mono ? LT.lamCss(h.lam) : '#ffffff';
        ctx.save();
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(-T, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---- Diyafram / Yarık (Aperture / Slit) ----
  function drawAperture(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const W = (it.awidth || 210) / 2 * it.scale;
    const gap = (it.gap || 34) / 2 * it.scale;
    const T = 8 * it.scale;

    ctx.fillStyle = '#141c28';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;

    // Üst ve alt bıçaklar
    ctx.fillRect(-T, gap, T * 2, W - gap);
    ctx.strokeRect(-T, gap, T * 2, W - gap);
    ctx.fillRect(-T, -W, T * 2, W - gap);
    ctx.strokeRect(-T, -W, T * 2, W - gap);

    // Yarık kenar vurgusu
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(-T, gap - 2, T * 2, 2);
    ctx.fillRect(-T, -gap, T * 2, 2);

    ctx.restore();
  }

  // ---- Optik Güç Sensörü / Spektrometre ----
  function drawSensor(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const w = (it.swidth || 84) / 2 * it.scale;
    const h = (it.sheight || 34) / 2 * it.scale;

    // Sensör kasası
    ctx.fillStyle = '#111824';
    ctx.fillRect(-w, -h, w * 2, h * 2);
    ctx.strokeStyle = 'rgba(120, 190, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-w, -h, w * 2, h * 2);

    // Aktif fotodiyot alanı (sol taraf)
    const pw = (it.sensorData && it.sensorData.power > 0.05);
    ctx.fillStyle = pw ? '#00e5ff' : '#00334d';
    if (pw) {
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 12;
    }
    ctx.fillRect(-w + 3, -h + 6, 8, h * 2 - 12);
    ctx.shadowColor = 'transparent';

    // Durum ledi ve ekran etiketi
    ctx.fillStyle = pw ? '#55ff77' : '#ff4444';
    ctx.beginPath();
    ctx.arc(w - 10, -h + 10, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const val = it.sensorData && it.sensorData.hits > 0 ? (it.sensorData.power * 2.5).toFixed(1) + 'mW' : '0.0mW';
    ctx.fillText(val, 4, 3);

    ctx.restore();
  }

  // ---- Açıölçer / İletki (Protractor Tool) ----
  function drawProtractor(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const R = (it.radius || 110) * it.scale;

    // Yarı saydam disk
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 25, 45, 0.48)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(154, 215, 255, 0.75)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // İç halka
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(154, 215, 255, 0.25)';
    ctx.stroke();

    // Merkez artı işareti
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Derece çizgileri ve sayılar
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(215, 235, 255, 0.85)';

    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const is10 = deg % 10 === 0;
      const is90 = deg % 90 === 0;
      const len = is90 ? 12 : is10 ? 8 : 4;

      ctx.beginPath();
      ctx.moveTo(c * (R - len), s * (R - len));
      ctx.lineTo(c * R, s * R);
      ctx.strokeStyle = is90 ? 'rgba(255,255,255,0.9)' : is10 ? 'rgba(180,225,255,0.7)' : 'rgba(180,225,255,0.3)';
      ctx.lineWidth = is90 ? 1.5 : 1;
      ctx.stroke();

      if (is10 && deg % 30 === 0) {
        const tr = R - 20;
        ctx.fillText(deg + '°', c * tr, s * tr);
      }
    }
    ctx.restore();
  }

  // ---- Ölçüm Cetveli (Ruler Tool) ----
  function drawRuler(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const L = (it.rlen || 260) / 2 * it.scale;
    const W = 18 * it.scale;

    // Cetvel gövdesi
    ctx.fillStyle = 'rgba(15, 25, 42, 0.65)';
    ctx.fillRect(-L, -W, L * 2, W * 2);
    ctx.strokeStyle = 'rgba(154, 215, 255, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-L, -W, L * 2, W * 2);

    // Milimetre çizgileri
    ctx.fillStyle = 'rgba(210, 235, 255, 0.85)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (let x = -L + 10; x <= L - 10; x += 5) {
      const idx = Math.round((x + L - 10) / 5);
      const is10 = idx % 10 === 0;
      const is5 = idx % 5 === 0;
      const len = is10 ? 10 : is5 ? 6 : 3;

      ctx.beginPath();
      ctx.moveTo(x, -W);
      ctx.lineTo(x, -W + len);
      ctx.strokeStyle = is10 ? 'rgba(255,255,255,0.85)' : 'rgba(180,225,255,0.45)';
      ctx.stroke();

      if (is10) {
        ctx.fillText(idx / 2 + 'cm', x, -W + 15);
      }
    }
    ctx.restore();
  }

  // ---- Elmas Yüzeyleri ----
  const FACETS = {
    crown: [
      [[-0.5, -0.05], [-0.27, -0.21], [-0.13, -0.21], [-0.25, -0.05]],
      [[-0.25, -0.05], [-0.13, -0.21], [0, -0.05]],
      [[-0.13, -0.21], [0.13, -0.21], [0, -0.05]],
      [[0, -0.05], [0.13, -0.21], [0.25, -0.05]],
      [[0.25, -0.05], [0.13, -0.21], [0.27, -0.21], [0.5, -0.05]],
    ],
    pav: [
      [[-0.5, -0.02], [-0.25, -0.02], [0, 0.42]],
      [[-0.25, -0.02], [0, -0.02], [0, 0.42]],
      [[0, -0.02], [0.25, -0.02], [0, 0.42]],
      [[0.25, -0.02], [0.5, -0.02], [0, 0.42]],
    ],
  };

  function drawDiamondFacets(it) {
    const k = 175 * it.scale;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.scale(k, k);
    ctx.lineWidth = 1 / k;
    ctx.lineJoin = 'round';
    const draw = (list, base) => {
      list.forEach((f, i) => {
        ctx.beginPath();
        ctx.moveTo(f[0][0], f[0][1]);
        for (let j = 1; j < f.length; j++) ctx.lineTo(f[j][0], f[j][1]);
        ctx.closePath();
        ctx.fillStyle = 'rgba(210,230,255,' + (base + (i % 2) * 0.07) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(235,245,255,0.34)';
        ctx.stroke();
      });
    };
    draw(FACETS.crown, 0.03);
    draw(FACETS.pav, 0.02);
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.05);
    ctx.lineTo(0.5, -0.05);
    ctx.moveTo(-0.5, -0.02);
    ctx.lineTo(0.5, -0.02);
    ctx.strokeStyle = 'rgba(235,245,255,0.3)';
    ctx.stroke();
    ctx.restore();
  }

  function drawLensExtras(it) {
    const g = it.geo;
    if (!g || !g.poly) return;
    path(g.poly.map((p) => [it.x + (p[0] - it.x) * 0.9, it.y + (p[1] - it.y) * 0.9]));
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(210,235,255,0.18)';
    ctx.stroke();

    // Optik merkez işareti
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(it.x, it.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPrismExtras(it) {
    const g = it.geo;
    if (!g || !g.poly) return;
    const inset = g.poly.map((p) => [it.x + (p[0] - it.x) * 0.88, it.y + (p[1] - it.y) * 0.88]);
    path(inset);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(210,235,255,0.15)';
    ctx.stroke();
  }

  function drawDBlockExtras(it) {
    // Merkez hizalama çentiği
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-1.5, -6, 3, 12);
    ctx.restore();
  }

  // ---- Işık Kaynağı Kasaları ----
  function drawSource(it) {
    const g = it.geo;
    const col = it.mono || it.stype === 'laser' || it.stype === 'multibeam' ? LT.lamCss(it.lam) : 'rgb(255,250,240)';
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const { bx0, bx1, hh } = g;
    const rr = it.stype === 'point' ? 15 : 6;

    ctx.beginPath();
    if (it.stype === 'point') ctx.arc(0, 0, 15, 0, Math.PI * 2);
    else ctx.roundRect(bx0, -hh, bx1 - bx0, hh * 2, rr);

    const gr = ctx.createLinearGradient(0, -hh, 0, hh);
    gr.addColorStop(0, '#364052');
    gr.addColorStop(0.5, '#1b222e');
    gr.addColorStop(1, '#0e131a');
    ctx.fillStyle = gr;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();

    // Yayıcı ön yüz ve detaylar
    if (it.stype === 'beam') {
      const ex = ctx.createLinearGradient(bx1 - 9, 0, bx1 + 2, 0);
      ex.addColorStop(0, 'rgba(255,255,255,0)');
      ex.addColorStop(1, col);
      ctx.fillStyle = ex;
      ctx.fillRect(bx1 - 9, -(it.width / 2), 10, it.width);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = bx0 + 8; x < bx1 - 12; x += 6) ctx.fillRect(x, -hh + 5, 1.4, hh * 2 - 10);
    } else if (it.stype === 'multibeam') {
      // Çoklu lazer diyot portları
      const count = it.rayCount || 5;
      const sp = it.raySpacing || 18;
      for (let i = 0; i < count; i++) {
        const py = (i - (count - 1) / 2) * sp;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.fillRect(bx1 - 4, py - 2.5, 5, 5);
        ctx.shadowColor = 'transparent';
      }
      // Lazer tehlike şeritleri
      ctx.fillStyle = 'rgba(255, 204, 0, 0.4)';
      ctx.fillRect(bx0 + 6, -hh + 4, 12, hh * 2 - 8);
    } else if (it.stype === 'point') {
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
      rg.addColorStop(0, '#fff');
      rg.addColorStop(0.35, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Tek lazer
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fillRect(bx1 - 4, -3, 5, 6);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(bx0 + 6, -hh + 2, 26, 2);
    }
    ctx.restore();
  }

  LT.drawGlass = function () {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S.W, S.H);
    for (const it of S.items) {
      if (it.kind === 'bubble') continue;
      if (it.kind === 'source') drawSource(it);
      else if (it.kind === 'mirror') drawMirror(it);
      else if (it.kind === 'splitter') drawSplitter(it);
      else if (it.kind === 'screen') drawScreen(it);
      else if (it.kind === 'aperture') drawAperture(it);
      else if (it.kind === 'sensor') drawSensor(it);
      else if (it.kind === 'protractor') drawProtractor(it);
      else if (it.kind === 'ruler') drawRuler(it);
      else {
        drawGlassBody(it);
        if (it.kind === 'diamond') drawDiamondFacets(it);
        else if (it.kind === 'lens') drawLensExtras(it);
        else if (it.kind === 'prism') drawPrismExtras(it);
        else if (it.kind === 'dblock') drawDBlockExtras(it);
      }
    }
  };
})();
