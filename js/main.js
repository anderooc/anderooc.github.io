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

  /* ---- Reveal on scroll ----
     Markup renders visible by default; the hidden state only exists once .js is set,
     so a failed observer or a headless render never ships a blank page. */

  var revealables = document.querySelectorAll('[data-reveal]');

  var revealAll = function () {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  };

  // Hero should never wait on intersection (above-the-fold, and headless/slow tabs).
  document.querySelectorAll('.hero [data-reveal]').forEach(function (el) {
    el.classList.add('is-in');
  });

  if (!('IntersectionObserver' in window) || reduceMotion.matches || document.visibilityState !== 'visible') {
    revealAll();
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    revealables.forEach(function (el) {
      if (el.closest('.hero')) return;
      observer.observe(el);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') revealAll();
    });

    window.setTimeout(revealAll, 3000);
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
