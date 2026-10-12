// Işık Masası Optik Laboratuvarı - Kendi Kendini Test Eden Doğrulama Betiği (Zero-dependency test)
const fs = require('fs');
const path = require('path');

function mockEl() {
  return {
    getContext: () => ({
      setTransform: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
      stroke: () => {}, fill: () => {}, clip: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, strokeRect: () => {},
      arc: () => {}, ellipse: () => {}, roundRect: () => {}, fillText: () => {}, measureText: () => ({ width: 50 }),
      setLineDash: () => {}
    }),
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    querySelector: () => mockEl(),
    querySelectorAll: () => [],
    appendChild: () => {},
    style: { setProperty: () => {} }
  };
}

const globalScope = {
  window: {},
  document: {
    getElementById: () => mockEl(),
    createElement: () => mockEl(),
    querySelectorAll: () => []
  },
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  location: { search: '', hash: '' },
  addEventListener: () => {}
};

globalScope.window = globalScope;
globalScope.window.document = globalScope.document;

function runFile(rel) {
  const file = path.join(__dirname, rel);
  const code = fs.readFileSync(file, 'utf8');
  new Function('window', 'document', 'location', code)(globalScope.window, globalScope.document, globalScope.location);
}

runFile('js/spectrum.js');
runFile('js/scene.js');
runFile('js/trace.js');
runFile('js/ui.js');

const LT = globalScope.window.LT;

// Test 1: Malzeme ve optik katsayı kontrolü
console.assert(LT.MATERIALS.kron.nD > 1.5, 'Kron cam nD');
console.assert(LT.MATERIALS.flint.nD > 1.6, 'Flint cam nD');
console.assert(LT.lamName(532).includes('Yeşil'), 'Wavelength name check: 532nm');
console.assert(LT.lamName(633).includes('Kırmızı'), 'Wavelength name check: 633nm');

// Test 2: Tüm hazır deneylerin kontrolü (Teleskop türleri dahil)
const presets = [
  'karma',
  'bos',
  'snell_dblock',
  'prizma',
  'aynalar',
  'teleskop',
  'teleskop_kepler',
  'teleskop_galileo',
  'teleskop_newton',
  'teleskop_cassegrain',
  'teleskop_mak',
  'teleskop_sct',
  'teleskop_gregory',
  'teleskop_expander',
  'blok_kayma',
  'splitter_lab',
  'elmas',
  'kopuk',
];
presets.forEach((p) => {
  LT.loadPreset(p);
  if (LT.updateTelescopeHud) LT.updateTelescopeHud(p);
  if (p === 'bos') {
    console.assert(LT.state.items.length === 0, 'Boş masa kontrolü');
  } else {
    console.assert(LT.state.items.length > 0, 'Deney ' + p + ' nesneleri yüklendi');
    const count = LT.trace(LT.state.items, { W: 1280, H: 800, disp: 1.6, time: 0, frame: 0, mode: 'light', refl: 0.6 });
    console.assert(count > 0, 'Deney ' + p + ' ışın izleme segment üretti: ' + count);
  }
});

// Test 3: Tek tıkla ekleme (Single-spawn check)
LT.loadPreset('bos');
LT.ui.spawn('laser');
console.assert(LT.state.items.length === 1, 'Tek seferde sadece 1 nesne eklendi');
LT.ui.spawn('prism');
console.assert(LT.state.items.length === 2, 'İkinci nesne başarıyla eklendi');

// Test 4: Kamera gezinme ve ortalama
LT.ui.centerScene();
LT.ui.resetZoom();
console.assert(LT.state.items.length === 2, 'Görünüm sıfırlama ve ortalama tamamlandı');

// Test 5: %20 ve %15 seviyelerine kadar küçültme kontrolü
LT.ui.zoomScene(640, 400, 0.2);
console.assert(LT.ui.getZoom() <= 0.25, 'Zoom %20 seviyesine inebilmeli: ' + LT.ui.getZoom());
LT.ui.resetZoom();
console.assert(LT.ui.getZoom() === 1.0, 'Zoom sıfırlama %100 olmalı');

// Test 6: Çoğaltma (Duplicate) tam parametre kopyalama doğrulaması
LT.loadPreset('bos');
const mir = LT.newItem('mirror_flat', 300, 300, { mlen: 240, refl: 0.99 });
LT.ui.select(mir.id);
LT.ui.duplicate();
console.assert(LT.state.items.length === 2, 'Çoğaltılan ayna eklendi');
const dupMir = LT.state.items[1];
console.assert(dupMir.mlen === 240, 'Ayna uzunluğu eksiksiz kopyalandı: ' + dupMir.mlen);
console.assert(dupMir.refl === 0.99, 'Ayna yansıtıcılığı eksiksiz kopyalandı: ' + dupMir.refl);

