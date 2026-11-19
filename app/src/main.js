/* Vice Cover Studio — editor.
 * Wires the controls to the cover renderer: photo uploads and samples,
 * per-panel crop and position, layouts, grades, caption editing, undo/redo
 * and PNG export at the three post sizes. Photos are read on this machine
 * and never leave it.
 */
(function () {
  'use strict';

  var VC = window.ViceCover;

  /* ---- state ------------------------------------------------------------ */

  function freshPanels() {
    var panels = [];
    for (var i = 0; i < 9; i++) {
      panels.push({ photo: i % 2, zoom: 1, dx: 0, dy: 0 });
    }
    return panels;
  }

  var state = {
    layout: 'hero-stack',
    grade: 'sunset',
    caption: 'VICE CITY',
    captionColor: 'sunset',
    captionPosition: 'bottom',
    captionSize: 100,
    subtitle: 'neon nights',
    badge: 'EST. 2026',
    size: '1920x1080',
    photos: [],
    photoNames: [],
    panels: freshPanels(),
    selectedPanel: 0
  };

  /* Undo / redo: snapshots of everything but the loaded Image objects. */
  var history = { past: [], future: [] };

  function snapshotState() {
    return JSON.parse(JSON.stringify({
      layout: state.layout, grade: state.grade, caption: state.caption,
      captionColor: state.captionColor, captionPosition: state.captionPosition,
      captionSize: state.captionSize, subtitle: state.subtitle, badge: state.badge,
      size: state.size, panels: state.panels, selectedPanel: state.selectedPanel
    }));
  }

  function restoreSnapshot(snap) {
    state.layout = snap.layout; state.grade = snap.grade;
    state.caption = snap.caption; state.captionColor = snap.captionColor;
    state.captionPosition = snap.captionPosition; state.captionSize = snap.captionSize;
    state.subtitle = snap.subtitle; state.badge = snap.badge;
    state.size = snap.size; state.panels = snap.panels;
    state.selectedPanel = snap.selectedPanel;
  }

  function pushHistory() {
    history.past.push(snapshotState());
    if (history.past.length > 40) history.past.shift();
    history.future.length = 0;
    syncUndoButtons();
  }

  function undo() {
    if (!history.past.length) return;
    history.future.push(snapshotState());
    restoreSnapshot(history.past.pop());
    syncAllControls();
    renderPreview();
    syncUndoButtons();
  }

  function redo() {
    if (!history.future.length) return;
    history.past.push(snapshotState());
    restoreSnapshot(history.future.pop());
    syncAllControls();
    renderPreview();
    syncUndoButtons();
  }

  function syncUndoButtons() {
    var u = document.getElementById('undoBtn');
    var r = document.getElementById('redoBtn');
    if (u) u.disabled = !history.past.length;
    if (r) r.disabled = !history.future.length;
  }

  /* ---- photos ----------------------------------------------------------- */

  function addPhoto(img, name) {
    state.photos.push(img);
    state.photoNames.push(name || ('Photo ' + state.photos.length));
    renderPhotoList();
  }

  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadSample(name, file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = 'samples/' + file;
    }).then(function (img) {
      addPhoto(img, name);
      return img;
    });
  }

  /* Load the samples one after another so their order is always the same:
   * photos[0] is Boulevard, photos[1] is Pier. */
  function loadDefaultSamples() {
    return loadSample('Boulevard', 'boulevard.jpg')
      .then(function () { return loadSample('Pier', 'pier.jpg'); });
  }

  /* When a portrait photo lands in a wider panel, cover-fit crops its top
   * and bottom; bias the crop toward the top so faces stay in frame.
   * Only applies while the panel's crop is still at its defaults. */
  function smartCrop(panelIndex) {
    var crop = state.panels[panelIndex];
    var img = state.photos[crop.photo];
    if (!img || crop.zoom !== 1 || crop.dx !== 0 || crop.dy !== 0) return;
    var layout = VC.LAYOUTS[state.layout];
    if (!layout) return;
    var size = currentSize();
    var slots = layout.slots(size.width, size.height);
    var s = slots[panelIndex];
    if (!s || s.kind === 'title') return;
    var slotAspect = (s.w * size.width) / (s.h * size.height);
    var photoAspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
    if (photoAspect < slotAspect) crop.dy = 0.14;
  }

  /* Fill every panel with one photo, keeping each panel's crop. */
  function fillAllPanels(photoIndex) {
    pushHistory();
    for (var i = 0; i < state.panels.length; i++) {
      state.panels[i].photo = photoIndex;
      smartCrop(i);
    }
    renderPreview();
  }

  /* ---- preview ---------------------------------------------------------- */

  var previewCanvas = null;
  var previewW = 0, previewH = 0;
  var previewRaf = 0;

  function currentSize() {
    for (var i = 0; i < VC.EXPORT_SIZES.length; i++) {
      if (VC.EXPORT_SIZES[i].id === state.size) return VC.EXPORT_SIZES[i];
    }
    return VC.EXPORT_SIZES[2];
  }

  /* The render state: caption size scales the lettering box. */
  function renderState() {
    var s = snapshotState();
    s.photos = state.photos;
    return s;
  }

  function renderPreview() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(function () {
      var size = currentSize();
      var scale = Math.min(920 / size.width, 620 / size.height);
      previewW = Math.round(size.width * scale);
      previewH = Math.round(size.height * scale);
      previewCanvas.width = previewW;
      previewCanvas.height = previewH;
      var cover = VC.renderCover(renderState(), previewW, previewH);
      var ctx = previewCanvas.getContext('2d');
      ctx.drawImage(cover, 0, 0);
      drawSelectionOutline(ctx);
    });
  }

  /* A dashed outline around the selected panel on the preview. */
  function drawSelectionOutline(ctx) {
    var layout = VC.LAYOUTS[state.layout];
    if (!layout) return;
    var slots = layout.slots(previewW, previewH);
    var s = slots[state.selectedPanel];
    if (!s || s.kind === 'title') return;
    ctx.save();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(s.x * previewW + 2, s.y * previewH + 2, s.w * previewW - 4, s.h * previewH - 4);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ---- panel picking and dragging --------------------------------------- */

  var drag = null;

  function canvasPoint(evt) {
    var rect = previewCanvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * previewCanvas.width / rect.width,
      y: (evt.clientY - rect.top) * previewCanvas.height / rect.height
    };
  }

  function onPreviewPointerDown(evt) {
    var p = canvasPoint(evt);
    var idx = VC.pickSlot(renderState(), previewW, previewH, p.x, p.y);
    if (idx < 0) return;
    pushHistory();
    state.selectedPanel = idx;
    drag = { x: p.x, y: p.y, moved: false };
    previewCanvas.setPointerCapture(evt.pointerId);
    syncPanelControls();
    renderPreview();
  }

  function onPreviewPointerMove(evt) {
    if (!drag) return;
    var p = canvasPoint(evt);
    var crop = state.panels[state.selectedPanel];
    var dx = (p.x - drag.x) / previewW;
    var dy = (p.y - drag.y) / previewH;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) drag.moved = true;
    crop.dx = Math.max(-0.6, Math.min(0.6, crop.dx + dx));
    crop.dy = Math.max(-0.6, Math.min(0.6, crop.dy + dy));
    drag.x = p.x; drag.y = p.y;
    syncPanelControls();
    renderPreview();
  }

  function onPreviewPointerUp() { drag = null; }

  function onPreviewWheel(evt) {
    evt.preventDefault();
    var crop = state.panels[state.selectedPanel];
    pushHistory();
    var factor = evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    crop.zoom = Math.max(0.5, Math.min(4, crop.zoom * factor));
    syncPanelControls();
    renderPreview();
  }

  /* ---- photo list -------------------------------------------------------- */

  function renderPhotoList() {
    var list = document.getElementById('photoList');
    if (!list) return;
    list.innerHTML = '';
    state.photoNames.forEach(function (name, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb-btn';
      btn.textContent = name;
      btn.title = 'Use this photo in the selected panel';
      btn.addEventListener('click', function () {
        pushHistory();
        state.panels[state.selectedPanel].photo = i;
        smartCrop(state.selectedPanel);
        syncPanelControls();
        renderPreview();
      });
      list.appendChild(btn);
    });
    var fill = document.getElementById('fillAllBtn');
    if (fill) fill.disabled = state.photos.length === 0;
    syncPanelPhotoSelect();
  }

  function syncPanelPhotoSelect() {
    var sel = document.getElementById('panelPhoto');
    if (!sel) return;
    sel.innerHTML = '';
    state.photoNames.forEach(function (name, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = String(state.panels[state.selectedPanel].photo || 0);
  }

  /* ---- controls ---------------------------------------------------------- */

  function setPressed(containerId, value) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var buttons = container.querySelectorAll('button[data-value]');
    buttons.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-value') === value);
      b.setAttribute('aria-pressed', b.getAttribute('data-value') === value ? 'true' : 'false');
    });
  }

  function syncPanelControls() {
    var crop = state.panels[state.selectedPanel];
    var sel = document.getElementById('panelPhoto');
    if (sel) sel.value = String(crop.photo || 0);
    var zoom = document.getElementById('panelZoom');
    if (zoom) zoom.value = String(crop.zoom);
    var zx = document.getElementById('panelZoomVal');
    if (zx) zx.textContent = Math.round(crop.zoom * 100) + '%';
    var px = document.getElementById('panelPanX');
    if (px) px.value = String(Math.round(crop.dx * 100));
    var py = document.getElementById('panelPanY');
    if (py) py.value = String(Math.round(crop.dy * 100));
    var label = document.getElementById('selectedPanelLabel');
    if (label) label.textContent = 'Panel ' + (state.selectedPanel + 1);
  }

  function syncAllControls() {
    setPressed('layoutGrid', state.layout);
    setPressed('gradeGrid', state.grade);
    setPressed('sizeGrid', state.size);
    setPressed('captionColorGrid', state.captionColor);
    setPressed('captionPositionGrid', state.captionPosition);
    var cap = document.getElementById('captionInput');
    if (cap) cap.value = state.caption;
    var sub = document.getElementById('subtitleInput');
    if (sub) sub.value = state.subtitle;
    var badge = document.getElementById('badgeInput');
    if (badge) badge.value = state.badge;
    var cs = document.getElementById('captionSize');
    if (cs) cs.value = String(state.captionSize);
    syncPanelControls();
  }

  function bindChoiceGrid(containerId, apply) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('button[data-value]').forEach(function (b) {
      b.addEventListener('click', function () {
        pushHistory();
        apply(b.getAttribute('data-value'));
        setPressed(containerId, b.getAttribute('data-value'));
        renderPreview();
      });
    });
  }

  function bindTextInput(id, apply) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      apply(el.value);
      renderPreview();
    });
    el.addEventListener('change', pushHistory);
  }

  /* ---- export ------------------------------------------------------------ */

  function exportCover(sizeId) {
    var size = null;
    for (var i = 0; i < VC.EXPORT_SIZES.length; i++) {
      if (VC.EXPORT_SIZES[i].id === sizeId) size = VC.EXPORT_SIZES[i];
    }
    if (!size) size = currentSize();
    var canvas = VC.renderCover(renderState(), size.width, size.height);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'vice-cover-' + size.id + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        resolve(blob);
      }, 'image/png');
    });
  }

  function exportPNGDataURL(sizeId) {
    var size = null;
    for (var i = 0; i < VC.EXPORT_SIZES.length; i++) {
      if (VC.EXPORT_SIZES[i].id === sizeId) size = VC.EXPORT_SIZES[i];
    }
    if (!size) size = currentSize();
    return VC.renderCover(renderState(), size.width, size.height).toDataURL('image/png');
  }

  /* ---- boot -------------------------------------------------------------- */

  function init() {
    previewCanvas = document.getElementById('preview');
    bindChoiceGrid('layoutGrid', function (v) { state.layout = v; state.selectedPanel = 0; syncPanelControls(); });
    bindChoiceGrid('gradeGrid', function (v) { state.grade = v; });
    bindChoiceGrid('sizeGrid', function (v) { state.size = v; });
    bindChoiceGrid('captionColorGrid', function (v) { state.captionColor = v; });
    bindChoiceGrid('captionPositionGrid', function (v) { state.captionPosition = v; });
    bindTextInput('captionInput', function (v) { state.caption = v.toUpperCase(); });
    bindTextInput('subtitleInput', function (v) { state.subtitle = v; });
    bindTextInput('badgeInput', function (v) { state.badge = v; });
    var cs = document.getElementById('captionSize');
    if (cs) {
      cs.addEventListener('input', function () {
        state.captionSize = Number(cs.value);
        renderPreview();
      });
      cs.addEventListener('change', pushHistory);
    }

    var upload = document.getElementById('photoUpload');
    if (upload) {
      upload.addEventListener('change', function () {
        var files = Array.prototype.slice.call(upload.files || []);
        var chain = Promise.resolve();
        files.forEach(function (f) {
          chain = chain.then(function () { return loadImageFile(f); })
            .then(function (img) { addPhoto(img, f.name.replace(/\.[^.]+$/, '')); });
        });
        chain.then(renderPreview);
        upload.value = '';
      });
    }

    var fill = document.getElementById('fillAllBtn');
    if (fill) {
      fill.addEventListener('click', function () {
        fillAllPanels(state.panels[state.selectedPanel].photo || 0);
      });
    }

    var panelPhoto = document.getElementById('panelPhoto');
    if (panelPhoto) {
      panelPhoto.addEventListener('change', function () {
        pushHistory();
        state.panels[state.selectedPanel].photo = Number(panelPhoto.value);
        smartCrop(state.selectedPanel);
        renderPreview();
      });
    }

    var zoom = document.getElementById('panelZoom');
    if (zoom) {
      zoom.addEventListener('input', function () {
        state.panels[state.selectedPanel].zoom = Number(zoom.value);
        syncPanelControls();
        renderPreview();
      });
      zoom.addEventListener('change', pushHistory);
    }

    var panX = document.getElementById('panelPanX');
    if (panX) {
      panX.addEventListener('input', function () {
        state.panels[state.selectedPanel].dx = Number(panX.value) / 100;
        renderPreview();
      });
      panX.addEventListener('change', pushHistory);
    }
    var panY = document.getElementById('panelPanY');
    if (panY) {
      panY.addEventListener('input', function () {
        state.panels[state.selectedPanel].dy = Number(panY.value) / 100;
        renderPreview();
      });
      panY.addEventListener('change', pushHistory);
    }

    var reset = document.getElementById('panelResetBtn');
    if (reset) {
      reset.addEventListener('click', function () {
        pushHistory();
        state.panels[state.selectedPanel] = { photo: state.panels[state.selectedPanel].photo, zoom: 1, dx: 0, dy: 0 };
        syncPanelControls();
        renderPreview();
      });
    }

    var download = document.getElementById('downloadBtn');
    if (download) download.addEventListener('click', function () { exportCover(state.size); });

    var undoBtn = document.getElementById('undoBtn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    var redoBtn = document.getElementById('redoBtn');
    if (redoBtn) redoBtn.addEventListener('click', redo);
    document.addEventListener('keydown', function (evt) {
      if ((evt.ctrlKey || evt.metaKey) && !evt.shiftKey && evt.key.toLowerCase() === 'z') { evt.preventDefault(); undo(); }
      if ((evt.ctrlKey || evt.metaKey) && (evt.shiftKey && evt.key.toLowerCase() === 'z' || evt.key.toLowerCase() === 'y')) { evt.preventDefault(); redo(); }
    });

    previewCanvas.addEventListener('pointerdown', onPreviewPointerDown);
    previewCanvas.addEventListener('pointermove', onPreviewPointerMove);
    previewCanvas.addEventListener('pointerup', onPreviewPointerUp);
    previewCanvas.addEventListener('pointerleave', onPreviewPointerUp);
    previewCanvas.addEventListener('wheel', onPreviewWheel, { passive: false });

    var sampleButtons = document.querySelectorAll('[data-sample]');
    sampleButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        loadSample(b.getAttribute('data-sample-label'), b.getAttribute('data-sample')).then(renderPreview);
      });
    });

    syncAllControls();
    syncUndoButtons();
    loadDefaultSamples().then(function () {
      renderPhotoList();
      renderPreview();
    });
  }

  /* Automation hooks for the screenshot helper (shots.js) and tests. */
  window.__viceCover = {
    getState: function () { return state; },
    setState: function (patch) {
      pushHistory();
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      syncAllControls();
      renderPreview();
    },
    renderCover: function (w, h) { return VC.renderCover(renderState(), w, h); },
    exportPNGDataURL: exportPNGDataURL,
    loadSample: loadSample,
    photosLoaded: function () { return state.photos.length; },
    renderPreview: renderPreview
  };

  document.addEventListener('DOMContentLoaded', init);
})();
