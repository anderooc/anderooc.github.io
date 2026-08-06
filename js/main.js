(function () {
  'use strict';

  var root = document.documentElement;
  var header = document.querySelector('.site-header');
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav-toggle');
  var progressBar = document.querySelector('.progress-bar');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- Header state ---- */

  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Scroll progress ---- */

  if (progressBar && !reduceMotion.matches) {
    var updateProgress = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      progressBar.style.width = pct.toFixed(2) + '%';
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }

  /* ---- Mobile nav ---- */

  if (toggle && nav) {
    var setNav = function (open) {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', function () {
      setNav(!nav.classList.contains('open'));
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setNav(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('open')) {
        setNav(false);
        toggle.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('open')) return;
      if (!nav.contains(event.target) && !toggle.contains(event.target)) setNav(false);
    });
  }

  /* ---- Scroll to top ---- */

  document.querySelectorAll('[data-scroll-top]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', window.location.pathname);
    });
  });

  /* ---- Stagger indices within common parents ---- */

  var staggerGroups = [
    '.sheet',
    '.project-grid',
    '.awards',
    '.interests',
    '.book-list',
    '.contact-inner',
    '.hero-text'
  ];

  staggerGroups.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (group) {
      Array.prototype.forEach.call(group.querySelectorAll(':scope > [data-reveal]'), function (el, i) {
        el.style.setProperty('--reveal-i', String(i));
      });
    });
  });

  document.querySelectorAll('.book-series').forEach(function (list) {
    Array.prototype.forEach.call(list.children, function (el, i) {
      el.style.setProperty('--pill-i', String(i));
    });
  });

  /* ---- Count-up for interest stats ---- */

  var animateCount = function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (!target || el.dataset.counted === '1') return;
    el.dataset.counted = '1';

    if (reduceMotion.matches) {
      el.childNodes[0].textContent = String(target);
      return;
    }

    var duration = 1100;
    var start = performance.now();

    var tick = function (now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 4);
      var value = Math.round(target * eased);
      el.childNodes[0].textContent = String(value);
      if (t < 1) requestAnimationFrame(tick);
      else el.childNodes[0].textContent = String(target);
    };

    el.childNodes[0].textContent = '0';
    requestAnimationFrame(tick);
  };

  /* ---- Reveal on scroll ---- */

  var revealables = document.querySelectorAll('[data-reveal]');

  var onReveal = function (el) {
    el.classList.add('is-in');
    var counter = el.querySelector('[data-count]');
    if (counter) animateCount(counter);
    if (el.hasAttribute('data-count')) animateCount(el);
  };

  var revealAll = function () {
    revealables.forEach(onReveal);
  };

  document.querySelectorAll('.hero [data-reveal]').forEach(onReveal);

  var isInViewport = function (el) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    // Require a meaningful chunk of the element to actually be on screen.
    return rect.top < vh * 0.82 && rect.bottom > vh * 0.12;
  };

  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    revealAll();
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        onReveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, {
      // Shrink the active band so items wait until they are clearly on screen.
      rootMargin: '-8% 0px -28% 0px',
      threshold: [0.15, 0.25]
    });

    revealables.forEach(function (el) {
      if (el.closest('.hero')) return;
      // Only reveal immediately if already in the viewport on load.
      if (isInViewport(el)) onReveal(el);
      else observer.observe(el);
    });

    // Failsafe for stuck transitions: reveal only what is currently visible, never the whole page.
    window.setTimeout(function () {
      revealables.forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        if (isInViewport(el)) onReveal(el);
      });
    }, 5000);
  }

  /* ---- Active section in nav ---- */

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var sections = navLinks
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = navLinks[sections.indexOf(entry.target)];
        if (link) link.classList.toggle('active', entry.isIntersecting);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ---- Footer year ---- */

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  root.classList.add('ready');
})();