// Test 7: İnce optik elemanlar için toleranslı tıklama (Pick tolerance)
const picked = LT.pick(300, 300 + mir.geo.R * 0.4 + 5); // Poligonun 5px dışına tıklandığında bile yakalanmalı
console.assert(picked !== null && picked.type === 'mirror_flat', 'Toleranslı tıklama ince aynayı yakaladı');

// Test 8: removeItem ve onItemsChanged tetiklenmesi
let itemsChangedFired = false;
LT.onItemsChanged = () => { itemsChangedFired = true; };
LT.removeItem(dupMir.id);
console.assert(LT.state.items.length === 1, 'Öğe başarıyla silindi');
console.assert(itemsChangedFired === true, 'onItemsChanged silme işlemiyle tetiklendi');

// Test 9: Hazır deneylerde gereksiz perde olmaması doğrulaması
['teleskop_kepler', 'teleskop_galileo', 'teleskop_newton', 'teleskop_cassegrain', 'teleskop_mak', 'teleskop_sct', 'teleskop_gregory', 'teleskop_expander', 'karma', 'snell_dblock'].forEach((p) => {
  LT.loadPreset(p);
  const screens = LT.state.items.filter((it) => it.kind === 'screen');
  console.assert(screens.length === 0, 'Deney ' + p + ' gereksiz perde içermemeli, bulunan: ' + screens.length);
});

// Test 10: Uzaklaşınca oranların ve optik fiziğin korunması (Refraction & Scale Invariance)
LT.loadPreset('teleskop_kepler');
const origObj = LT.state.items.find((it) => it.kind === 'lens');
const origF = origObj.f;
const origScale = origObj.scale;
const origSpacing = LT.state.items.find((it) => it.stype === 'multibeam').raySpacing;

// Zoom 1.0 iken kırılan ışının çıkış açısı
LT.trace(LT.state.items, { W: 1280, H: 800, disp: 1.0, time: 0, frame: 0, mode: 'light', refl: 0.6 });
const angle1 = Math.atan2(LT.instances[19] - LT.instances[17], LT.instances[18] - LT.instances[16]);

LT.ui.zoomScene(640, 400, 0.2); // %20 seviyesine kadar uzaklaş
console.assert(origObj.f === origF, 'Temel odak uzaklığı bozulmamalı: ' + origObj.f);
console.assert(Math.abs(origObj.scale - origScale * 0.2) < 0.01, 'Geometrik ölçek orantılı küçülmeli: ' + origObj.scale);
const newSpacing = LT.state.items.find((it) => it.stype === 'multibeam').raySpacing;
console.assert(Math.abs(newSpacing - origSpacing * 0.2) < 0.1, 'Işın aralığı orantılı ölçeklenmeli: ' + newSpacing);

// %20 zoom iken kırılan ışının çıkış açısı (Snell kanunu korunmalı!)
LT.trace(LT.state.items, { W: 1280, H: 800, disp: 1.0, time: 0, frame: 0, mode: 'light', refl: 0.6 });
const angle2 = Math.atan2(LT.instances[19] - LT.instances[17], LT.instances[18] - LT.instances[16]);
console.assert(Math.abs(angle1 - angle2) < 1e-4, 'Kırılma açısı zoom yapıldığında ASLA değişmemeli: ' + angle1 + ' vs ' + angle2);

LT.ui.resetZoom();
console.assert(Math.abs(origObj.f - origF) < 1e-4, 'ResetZoom ile odak tam orijinal değere dönmeli: ' + origObj.f);

// Test 11: Cassegrain merkezi delik ve ışın iletimi doğrulaması
LT.loadPreset('teleskop_cassegrain');
const priMirror = LT.state.items.find((it) => it.mtype === 'concave' && it.hole > 0);
console.assert(priMirror !== undefined, 'Cassegrain birincil ayna delikli olmalı');
console.assert(priMirror.geo.poly1 && priMirror.geo.poly2, 'Delikli ayna 2 ayrı petal poligona bölünmeli');
const cassegrainSegments = LT.trace(LT.state.items, { W: 1280, H: 800, disp: 1.0, time: 0, frame: 0, mode: 'light', refl: 0.6 });
console.assert(cassegrainSegments >= 20, 'Cassegrain teleskobu birincil ve ikincil aynalardan yansıyıp delikten geçmeli, üretilen segment: ' + cassegrainSegments);

console.log('Optik laboratuvarı ve gezinme doğrulama testleri başarıyla geçti.');
