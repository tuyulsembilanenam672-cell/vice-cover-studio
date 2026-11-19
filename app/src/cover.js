/* Vice Cover Studio — cover renderer.
 * Draws a multi-panel GTA-style poster cover on a 2D canvas from any photos:
 * angled panel cuts, heavy black gutters, sunset / neon colour grades,
 * bold condensed caption lettering, halftone title block, grain, vignette.
 * Pure canvas, no network, no dependencies. All drawing is deterministic
 * for a given state (the grain uses a seeded generator, not Math.random).
 */
(function () {
  'use strict';

  /* A tiny seeded generator so the film grain is identical on every render. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* The three post sizes the bounty asks for. */
  var EXPORT_SIZES = [
    { id: '1080x1080', width: 1080, height: 1080, label: 'Square 1080 x 1080' },
    { id: '1080x1350', width: 1080, height: 1350, label: 'Portrait 1080 x 1350' },
    { id: '1920x1080', width: 1920, height: 1080, label: 'Wide 1920 x 1080' }
  ];

  /* Colour grades: a photo filter for the panels plus a tinted overlay. */
  var GRADES = {
    sunset: {
      label: 'Sunset', photoFilter: 'saturate(1.28) contrast(1.08) brightness(1.02)',
      tint: ['#ffb347', '#ff2975', '#7b2ff7'], tintMode: 'overlay', tintAlpha: 0.42
    },
    neon: {
      label: 'Neon Night', photoFilter: 'saturate(1.45) contrast(1.12)',
      tint: ['#ff2fb3', '#00e5ff'], tintMode: 'overlay', tintAlpha: 0.44
    },
    dusk: {
      label: 'Palm Dusk', photoFilter: 'saturate(1.15) contrast(1.06)',
      tint: ['#7b2ff7', '#00c2a8'], tintMode: 'soft-light', tintAlpha: 0.55
    },
    heat: {
      label: 'Heat Wave', photoFilter: 'saturate(1.32) contrast(1.1)',
      tint: ['#ff3d00', '#ffd319'], tintMode: 'overlay', tintAlpha: 0.3
    },
    mono: {
      label: 'Mono', photoFilter: 'grayscale(1) contrast(1.16) brightness(1.04)',
      tint: null, tintMode: 'overlay', tintAlpha: 0
    }
  };

  /* Caption colourways for the big title lettering. */
  var CAPTION_COLORS = {
    white: { fill: ['#ffffff', '#ffe9f6'], stroke: '#12041f' },
    sunset: { fill: ['#ffd319', '#ff2975', '#ff7a18'], stroke: '#160420' },
    neon: { fill: ['#00e5ff', '#ff2fb3'], stroke: '#0a0618' },
    black: { fill: ['#1a1a22', '#3a3a48'], stroke: '#ffffff' }
  };

  /* One panel slot. x, y, w, h are fractions of the cover; poly is an optional
   * list of [x, y] points in the slot's own unit square for an angled cut;
   * rot tilts the panel around its centre; kind 'title' is the caption block. */
  function slot(x, y, w, h, extra) {
    var s = { x: x, y: y, w: w, h: h, poly: null, rot: 0, kind: 'photo' };
    if (extra) {
      if (extra.poly) s.poly = extra.poly;
      if (extra.rot) s.rot = extra.rot;
      if (extra.kind) s.kind = extra.kind;
    }
    return s;
  }

  /* Six layouts. Each returns the panel slots for a cover of size W x H. */
  var LAYOUTS = {
    'hero-stack': {
      label: 'Hero + Stack',
      slots: function (W, H) {
        var heroW = 0.62;
        return [
          slot(0, 0, heroW, 1, { poly: [[0, 0], [1, 0], [0.93, 1], [0, 1]] }),
          slot(heroW, 0, 1 - heroW, 0.5, { poly: [[0.1, 0], [1, 0], [1, 1], [0, 1]] }),
          slot(heroW, 0.5, 1 - heroW, 0.5, { poly: [[0, 0], [1, 0], [1, 1], [0.08, 1]] })
        ];
      }
    },
    'nine': {
      label: 'Nine Panel',
      slots: function (W, H) {
        var cw = 1 / 3, ch = 1 / 3;
        var out = [];
        for (var r = 0; r < 3; r++) {
          for (var c = 0; c < 3; c++) {
            if (r === 1 && c === 1) {
              out.push(slot(c * cw, r * ch, cw, ch, { kind: 'title' }));
            } else {
              out.push(slot(c * cw, r * ch, cw, ch));
            }
          }
        }
        return out;
      }
    },
    'diagonal': {
      label: 'Diagonal Split',
      slots: function (W, H) {
        return [
          slot(0, 0, 1, 0.66, { poly: [[0, 0], [1, 0], [1, 0.82], [0, 1]] }),
          slot(0, 0.66, 0.34, 0.34, { poly: [[0, 0.28], [1, 0], [1, 1], [0, 1]] }),
          slot(0.34, 0.66, 0.33, 0.34, { poly: [[0, 0.14], [1, 0], [1, 1], [0, 1]] }),
          slot(0.67, 0.66, 0.33, 0.34, { poly: [[0, 0], [1, 0], [1, 1], [0, 1]] })
        ];
      }
    },
    'tilt': {
      label: 'Tilted Snapshots',
      slots: function (W, H) {
        return [
          slot(0, 0, 1, 1, { kind: 'photo' }),
          slot(0.06, 0.08, 0.52, 0.56, { rot: -4 }),
          slot(0.5, 0.3, 0.44, 0.46, { rot: 5 })
        ];
      }
    },
    'strip': {
      label: 'Film Strip',
      slots: function (W, H) {
        return [
          slot(0, 0, 1, 1, { kind: 'photo' }),
          slot(0.07, 0.1, 0.24, 0.58, { rot: -2 }),
          slot(0.38, 0.07, 0.24, 0.58, { rot: 1.5 }),
          slot(0.69, 0.1, 0.24, 0.58, { rot: -1 })
        ];
      }
    },
    'fullbleed': {
      label: 'Full Bleed',
      slots: function (W, H) {
        return [slot(0, 0, 1, 1, { kind: 'photo' })];
      }
    }
  };

  /* Where the caption band sits for each layout: [x, y, w, h] fractions.
   * The nine-panel layout carries its caption in the centre title cell. */
  var CAPTION_BANDS = {
    'hero-stack': [0, 0.78, 1, 0.22],
    'nine': [0, 0, 0, 0],
    'diagonal': [0, 0.8, 1, 0.2],
    'tilt': [0, 0.76, 1, 0.24],
    'strip': [0, 0.74, 1, 0.26],
    'fullbleed': [0, 0.76, 1, 0.24]
  };

  /* ---- photo drawing --------------------------------------------------- */

  /* Draw one photo into a slot, cover-fit, with the panel's crop applied.
   * crop: { zoom, dx, dy } where dx/dy are fractions of the slot size. */
  function drawPhotoInto(ctx, img, px, py, pw, ph, crop, photoFilter) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var base = Math.max(pw / iw, ph / ih) * (crop.zoom || 1);
    var dw = iw * base, dh = ih * base;
    var dx = px + (pw - dw) / 2 + (crop.dx || 0) * pw;
    var dy = py + (ph - dh) / 2 + (crop.dy || 0) * ph;
    ctx.save();
    if (photoFilter) { try { ctx.filter = photoFilter; } catch (e) { /* old browser */ } }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  /* Clip to a slot's shape (rectangle, angled polygon, or rotated rect). */
  function clipSlot(ctx, px, py, pw, ph, s) {
    ctx.beginPath();
    if (s.poly) {
      for (var i = 0; i < s.poly.length; i++) {
        var qx = px + s.poly[i][0] * pw, qy = py + s.poly[i][1] * ph;
        if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.closePath();
    } else {
      ctx.rect(px, py, pw, ph);
    }
    ctx.clip();
  }

  /* The white snapshot border the tilted layouts wear around their panels. */
  function strokeSnapshotFrame(ctx, px, py, pw, ph, s) {
    ctx.save();
    ctx.strokeStyle = '#f5efe4';
    ctx.lineWidth = Math.max(3, pw * 0.012);
    ctx.beginPath();
    if (s.poly) {
      for (var i = 0; i < s.poly.length; i++) {
        var qx = px + s.poly[i][0] * pw, qy = py + s.poly[i][1] * ph;
        if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.closePath();
    } else {
      ctx.rect(px, py, pw, ph);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---- film grain and vignette ---------------------------------------- */

  var grainTile = null;
  function getGrainTile() {
    if (grainTile) return grainTile;
    var rng = mulberry32(20261119);
    var c = document.createElement('canvas');
    c.width = 160; c.height = 160;
    var g = c.getContext('2d');
    var data = g.createImageData(160, 160);
    for (var i = 0; i < data.data.length; i += 4) {
      var v = Math.floor(rng() * 255);
      data.data[i] = v; data.data[i + 1] = v; data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    grainTile = c;
    return c;
  }

  function drawGrain(ctx, W, H) {
    var tile = getGrainTile();
    var pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawVignette(ctx, W, H) {
    var r = Math.hypot(W, H) / 2;
    var grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(8,0,16,0)');
    grad.addColorStop(1, 'rgba(8,0,16,0.42)');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ---- halftone dots --------------------------------------------------- */

  /* A field of comic-book halftone dots, denser toward the bottom. */
  function drawHalftone(ctx, x, y, w, h, color, maxR) {
    var step = Math.max(10, w / 46);
    ctx.save();
    ctx.fillStyle = color;
    for (var yy = y + step / 2; yy < y + h; yy += step) {
      var row = Math.floor((yy - y) / step);
      for (var xx = x + step / 2 + (row % 2 ? step / 2 : 0); xx < x + w; xx += step) {
        var t = (yy - y) / h;
        var r = maxR * (0.25 + 0.75 * t);
        ctx.beginPath();
        ctx.arc(xx, yy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* A five-point star, for the badge ribbon. */
  function drawStar(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 === 0 ? r : r * 0.42;
      var sx = cx + Math.cos(ang) * rr, sy = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---- lettering -------------------------------------------------------- */

  /* Fit Anton to a box: shrink until the text fits the width, then draw it
   * with a hard offset shadow, a thick outline and a gradient fill. */
  function drawBigCaption(ctx, text, x, y, w, h, colorway, align) {
    if (!text) return;
    var size = h * 0.82;
    ctx.save();
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    var font = function (s) { return s + 'px Anton, "Arial Narrow", sans-serif'; };
    ctx.font = font(size);
    var tw = ctx.measureText(text).width;
    if (tw > w * 0.96) size = Math.floor(size * (w * 0.96) / tw);
    ctx.font = font(size);
    var cx = align === 'left' ? x : (align === 'right' ? x + w : x + w / 2);
    var cy = y + h / 2;
    /* Slight forward lean for poster energy. */
    ctx.translate(cx, cy);
    ctx.transform(1, 0, -0.06, 1, 0, 0);
    ctx.translate(-cx, -cy);
    var grad = ctx.createLinearGradient(cx - w / 2, cy - size / 2, cx + w / 2, cy + size / 2);
    var fills = colorway.fill;
    for (var i = 0; i < fills.length; i++) grad.addColorStop(i / (fills.length - 1 || 1), fills[i]);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    /* Hard drop shadow. */
    ctx.fillStyle = 'rgba(10,2,20,0.85)';
    ctx.fillText(text, cx + size * 0.045, cy + size * 0.06);
    /* Outline, then the gradient fill. */
    ctx.lineWidth = Math.max(2, size * 0.085);
    ctx.strokeStyle = colorway.stroke;
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = grad;
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  /* Stack a multi-word caption across two balanced lines, for the
   * centre title cell of the nine-panel layout. One word stays one line. */
  function drawStackedCaption(ctx, text, x, y, w, h, colorway) {
    var words = (text || '').split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      drawBigCaption(ctx, text, x, y, w, h, colorway, 'center');
      return;
    }
    var best = null;
    for (var k = 1; k < words.length; k++) {
      var a = words.slice(0, k).join(' ');
      var b = words.slice(k).join(' ');
      var m = Math.max(a.length, b.length);
      if (!best || m < best.m) best = { m: m, a: a, b: b };
    }
    var lineH = h / 2;
    drawBigCaption(ctx, best.a, x, y, w, lineH, colorway, 'center');
    drawBigCaption(ctx, best.b, x, y + lineH, w, lineH, colorway, 'center');
  }

  /* The neon script subtitle in Pacifico, with a soft glow. */
  function drawScriptSubtitle(ctx, text, x, y, w, h, glowColor) {
    if (!text) return;
    var size = h;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = size + 'px Pacifico, cursive';
    var tw = ctx.measureText(text).width;
    if (tw > w * 0.9) size = Math.floor(size * (w * 0.9) / tw);
    ctx.font = size + 'px Pacifico, cursive';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = glowColor;
    ctx.globalAlpha = 0.9;
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
  }

  /* A tilted ribbon badge with a star on each side, top-left over the sky. */
  function drawBadgeRibbon(ctx, text, W, H) {
    if (!text) return;
    var h = Math.round(H * 0.042);
    var size = Math.round(h * 0.58);
    ctx.save();
    ctx.font = size + 'px Anton, "Arial Narrow", sans-serif';
    var tw = ctx.measureText(text).width;
    var w = tw + h * 2.6;
    ctx.translate(w * 0.52, H * 0.055);
    ctx.rotate(0.08);
    ctx.fillStyle = '#ff2975';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#12041f';
    ctx.fillRect(-w / 2, h / 2 - 3, w, 3);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    var starR = size * 0.42;
    drawStar(ctx, -w / 2 + h * 0.55, 0, starR, '#ffd319');
    drawStar(ctx, w / 2 - h * 0.55, 0, starR, '#ffd319');
    ctx.restore();
  }

  /* ---- the render ------------------------------------------------------- */

  /* Render the cover for a state into a fresh canvas of W x H and return it.
   * state: { layout, grade, caption, captionColor, captionPosition,
   *          subtitle, badge, photos: [Image], panels: [{photo, zoom, dx, dy}] } */
  function renderCover(state, W, H) {
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var layout = LAYOUTS[state.layout] || LAYOUTS['hero-stack'];
    var grade = GRADES[state.grade] || GRADES.sunset;
    var colorway = CAPTION_COLORS[state.captionColor] || CAPTION_COLORS.sunset;
    var gutter = Math.round(Math.min(W, H) * 0.011);
    var slots = layout.slots(W, H);

    /* Black gutters show through between the panels. */
    ctx.fillStyle = '#0a0410';
    ctx.fillRect(0, 0, W, H);

    /* Photos, panel by panel. */
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (s.kind === 'title') continue;
      var px = Math.round(s.x * W), py = Math.round(s.y * H);
      var pw = Math.round(s.w * W), ph = Math.round(s.h * H);
      var crop = (state.panels && state.panels[i]) || { photo: 0, zoom: 1, dx: 0, dy: 0 };
      var img = state.photos && state.photos[crop.photo];
      var cx = px + pw / 2, cy = py + ph / 2;
      ctx.save();
      if (s.rot) { ctx.translate(cx, cy); ctx.rotate(s.rot * Math.PI / 180); ctx.translate(-cx, -cy); }
      /* Inset by half a gutter so the black shows between neighbours.
       * A lone panel, and the full-bleed background of the tilted and
       * strip layouts, keep the whole slot. */
      var tiled = slots.length > 1 && state.layout !== 'tilt' && state.layout !== 'strip';
      var ix = px, iy = py, iw = pw, ih = ph;
      if (tiled && i > 0) {
        ix = px + gutter / 2; iy = py + gutter / 2;
        iw = pw - gutter; ih = ph - gutter;
      } else if (tiled) {
        iw = pw - gutter / 2; ih = ph - gutter / 2;
      }
      ctx.save();
      clipSlot(ctx, ix, iy, iw, ih, s);
      if (img) {
        drawPhotoInto(ctx, img, ix, iy, iw, ih, crop, grade.photoFilter);
      } else {
        ctx.fillStyle = '#241533';
        ctx.fillRect(ix, iy, iw, ih);
      }
      ctx.restore();
      if ((state.layout === 'tilt' || state.layout === 'strip') && i > 0) {
        strokeSnapshotFrame(ctx, ix, iy, iw, ih, s);
        /* A soft drop shadow under the tilted snapshot. */
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = Math.round(Math.min(W, H) * 0.02);
        ctx.shadowOffsetY = Math.round(Math.min(W, H) * 0.008);
        ctx.strokeStyle = 'rgba(0,0,0,0)';
        ctx.strokeRect(ix, iy, iw, ih);
        ctx.restore();
      }
      ctx.restore();
    }

    /* Grade tint over the photos. */
    if (grade.tint) {
      var tint = ctx.createLinearGradient(0, 0, W, H);
      for (var ti = 0; ti < grade.tint.length; ti++) {
        tint.addColorStop(ti / (grade.tint.length - 1 || 1), grade.tint[ti]);
      }
      ctx.save();
      ctx.globalCompositeOperation = grade.tintMode;
      ctx.globalAlpha = grade.tintAlpha;
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* Caption: either the centre title cell or the bottom band. */
    var band = CAPTION_BANDS[state.layout] || CAPTION_BANDS['hero-stack'];
    var titleSlot = null;
    for (var k = 0; k < slots.length; k++) if (slots[k].kind === 'title') titleSlot = slots[k];
    if (titleSlot) {
      var tx = Math.round(titleSlot.x * W), ty = Math.round(titleSlot.y * H);
      var twd = Math.round(titleSlot.w * W), thd = Math.round(titleSlot.h * H);
      ctx.save();
      ctx.fillStyle = '#12041f';
      ctx.fillRect(tx, ty, twd, thd);
      drawHalftone(ctx, tx, ty, twd, thd, 'rgba(255,41,117,0.5)', Math.max(3, twd / 90));
      var titleScale = (state.captionSize || 100) / 100;
      drawStackedCaption(ctx, state.caption, tx + twd * 0.04, ty + thd * 0.08, twd * 0.92, thd * 0.6 * titleScale, colorway);
      drawScriptSubtitle(ctx, state.subtitle, tx, ty + thd * 0.68, twd, thd * 0.2, '#ff2fb3');
      ctx.restore();
    } else if (band[2] > 0) {
      var bx = Math.round(band[0] * W), by = Math.round(band[1] * H);
      var bw = Math.round(band[2] * W), bh = Math.round(band[3] * H);
      if (state.captionPosition === 'top') by = 0;
      /* A dark legibility wash behind the lettering. */
      var wash = ctx.createLinearGradient(0, by, 0, by + bh);
      wash.addColorStop(0, 'rgba(10,2,18,0)');
      wash.addColorStop(0.45, 'rgba(10,2,18,0.55)');
      wash.addColorStop(1, 'rgba(10,2,18,0.82)');
      ctx.save();
      ctx.fillStyle = wash;
      ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
      drawHalftone(ctx, bx, by + bh * 0.66, bw, bh * 0.34, 'rgba(255,211,25,0.26)', Math.max(2, bw / 200));
      var bandScale = (state.captionSize || 100) / 100;
      drawBigCaption(ctx, state.caption, bx + bw * 0.03, by + bh * 0.02, bw * 0.94, bh * 0.66 * bandScale, colorway, 'center');
      drawScriptSubtitle(ctx, state.subtitle, bx, by + bh * 0.72, bw, bh * 0.2, '#ff2fb3');
    }

    drawBadgeRibbon(ctx, state.badge, W, H);
    drawVignette(ctx, W, H);
    drawGrain(ctx, W, H);
    return canvas;
  }

  /* Hit-test a point (in cover pixels) against the layout's slots; returns
   * the slot index or -1. Tilted panels are tested against their unrotated box. */
  function pickSlot(state, W, H, x, y) {
    var layout = LAYOUTS[state.layout] || LAYOUTS['hero-stack'];
    var slots = layout.slots(W, H);
    for (var i = slots.length - 1; i >= 0; i--) {
      var s = slots[i];
      if (s.kind === 'title') continue;
      if (x >= s.x * W && x <= (s.x + s.w) * W && y >= s.y * H && y <= (s.y + s.h) * H) return i;
    }
    return -1;
  }

  window.ViceCover = {
    EXPORT_SIZES: EXPORT_SIZES,
    GRADES: GRADES,
    CAPTION_COLORS: CAPTION_COLORS,
    LAYOUTS: LAYOUTS,
    renderCover: renderCover,
    pickSlot: pickSlot
  };
})();
