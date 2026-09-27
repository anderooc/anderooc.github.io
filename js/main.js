(function () {
  'use strict';

  var body = document.body;
  var arena = document.querySelector('.arena');
  var ball = document.getElementById('ball');
  var skin = ball.querySelector('.ball-skin');
  var shadow = document.getElementById('ball-shadow');
  var aim = document.getElementById('ball-aim');
  var call = document.getElementById('call');
  var boardPlay = document.getElementById('board-play');
  var touchesEl = document.getElementById('touches');
  var scoreHomeEl = document.getElementById('score-home');
  var scoreAwayEl = document.getElementById('score-away');
  var playbook = document.querySelector('.playbook');
  var courtSvg = document.getElementById('court');
  var courtBand = document.querySelector('.court-band');
  var hittersEl = document.getElementById('hitters');
  var hitterEls = hittersEl.querySelectorAll('.hitter');
  var attackerEls = document.querySelectorAll('.attacker');
  var scenes = {};
  document.querySelectorAll('.scene').forEach(function (el) {
    scenes[el.getAttribute('data-scene')] = el;
  });

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var PLAYS = {
    dig: { hash: 'work', board: 'Dig \u00b7 Work', letter: 'D' },
    set: { hash: 'projects', board: 'Set \u00b7 Projects', letter: 'S' },
    spike: { hash: 'contact', board: 'Kill \u00b7 Contact', letter: 'K' }
  };

  var state = {
    scene: 'home',
    touches: [],
    home: 0,
    away: 0,
    flying: false,
    hitter: 0,
    point: null,
    at: null,
    atKind: 'rest'
  };

  /* ---------- Scoreboard ---------- */

  var clearTouchesTimer = 0;

  var renderTouches = function (list) {
    list = list || state.touches;
    window.clearTimeout(clearTouchesTimer);
    touchesEl.querySelectorAll('i').forEach(function (dot, i) {
      var t = list[i];
      dot.classList.toggle('is-on', !!t);
      dot.textContent = t ? PLAYS[t].letter : '';
    });
    touchesEl.setAttribute('aria-label', 'Touches this rally: ' + list.length + ' of 3');
  };

  var bump = function (el, value) {
    el.textContent = value;
    el.classList.remove('is-bumped');
    void el.offsetWidth;
    el.classList.add('is-bumped');
  };

  var showCall = function (text, away, point) {
    call.textContent = text;
    call.classList.toggle('is-away', !!away);
    call.classList.toggle('is-point', !!point);
    call.classList.remove('is-showing');
    void call.offsetWidth;
    call.classList.add('is-showing');
  };

  // Volleyball rules, loosely: three touches per side, the spike ends the rally.
  var recordTouch = function (action) {
    if (action !== 'spike' && state.touches.length === 3) {
      state.away += 1;
      bump(scoreAwayEl, state.away);
      state.touches = [];
      renderTouches();
      showCall('Four hits', true);
      return false;
    }

    state.touches.push(action);
    renderTouches();

    // Calls describe what the ball actually does from where it is now.
    var kind = state.atKind;
    if (action === 'spike') {
      // The point is called when the ball hits their floor, not off the hand.
      var text = kind === 'hitter' ? 'Kill!' : kind === 'setter' ? 'Dump!' : 'Overpass!';
      state.home += 1;
      var home = state.home;
      state.point = function () {
        state.point = null;
        bump(scoreHomeEl, home);
        showCall(text, false, true);
      };
      state.touches = [];
      clearTouchesTimer = window.setTimeout(renderTouches, 1400);
    } else if (action === 'dig') {
      showCall(kind === 'rest' ? 'Dig!' : 'Pass!');
    } else {
      showCall(kind === 'setter' ? 'Set!' : 'Bump set!');
    }
    return true;
  };

  /* ---------- Scenes ---------- */

  var showScene = function (name, enter) {
    if (!scenes[name]) return;
    Object.keys(scenes).forEach(function (key) {
      var el = scenes[key];
      if (key === name) {
        el.hidden = false;
        el.removeAttribute('data-enter');
        void el.offsetWidth;
        el.setAttribute('data-enter', enter || name);
        el.scrollTop = 0;
      } else {
        el.hidden = true;
        el.removeAttribute('data-enter');
      }
    });

    state.scene = name;
    arena.setAttribute('data-scene', name);
    if (name !== 'set') arena.classList.remove('is-called');
    body.classList.toggle('in-play', name !== 'home');
    boardPlay.textContent = name === 'home' ? 'Warmups' : PLAYS[name].board;

    var hash = name === 'home' ? '' : '#' + PLAYS[name].hash;
    history.replaceState(null, '', window.location.pathname + window.location.search + hash);
  };

  var timeout = function () {
    if (state.scene === 'home') return;
    state.touches = [];
    renderTouches();
    showCall('Timeout');
    showScene('home', 'home');
    ballHome();
  };

  /* ---------- The court, in perspective ---------- */

  // World units are metres. x runs the length of the court (our end line -9,
  // net 0, theirs +9), y is height, z runs across it; facing the net, z = 9 is
  // the left sideline and z = 0 the right.
  var P = function (x, y, z) { return { x: x, y: y, z: z }; };

  var SETTER = P(-0.6, 2.9, 3.1);
  // A good pass floats here, just off the net, waiting for the setter.
  var TARGET = P(-0.9, 2.1, 3.1);

  // One attacker per project, in the same order as the .hitter articles.
  var SPOTS = [
    { floor: P(-1.7, 0, 8.0), hit: P(-0.7, 3.2, 8.0), apex: 5.6, ms: 620 }, // Go: high ball to the left pin
    { floor: P(-1.6, 0, 3.8), hit: P(-0.6, 3.0, 4.0), apex: 3.3, ms: 280 }, // 1: quick in front of the setter
    { floor: P(-1.7, 0, 0.6), hit: P(-0.7, 3.1, 0.8), apex: 3.9, ms: 420 }, // Red: fast back set to the right pin
    { floor: P(-6.1, 0, 4.6), hit: P(-2.9, 3.1, 4.6), apex: 4.5, ms: 500 }, // Pipe: back row, middle
    { floor: P(-1.7, 0, 6.0), hit: P(-0.7, 3.1, 6.0), apex: 3.9, ms: 380 }  // 3: between the outside and the 1
  ];

  var cam = null;

  var project = function (p) {
    var d = p.x - cam.camX;
    return {
      x: cam.cx - cam.f * (p.z - 4.5) / d,
      y: cam.horizon + cam.f * (cam.camY - p.y) / d,
      s: cam.f / d
    };
  };

  // The camera sits behind our end line looking at the net. Our half fills the
  // bottom band of the screen; the net and their half sit just above it.
  var measure = function () {
    var w = arena.clientWidth;
    var h = arena.clientHeight;
    var band = courtBand.offsetHeight;
    var narrow = w < 720;
    var back = 13.8;
    var f = (narrow ? w * 0.95 : w * 0.64) * back / 9;
    var yNear = h - band * 0.02;
    var yNet = h - band * 0.74;
    var camY = (yNear - yNet) / (f * (1 / back - 1 / (back + 9)));

    cam = {
      w: w,
      h: h,
      narrow: narrow,
      f: f,
      camX: -9 - back,
      cx: w / 2,
      camY: camY,
      horizon: yNear - f * camY / back
    };

    var r = ball.offsetWidth / 2;
    var restX = -7.8;
    cam.r = r;
    // Ball radius in world units is constant, so it sits on the floor wherever it lands.
    cam.rest = P(restX, r / (f / (restX - cam.camX)), 7.2);
    cam.restScreen = project(cam.rest);
    cam.shadowRest = project(P(cam.rest.x, 0, cam.rest.z));

    // Left/right cycles hitters in the order they stand on screen.
    cam.order = SPOTS.map(function (spot, i) { return { i: i, x: project(spot.floor).x }; })
      .sort(function (a, b) { return a.x - b.x; })
      .map(function (o) { return o.i; });
  };

  var pt = function (x, y, z) {
    var p = project(P(x, y, z));
    return p.x.toFixed(1) + ',' + p.y.toFixed(1);
  };

  var poly = function (points, cls) {
    return '<polygon class="' + cls + '" points="' + points.map(function (p) {
      return pt(p[0], p[1], p[2]);
    }).join(' ') + '"/>';
  };

  var floorRect = function (x0, x1, z0, z1) {
    return [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]];
  };

  var seg = function (a, b, cls) {
    var p = project(P(a[0], a[1], a[2]));
    var q = project(P(b[0], b[1], b[2]));
    return '<line class="' + cls + '" x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) +
      '" x2="' + q.x.toFixed(1) + '" y2="' + q.y.toFixed(1) + '"/>';
  };

  var drawCourt = function () {
    var farEdge = project(P(14, 0, 4.5)).y;
    var out = [];
    var x;
    var y;
    var z;

    out.push(
      '<defs><linearGradient id="court-fog" gradientUnits="userSpaceOnUse" x1="0" y1="' + farEdge.toFixed(1) +
      '" x2="0" y2="' + cam.h + '">' +
      '<stop offset="0" style="stop-color:#000;stop-opacity:0.85"/>' +
      '<stop offset="0.5" style="stop-color:#000;stop-opacity:0"/>' +
      '</linearGradient></defs>'
    );

    out.push(poly(floorRect(-20, 14, -30, 39), 'court-free'));
    for (z = -12; z <= 21; z += 1.5) out.push(seg([-20, 0, z], [14, 0, z], 'court-grid'));
    for (x = -19.5; x <= 14; x += 1.5) out.push(seg([x, 0, -30], [x, 0, 39], 'court-grid'));
    out.push(poly([[14, 0, -30], [14, 0, 39], [14, 1.1, 39], [14, 1.1, -30]], 'court-boards'));
    out.push(seg([14, 1.1, -30], [14, 1.1, 39], 'court-boards-top'));

    out.push(poly(floorRect(-9, 9, 0, 9), 'court-wood'));
    out.push(poly(floorRect(-3, 3, 0, 9), 'court-front'));
    out.push(poly(floorRect(-9, 9, 0, 9), 'court-line'));
    [-3, 0, 3].forEach(function (lx) { out.push(seg([lx, 0, 0], [lx, 0, 9], 'court-line')); });
    [-3, 3].forEach(function (lx) {
      out.push(seg([lx, 0, -1.75], [lx, 0, 0], 'court-line court-dash'));
      out.push(seg([lx, 0, 9], [lx, 0, 10.75], 'court-line court-dash'));
    });

    out.push('<rect x="0" y="' + farEdge.toFixed(1) + '" width="' + cam.w + '" height="' +
      Math.max(0, cam.h - farEdge).toFixed(1) + '" fill="url(#court-fog)"/>');

    // Net, seen face-on from behind our end line
    out.push(seg([0, 0, -1], [0, 2.55, -1], 'post'));
    out.push(seg([0, 0, 10], [0, 2.55, 10], 'post'));
    out.push(poly([[0, 1.43, -0.5], [0, 2.43, -0.5], [0, 2.43, 9.5], [0, 1.43, 9.5]], 'net-mesh'));
    for (z = -0.5; z <= 9.51; z += 0.25) out.push(seg([0, 1.43, z], [0, 2.43, z], 'net-thread'));
    for (y = 1.53; y < 2.43; y += 0.1) out.push(seg([0, y, -0.5], [0, y, 9.5], 'net-thread'));
    out.push(seg([0, 1.43, -1], [0, 1.43, 10], 'net-cable'));
    out.push(seg([0, 2.43, -1], [0, 2.43, 10], 'net-tape'));
    [0, 9].forEach(function (az) {
      for (var i = 0; i < 8; i++) {
        out.push(seg([0, 2.43 + i * 0.1, az], [0, 2.53 + i * 0.1, az], i % 2 ? 'antenna antenna--w' : 'antenna'));
      }
    });

    courtSvg.setAttribute('viewBox', '0 0 ' + cam.w + ' ' + cam.h);
    courtSvg.innerHTML = out.join('');
  };

  var place = function () {
    var rs = cam.restScreen;
    var sh = cam.shadowRest;
    ball.style.left = (rs.x - cam.r).toFixed(1) + 'px';
    ball.style.top = (rs.y - cam.r).toFixed(1) + 'px';
    shadow.style.width = (cam.r * 1.8).toFixed(1) + 'px';
    shadow.style.height = (cam.r * 0.55).toFixed(1) + 'px';
    shadow.style.left = (sh.x - cam.r * 0.9).toFixed(1) + 'px';
    shadow.style.top = (sh.y - cam.r * 0.275).toFixed(1) + 'px';
    if (!state.at || state.atKind === 'rest') state.at = cam.rest;
    if (!state.flying) settle(state.at, state.atKind, true);

    attackerEls.forEach(function (el, i) {
      var p = project(SPOTS[i].floor);
      el.style.left = p.x.toFixed(1) + 'px';
      el.style.top = p.y.toFixed(1) + 'px';
      el.style.setProperty('--s', Math.max(0.84, Math.min(1.05, p.s / rs.s)).toFixed(3));
    });
  };

  var layout = function () {
    measure();
    drawCourt();
    place();
  };

  /* ---------- Projects: the setter calls a hitter ---------- */

  var showHitter = function (i) {
    state.hitter = i;
    hitterEls.forEach(function (el, j) { el.hidden = j !== i; });
    attackerEls.forEach(function (el, j) { el.setAttribute('aria-pressed', String(j === i)); });
    hittersEl.classList.remove('is-swapping');
    void hittersEl.offsetWidth;
    hittersEl.classList.add('is-swapping');
  };

  var hitterJump = function (i) {
    var el = attackerEls[i];
    if (!el) return;
    el.classList.remove('is-hitting');
    void el.offsetWidth;
    el.classList.add('is-hitting');
  };

  /* ---------- Ball flights ---------- */

  var tf = function (x, y, s) {
    return 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (s || 1).toFixed(3) + ')';
  };

  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var smooth = function (u) { return u * u * (3 - 2 * u); };

  // The ball and shadow are laid out at the rest spot; everything else is an offset from it.
  var ballOffset = function (w) {
    var rs = cam.restScreen;
    var q = project(w);
    return { x: q.x - rs.x, y: q.y - rs.y, s: q.s / rs.s, sx: q.x, sy: q.y };
  };

  var shadowFrame = function (w, alpha) {
    var sh = cam.shadowRest;
    var fq = project(P(w.x, 0, w.z));
    var lift = Math.max(0, w.y - cam.rest.y);
    return {
      transform: tf(fq.x - sh.x, fq.y - sh.y, (fq.s / sh.s) * Math.max(0.45, 1 - lift / 9)),
      opacity: alpha * Math.max(0.15, 1 - lift / 5)
    };
  };

  var hover = function (i) {
    var f = SPOTS[i].floor;
    return P(f.x + 0.25, cam.narrow ? 1.85 : 1.45, f.z);
  };

  var dip = function (w) { return P(w.x, w.y - 0.3, w.z); };

  // Where the ball sits between touches. Off the floor it just floats there.
  var settle = function (w, kind, now) {
    state.at = w;
    state.atKind = kind;
    var b = ballOffset(w);
    var s = shadowFrame(w, 1);
    ball.style.transform = tf(b.x, b.y, b.s);
    shadow.style.transform = s.transform;
    shadow.style.opacity = s.opacity.toFixed(3);
    var mark = function () {
      ball.classList.toggle('is-floating', kind !== 'rest');
      arena.style.setProperty('--ball-x', (b.sx - cam.r * (1 - b.s)).toFixed(1) + 'px');
      arena.style.setProperty('--ball-y', b.sy.toFixed(1) + 'px');
    };
    if (now) mark();
    return mark;
  };

  var impactAt = function (x, y, variant) {
    var ring = document.createElement('span');
    ring.className = 'impact' + (variant ? ' ' + variant : '');
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    arena.appendChild(ring);
    window.setTimeout(function () { ring.remove(); }, 900);
  };

  // A speed line from the hand to the floor, drawn in step with the ball.
  var streak = function (a, b, ms) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'streak');
    svg.setAttribute('width', cam.w);
    svg.setAttribute('height', cam.h);
    svg.innerHTML =
      '<defs><linearGradient id="streak-fade" gradientUnits="userSpaceOnUse" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '">' +
      '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.9"/></linearGradient></defs>' +
      '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="url(#streak-fade)" stroke-linecap="round" stroke-width="' + (cam.r * 0.5).toFixed(1) + '"/>';
    arena.appendChild(svg);
    var line = svg.querySelector('line');
    var len = Math.hypot(b.x - a.x, b.y - a.y);
    line.style.strokeDasharray = len + ' ' + len;
    line.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: ms, easing: 'cubic-bezier(0.6, 0, 0.9, 0.35)', fill: 'forwards' }
    );
    svg.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }],
      { duration: ms + 380, fill: 'forwards' }
    );
    window.setTimeout(function () { svg.remove(); }, ms + 420);
  };

  var shake = function () {
    arena.classList.remove('is-shaking');
    void arena.offsetWidth;
    arena.classList.add('is-shaking');
  };

  // Turns a list of 3D arcs into keyframes for the ball and its floor shadow.
  // Each segment: { to, apex?, ms, pow?, ease?(u), alpha?(u), appear? }. `from`
  // is the drag offset the flight starts at, blended out over the first segment.
  var build = function (start, segs, from) {
    var total = segs.reduce(function (t, s) { return t + s.ms; }, 0);
    var ballFrames = [];
    var shadowFrames = [];
    var marks = [];
    var t = 0;
    var p0 = start;

    segs.forEach(function (s, si) {
      if (s.appear) {
        var at = t / total;
        ballFrames.push({ transform: tf(0, 0, 0.4), opacity: 0, offset: at, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        ballFrames.push({ transform: tf(0, 0, 1), opacity: 1, offset: 1 });
        shadowFrames.push({ transform: tf(0, 0, 0.4), opacity: 0, offset: at });
        shadowFrames.push({ transform: tf(0, 0, 1), opacity: 1, offset: 1 });
        t += s.ms;
        marks.push(t);
        p0 = cam.rest;
        return;
      }

      var n = Math.max(4, Math.round(s.ms / 34));
      var c = s.apex == null ? (p0.y + s.to.y) / 2 : 2 * s.apex - (p0.y + s.to.y) / 2;

      for (var k = si === 0 ? 0 : 1; k <= n; k++) {
        var u = k / n;
        var e = s.ease ? s.ease(u) : s.pow ? Math.pow(u, s.pow) : u;
        var w = P(
          lerp(p0.x, s.to.x, e),
          (1 - e) * (1 - e) * p0.y + 2 * e * (1 - e) * c + e * e * s.to.y,
          lerp(p0.z, s.to.z, e)
        );
        var b = ballOffset(w);
        var dx = b.x;
        var dy = b.y;
        if (si === 0 && from) {
          dx += from.x * (1 - u);
          dy += from.y * (1 - u);
        }
        var offset = Math.min(1, (t + s.ms * u) / total);
        var alpha = s.alpha ? s.alpha(u) : 1;
        ballFrames.push({ transform: tf(dx, dy, b.s), opacity: alpha, offset: offset });

        var sf = shadowFrame(w, alpha);
        sf.offset = offset;
        shadowFrames.push(sf);
      }
      t += s.ms;
      marks.push(t);
      p0 = s.to;
    });

    return { ball: ballFrames, shadow: shadowFrames, duration: total, marks: marks };
  };

  var bounce = function () {
    return { to: cam.rest, apex: cam.rest.y + 0.45, ms: 220 };
  };

  var fadeOut = function (u) { return 1 - u * u; };
  var SMASH_MS = 300;

  // Arrive a touch low and ease up into a float, instead of stopping dead mid-air.
  var floatTo = function (w, apex, ms) {
    return [
      { to: dip(w), apex: apex, ms: ms },
      { to: w, ms: 320, pow: 0.5 }
    ];
  };

  // The ball stays where the last touch put it. Only the spike crosses the net;
  // after the point it comes back to our back court for the next rally.
  var flight = function (action, hitter, from) {
    var rest = cam.rest;
    var at = state.at;
    var kind = state.atKind;
    var spot = SPOTS[hitter];
    var segs;
    var f = { swapAt: 0 };

    if (action === 'fault') {
      // Four hits: whistle, the ball drops where it is.
      segs = [
        { to: P(at.x, rest.y, at.z), ms: Math.round(260 + at.y * 90), pow: 1.7 },
        { to: P(at.x - 0.8, 0.9, at.z), apex: 1.1, ms: 320, alpha: fadeOut },
        { appear: true, ms: 260 }
      ];
      f.end = [rest, 'rest'];
    } else if (action === 'dig') {
      // The pass: high and soft to the setter's target by the net.
      segs = floatTo(TARGET, kind === 'rest' ? 6.4 : 4.6, kind === 'rest' ? 880 : 620);
      f.swapAt = 320;
      f.spin = 420;
      f.end = [TARGET, 'setter'];
    } else if (action === 'set') {
      if (kind === 'setter') {
        segs = floatTo(hover(hitter), spot.apex, spot.ms + 160);
        f.swapAt = 60;
      } else {
        // No pass first: whoever has it bump-sets straight to the hitter, high and slow.
        segs = floatTo(hover(hitter), Math.max(spot.apex, at.y) + 1.6, 940);
        f.swapAt = 160;
      }
      f.spin = 320;
      f.end = [hover(hitter), 'hitter'];
    } else if (action === 'pick') {
      // Calling a different hitter: the ball drifts across to them.
      var to = hover(hitter);
      var dist = Math.hypot(to.x - at.x, to.z - at.z);
      var ms = Math.round(460 + dist * 40);
      segs = [{ to: to, apex: Math.max(at.y, to.y) + 0.5 + dist * 0.08, ms: ms, ease: smooth }];
      f.swapAt = Math.round(ms * 0.45);
      f.spin = 140;
      f.end = [to, 'hitter'];
    } else {
      var contact;
      if (kind === 'setter') {
        // Spiking straight off the pass: the setter dumps it over on two.
        contact = P(-0.35, 3.0, TARGET.z);
        var tip = P(1.7, rest.y, 3.9);
        segs = [
          { to: contact, apex: 3.15, ms: 240 },
          { to: tip, apex: 3.4, ms: 480 },
          { to: P(3.6, 0.9, 4.4), apex: 1.5, ms: 340, alpha: fadeOut },
          { appear: true, ms: 260 }
        ];
        f.hitAt = 40;
        f.tip = true;
        f.land = project(P(tip.x, 0, tip.z));
        f.swapAt = 720;
      } else {
        var land;
        var reach;
        var smashMs = SMASH_MS;
        if (kind === 'hitter') {
          // Already set: the hitter goes up and meets it.
          contact = spot.hit;
          land = P(5.2, rest.y, Math.min(8, Math.max(1, spot.hit.z * 0.7 + 1.5)));
          reach = 280;
          segs = [{ to: contact, apex: contact.y + 0.25, ms: reach, ease: smooth }];
          f.hitAt = reach + 120 - 240;
        } else {
          // First ball: no setter, it's popped up and swung straight over from the back court.
          contact = P(at.x + 1.2, 2.8, at.z - 0.5);
          land = P(6.6, rest.y, Math.min(8, Math.max(1, at.z * 0.6 + 1)));
          reach = 420;
          smashMs = SMASH_MS + 120;
          segs = [{ to: contact, apex: 3.4, ms: reach, ease: smooth }];
        }
        // The ball hangs at the top while the arm swings, then gets hammered:
        // slow off the hand, fastest as it hits their floor.
        var cock = P(contact.x - 0.15, contact.y + 0.12, contact.z);
        segs = segs.concat([
          { to: cock, ms: 120, pow: 0.5 },
          { to: land, ms: smashMs, pow: 2.6 },
          { to: P(land.x + 5, 1.9, land.z + 1.4), apex: 3.2, ms: 480, alpha: fadeOut },
          { appear: true, ms: 300 }
        ]);
        f.strikeAt = reach + 120;
        f.swapAt = f.strikeAt + smashMs;
        f.smashMs = smashMs;
        f.strike = project(cock);
        f.land = project(P(land.x, 0, land.z));
      }
      f.spin = 900;
      f.end = [rest, 'rest'];
    }

    var b = build(at, segs, from);
    b.swapAt = f.swapAt;
    b.hitAt = f.hitAt;
    b.land = f.land;
    b.strike = f.strike;
    b.strikeAt = f.strikeAt;
    b.smashMs = f.smashMs;
    b.tip = f.tip;
    b.spin = f.spin;
    b.end = f.end;
    return b;
  };

  var run = function (f, opts) {
    opts = opts || {};
    var delay = opts.delay || 0;
    var end = f.end || [cam.rest, 'rest'];
    var mark = settle(end[0], end[1]);
    state.flying = true;
    ball.classList.add('is-flying');
    arena.classList.add('is-rallying');
    ball.animate(f.ball, { duration: f.duration, delay: delay, fill: opts.fill || 'none' });
    shadow.animate(f.shadow, { duration: f.duration, delay: delay, fill: opts.fill || 'none' });
    skin.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (f.spin || 540) + 'deg)' }],
      { duration: f.duration, delay: delay, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' }
    );
    window.setTimeout(function () {
      state.flying = false;
      ball.classList.remove('is-flying');
      arena.classList.remove('is-rallying');
      mark();
    }, f.duration + delay);
  };

  var ballHome = function () {
    if (!cam || state.atKind === 'rest') return;
    if (state.flying || reduceMotion.matches) {
      settle(cam.rest, 'rest', true);
      return;
    }
    var at = state.at;
    var f = build(at, [
      { to: cam.rest, apex: Math.max(at.y, cam.rest.y) + 1.2, ms: 720 },
      bounce()
    ]);
    f.spin = -300;
    f.end = [cam.rest, 'rest'];
    run(f);
  };

  // Calling a different hitter on Projects isn't another touch.
  var pickHitter = function (i, from) {
    if (state.flying || !cam) return;
    attackerEls.forEach(function (el, j) { el.setAttribute('aria-pressed', String(j === i)); });
    if (reduceMotion.matches) {
      settle(hover(i), 'hitter', true);
      showHitter(i);
      return;
    }
    var f = flight('pick', i, from);
    run(f);
    window.setTimeout(function () { showHitter(i); }, f.swapAt);
  };

  var play = function (action, from, dir) {
    if (state.flying || !PLAYS[action]) return;

    if (action === 'set' && arena.classList.contains('is-called')) {
      var order = cam.order;
      var at = order.indexOf(state.hitter);
      pickHitter(order[(at + (dir || 1) + order.length) % order.length], from);
      return;
    }

    var counted = recordTouch(action);
    lightPlay(action);

    var land = function () {
      if (!counted) return;
      if (state.scene !== action) showScene(action);
      if (action === 'set') arena.classList.add('is-called');
    };

    var f = flight(counted ? action : 'fault', state.hitter, from);

    if (reduceMotion.matches) {
      settle(f.end[0], f.end[1], true);
      land();
      if (state.point) state.point();
      return;
    }

    run(f);
    window.setTimeout(land, f.swapAt);

    if (f.hitAt != null && !f.tip) {
      window.setTimeout(function () { hitterJump(state.hitter); }, f.hitAt);
    }
    if (f.strike) {
      window.setTimeout(function () {
        impactAt(f.strike.x, f.strike.y, 'impact--hand');
        streak(f.strike, f.land, f.smashMs);
      }, f.strikeAt);
    }
    if (f.land) {
      window.setTimeout(function () {
        impactAt(f.land.x, f.land.y);
        if (!f.tip) {
          impactAt(f.land.x, f.land.y, 'impact--flash');
          window.setTimeout(function () { impactAt(f.land.x, f.land.y, 'impact--echo'); }, 90);
          shake();
        }
        if (state.point) state.point();
      }, f.swapAt);
    }
  };

  var lightPlay = function (action) {
    if (!playbook) return;
    playbook.querySelectorAll('.play').forEach(function (el) {
      el.classList.toggle('is-hot', el.classList.contains('play--' + action));
    });
  };

  var hop = function () {
    if (state.flying || reduceMotion.matches || !cam) return;
    var b = ballOffset(state.at);
    var up = 40 * b.s;
    ball.animate(
      [
        { transform: tf(b.x, b.y, b.s) },
        { transform: tf(b.x, b.y - up, b.s), easing: 'ease-in', offset: 0.45 },
        { transform: tf(b.x, b.y, b.s) }
      ],
      { duration: 480, easing: 'ease-out' }
    );
    if (state.atKind === 'rest') {
      shadow.animate(
        [{ transform: tf(0, 0), opacity: 1 }, { transform: tf(0, 0, 0.7), opacity: 0.5, offset: 0.45 }, { transform: tf(0, 0), opacity: 1 }],
        { duration: 480, easing: 'ease-out' }
      );
    }
    if (playbook && state.scene === 'home') {
      playbook.classList.remove('is-nudged');
      void playbook.offsetWidth;
      playbook.classList.add('is-nudged');
    }
  };

  attackerEls.forEach(function (el, i) {
    el.addEventListener('click', function () {
      if (i === state.hitter && el.getAttribute('aria-pressed') === 'true') {
        hitterJump(i);
        return;
      }
      pickHitter(i);
    });
  });

  /* ---------- Flick gestures ---------- */

  // Up = dig, sideways = set, down = spike.
  var classify = function (dx, dy) {
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 36) return null;
    if (Math.abs(dx) > Math.abs(dy) * 1.1) return 'set';
    return dy < 0 ? 'dig' : 'spike';
  };

  var AIM_LABEL = { dig: '\u2191 Dig', set: '\u2194 Set', spike: '\u2193 Spike' };

  var drag = null;
  var currentOffset = { x: 0, y: 0 };

  // On the floor it can only be lifted; in the air it can be pulled any way.
  var clampOffset = function (dx, dy) {
    var b = ballOffset(state.at);
    var floor = state.atKind === 'rest' ? 0 : cam.h - b.sy - cam.r;
    return {
      x: Math.max(cam.r - b.sx, Math.min(cam.w - b.sx - cam.r, dx)),
      y: Math.max(cam.r - b.sy, Math.min(floor, dy))
    };
  };

  var startDrag = function (event) {
    if (state.flying) return;
    if (event.button != null && event.button !== 0) return;
    var onBall = !!event.target.closest('.ball');
    var onCourt = event.target === arena || !!event.target.closest('.gym') || event.target.classList.contains('scene') ||
      event.target.classList.contains('scene-inner') || event.target.classList.contains('home-grid') ||
      event.target.classList.contains('attackers');
    if (!onBall && !onCourt) return;

    drag = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }]
    };
    arena.setPointerCapture(event.pointerId);
    ball.classList.add('is-held');
    event.preventDefault();
  };

  var moveDrag = function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x0;
    var dy = event.clientY - drag.y0;
    drag.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (drag.samples.length > 8) drag.samples.shift();

    var o = clampOffset(dx, dy);
    var b = ballOffset(state.at);
    currentOffset = o;
    ball.style.transform = tf(b.x + o.x, b.y + o.y, b.s);
    var action = classify(dx, dy);
    aim.textContent = action === 'set' && arena.classList.contains('is-called') ? '\u2194 Call' : AIM_LABEL[action] || '';
  };

  var endDrag = function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x0;
    var dy = event.clientY - drag.y0;

    // A fast flick at the end counts even if the whole drag wandered.
    var s = drag.samples;
    var first = s[0];
    var last = s[s.length - 1];
    var recent = s.length > 2 ? s[Math.max(0, s.length - 4)] : first;
    var rdx = last.x - recent.x;
    var rdy = last.y - recent.y;
    var flicked = classify(rdx, rdy) && Math.hypot(rdx, rdy) > 50;
    var action = flicked ? classify(rdx, rdy) : classify(dx, dy);
    var dir = (flicked ? rdx : dx) < 0 ? -1 : 1;

    var from = currentOffset;
    drag = null;
    ball.classList.remove('is-held');
    aim.textContent = '';
    var b = ballOffset(state.at);
    ball.style.transform = tf(b.x, b.y, b.s);
    currentOffset = { x: 0, y: 0 };
    try { arena.releasePointerCapture(event.pointerId); } catch (e) { /* already released */ }

    if (action) {
      play(action, from, dir);
    } else if (Math.abs(from.x) + Math.abs(from.y) > 4 && !reduceMotion.matches) {
      ball.animate([{ transform: tf(b.x + from.x, b.y + from.y, b.s) }, { transform: tf(b.x, b.y, b.s) }], {
        duration: 350,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      });
    } else {
      hop();
    }
  };

  arena.addEventListener('pointerdown', startDrag);
  arena.addEventListener('pointermove', moveDrag);
  arena.addEventListener('pointerup', endDrag);
  arena.addEventListener('pointercancel', endDrag);

  /* ---------- Keyboard + links ---------- */

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest && event.target.closest('input, textarea, select')) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      play(event.key === 'ArrowUp' ? 'dig' : 'spike');
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      play('set', null, event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Escape') {
      timeout();
    }
  });

  document.querySelectorAll('[data-timeout]').forEach(function (el) {
    el.addEventListener('click', function (event) {
      event.preventDefault();
      timeout();
    });
  });

  /* ---------- Start: serve comes over the net ---------- */

  layout();

  new ResizeObserver(layout).observe(arena);

  var fromHash = { work: 'dig', projects: 'set', contact: 'spike' }[(window.location.hash || '').slice(1)];
  if (fromHash) {
    showScene(fromHash);
  }

  if (!reduceMotion.matches) {
    var serve = build(P(10, 3.4, 3), [
      { to: cam.rest, apex: 5.6, ms: 1000, alpha: function (u) { return Math.min(1, u * 4); } },
      bounce()
    ]);
    serve.spin = -360;
    // With the intro, the serve comes once the lights are up and the lineup is out.
    var intro = document.documentElement.classList.contains('intro');
    run(serve, { delay: intro ? 1450 : 250, fill: 'backwards' });
  }

  window.setTimeout(function () { document.documentElement.classList.remove('intro'); }, 3000);

  renderTouches();
})();
