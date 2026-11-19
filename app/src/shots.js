/* Vice Cover Studio — screenshot presets.
 * Reads the page's query string and sets the editor up for a shot, so the
 * screenshots are reproducible: ?shot=cover | editor | cover2 | cover3,
 * with ?layout= ?grade= ?caption= ?subtitle= ?badge= ?size= overrides.
 * Runs after main.js; it only drives the editor's own public hooks.
 */
(function () {
  'use strict';

  var PRESETS = {
    cover: {
      layout: 'hero-stack', grade: 'sunset', caption: 'VICE CITY',
      subtitle: 'neon nights', badge: 'EST. 2026', captionColor: 'sunset',
      size: '1920x1080',
      panels: [
        { photo: 0, zoom: 1, dx: 0, dy: 0.1 },
        { photo: 1, zoom: 1, dx: 0, dy: 0 },
        { photo: 0, zoom: 1.05, dx: 0, dy: 0.32 }
      ]
    },
    cover2: {
      layout: 'nine', grade: 'neon', caption: 'NEON SHORE',
      subtitle: 'after dark', badge: 'VICE CITY', captionColor: 'neon',
      size: '1080x1350'
    },
    cover3: {
      layout: 'diagonal', grade: 'dusk', caption: 'PALM DUSK',
      subtitle: 'golden hour', badge: 'EST. 2026', captionColor: 'white',
      captionSize: 85,
      size: '1080x1080',
      panels: [
        { photo: 0, zoom: 1, dx: 0, dy: 0.3 },
        { photo: 1, zoom: 1, dx: 0, dy: 0 },
        { photo: 0, zoom: 1.3, dx: 0, dy: 0.22 },
        { photo: 1, zoom: 1, dx: 0, dy: 0 }
      ]
    },
    editor: {
      layout: 'hero-stack', grade: 'sunset', caption: 'VICE CITY',
      subtitle: 'neon nights', badge: 'EST. 2026', captionColor: 'sunset',
      size: '1920x1080',
      panels: [
        { photo: 0, zoom: 1, dx: 0, dy: 0.1 },
        { photo: 1, zoom: 1, dx: 0, dy: 0 },
        { photo: 0, zoom: 1.05, dx: 0, dy: 0.32 }
      ]
    }
  };

  function waitForPhotos() {
    return new Promise(function (resolve) {
      var tries = 0;
      (function check() {
        tries++;
        if (window.__viceCover && window.__viceCover.photosLoaded() >= 2) return resolve();
        if (tries > 200) return resolve();
        setTimeout(check, 50);
      })();
    });
  }

  /* Bias portrait photos toward the top of wider panels, as the editor does. */
  function biasPortraitCrops(st) {
    var VC = window.ViceCover;
    var layout = VC && VC.LAYOUTS[st.layout];
    if (!layout) return;
    var dims = (st.size || '1920x1080').split('x');
    var W = Number(dims[0]) || 1920, H = Number(dims[1]) || 1080;
    var slots = layout.slots(W, H);
    st.panels.forEach(function (p, i) {
      var img = st.photos[p.photo];
      var s = slots[i];
      if (!img || !s || s.kind === 'title') return;
      var slotAspect = (s.w * W) / (s.h * H);
      var photoAspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
      if (photoAspect < slotAspect && p.zoom === 1 && p.dy === 0) p.dy = 0.14;
    });
  }

  function applyShot() {
    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    if (!shot || !PRESETS[shot]) return;
    var patch = {};
    var base = PRESETS[shot];
    Object.keys(base).forEach(function (k) { if (k !== 'panels') patch[k] = base[k]; });
    ['layout', 'grade', 'caption', 'subtitle', 'badge', 'captionColor', 'size'].forEach(function (k) {
      var v = params.get(k);
      if (v) patch[k] = v;
    });
    if (params.get('caption')) patch.caption = params.get('caption').toUpperCase();
    waitForPhotos().then(function () {
      window.__viceCover.setState(patch);
      var st = window.__viceCover.getState();
      if (base.panels) {
        /* A preset's own crops: photo, zoom and pan per panel. */
        base.panels.forEach(function (c, i) {
          if (st.panels[i]) {
            st.panels[i] = { photo: c.photo, zoom: c.zoom || 1, dx: c.dx || 0, dy: c.dy || 0 };
          }
        });
      } else {
        /* Alternate the panels' photos so multi-photo covers show variety. */
        st.panels.forEach(function (p, i) { p.photo = i % Math.max(1, st.photos.length); });
        biasPortraitCrops(st);
      }
      /* ?panels=0,1,0 assigns a photo index to each panel in order. */
      var panelSpec = params.get('panels');
      if (panelSpec) {
        panelSpec.split(',').forEach(function (v, i) {
          var n = parseInt(v, 10);
          if (st.panels[i] && !isNaN(n) && st.photos[n]) st.panels[i].photo = n;
        });
      }
      window.__viceCover.renderPreview();
      document.body.setAttribute('data-shot-ready', 'true');
    });
  }

  document.addEventListener('DOMContentLoaded', applyShot);
})();
