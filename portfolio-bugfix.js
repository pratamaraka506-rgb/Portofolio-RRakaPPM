/**
 * PORTFOLIO BUGFIX PATCH
 * Fixes:
 * 1. Image loading race condition & infinite onerror loop
 * 2. goToSection nav tidak merespon (click handler conflict)
 * 3. adjustImageFrame gagal saat naturalWidth=0
 * 4. src="" pada product-intelligence images trigger onerror loop
 * 5. JSONP script tag ditambah berkali-kali
 * 6. Modal ESC key handler conflict
 * 7. Image height salah saat upload-area-bottom hidden
 * 8. Nav active state tidak update saat scroll
 */

(function () {
  'use strict';

  /* =====================================================
   * 1. GLOBAL STATE — satu sumber kebenaran
   * ===================================================== */
  var _imageAttempts = {};   // { imageId: attemptIndex }
  var _jsonpInjected = false;
  var _domReady = false;

  /* =====================================================
   * 2. FIX: src="" pada product-intelligence images
   *    Hapus attribute src kosong agar tidak trigger onerror
   * ===================================================== */
  function fixEmptySrcImages() {
    document.querySelectorAll('img[data-upload-preview]').forEach(function (img) {
      var src = img.getAttribute('src');
      if (src === '' || src === null) {
        img.removeAttribute('src');
        img.style.display = 'none';
        var box = img.closest('.upload-box');
        if (box) {
          box.classList.add('is-empty');
          box.classList.remove('has-image');
        }
      }
    });
  }

  /* =====================================================
   * 3. FIX: adjustImageFrame — robust version
   * ===================================================== */
  function adjustImageFrameSafe(img) {
    if (!img || !img.src || img.style.display === 'none') return;
    var box = img.closest('.upload-box');
    if (!box) return;

    var nw = img.naturalWidth;
    var nh = img.naturalHeight;

    // Jika naturalWidth belum ada (gambar belum selesai decode), tunggu
    if (!nw || !nh) {
      img.addEventListener('load', function onceLoad() {
        img.removeEventListener('load', onceLoad);
        adjustImageFrameSafe(img);
      });
      return;
    }

    var isAdminMode = document.body.classList.contains('admin-mode');
    var ctrlHeight = isAdminMode ? (window.innerWidth <= 480 ? 110 : window.innerWidth <= 600 ? 120 : 92) : 0;

    var ratio = nw / nh;
    var bw = box.getBoundingClientRect().width || box.clientWidth || 400;
    var rawH = bw / ratio;
    var isMobile = window.innerWidth <= 768;

    var min, max;
    if (box.classList.contains('large')) {
      min = isMobile ? 360 : 520; max = isMobile ? 720 : 880;
    } else if (box.classList.contains('dashboard')) {
      min = isMobile ? 300 : 420; max = isMobile ? 680 : 820;
    } else if (box.closest('.gallery-card')) {
      min = isMobile ? 260 : 320; max = isMobile ? 620 : 760;
    } else {
      min = isMobile ? 280 : 360; max = isMobile ? 620 : 760;
    }

    var finalH = Math.max(min, Math.min(rawH + ctrlHeight, max));
    box.style.height = Math.round(finalH) + 'px';
    box.style.minHeight = Math.round(finalH) + 'px';
    box.classList.add('has-image');
    box.classList.remove('is-empty');

    if (ctrlHeight > 0) {
      img.style.height = 'calc(100% - ' + ctrlHeight + 'px)';
    } else {
      img.style.height = '100%';
    }
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center center';
    img.style.display = 'block';
    img.style.visibility = 'visible';
    img.style.opacity = '1';
  }

  // Override global
  window.adjustImageFrame = adjustImageFrameSafe;

  /* =====================================================
   * 4. FIX: Image loading — anti-loop, anti-race
   * ===================================================== */
  var PUBLIC_SOURCES = window.PUBLIC_IMAGE_SOURCES || {};

  function getSourcesForKey(key) {
    var sources = [];

    // Dari server state (JSONP/Apps Script)
    if (window.__serverImages && window.__serverImages[key]) {
      sources.push(window.__serverImages[key]);
    }

    // Dari localStorage/sessionStorage
    try {
      var local = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (local && local.startsWith('data:image/')) sources.push(local);
    } catch (e) {}

    // Dari PUBLIC_IMAGE_SOURCES
    var pub = PUBLIC_SOURCES[key];
    if (Array.isArray(pub)) {
      pub.forEach(function (u) { if (u) sources.push(u); });
    } else {
      // fallback generic
      var base = 'https://portofolio-r-raka-ppm.vercel.app/assets/' + key;
      ['.jpg', '.jpeg', '.png', '.webp'].forEach(function (ext) {
        sources.push(base + ext);
      });
    }

    // Deduplicate
    var seen = {};
    return sources.filter(function (s) {
      if (!s || seen[s]) return false;
      seen[s] = true;
      return true;
    });
  }

  function loadImageWithFallback(img) {
    var key = img.id;
    if (!key) return;

    // Reset attempt counter
    _imageAttempts[key] = 0;

    var sources = getSourcesForKey(key);

    if (!sources.length) {
      img.removeAttribute('src');
      img.style.display = 'none';
      return;
    }

    function tryNext() {
      var idx = _imageAttempts[key] || 0;
      if (idx >= sources.length) {
        // Semua source gagal
        img.removeAttribute('src');
        img.style.display = 'none';
        var box = img.closest('.upload-box');
        if (box) { box.classList.add('is-empty'); box.classList.remove('has-image'); }
        return;
      }

      var src = sources[idx];
      _imageAttempts[key] = idx + 1;

      // Detach dulu
      img.onload = null;
      img.onerror = null;

      img.onload = function () {
        img.onload = null;
        img.onerror = null;
        img.style.display = 'block';
        img.style.visibility = 'visible';
        img.style.opacity = '1';
        adjustImageFrameSafe(img);
      };

      img.onerror = function () {
        img.onload = null;
        img.onerror = null;
        tryNext();
      };

      if (src.startsWith('data:image/')) {
        img.src = src;
      } else {
        // Cache-bust untuk CDN
        var sep = src.indexOf('?') === -1 ? '?' : '&';
        img.src = src + sep + '_cb=' + Date.now();
      }
    }

    tryNext();
  }

  // Override global soft error handler — TIDAK LOOP
  window.handlePortfolioImageSoftError = function (img) {
    if (!img || !img.id) return;
    var key = img.id;
    var sources = getSourcesForKey(key);
    var current = _imageAttempts[key] || 0;

    if (current >= sources.length) {
      img.removeAttribute('src');
      img.style.display = 'none';
      var box = img.closest('.upload-box');
      if (box) { box.classList.add('is-empty'); box.classList.remove('has-image'); }
      return;
    }

    var src = sources[current];
    _imageAttempts[key] = current + 1;

    img.onload = function () {
      img.onload = null;
      img.onerror = null;
      img.style.display = 'block';
      adjustImageFrameSafe(img);
    };
    img.onerror = function () {
      img.onload = null;
      img.onerror = null;
      window.handlePortfolioImageSoftError(img);
    };

    if (src.startsWith('data:image/')) {
      img.src = src;
    } else {
      var sep = src.indexOf('?') === -1 ? '?' : '&';
      img.src = src + sep + '_cb=' + Date.now();
    }
  };

  function loadAllImages() {
    document.querySelectorAll('img[data-upload-preview]').forEach(function (img) {
      var src = img.getAttribute('src');
      if (!src || src === '') {
        // src kosong, langsung fallback chain
        loadImageWithFallback(img);
      } else if (img.complete && img.naturalWidth) {
        // Sudah loaded
        adjustImageFrameSafe(img);
      } else if (img.complete && !img.naturalWidth) {
        // Broken
        loadImageWithFallback(img);
      } else {
        // Sedang loading — pasang onload/onerror
        img.onload = function () {
          img.onload = null;
          img.onerror = null;
          adjustImageFrameSafe(img);
        };
        img.onerror = function () {
          img.onload = null;
          img.onerror = null;
          loadImageWithFallback(img);
        };
      }
    });
  }

  /* =====================================================
   * 5. FIX: goToSection — nav merespon dengan benar
   * ===================================================== */
  window.goToSection = function (id) {
    var target = document.getElementById(id);
    if (!target) return;

    // Scroll smooth
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update active state
    document.querySelectorAll('.menu a[data-target]').forEach(function (a) {
      a.classList.remove('active');
    });
    var btn = document.querySelector('.menu a[data-target="' + id + '"]');
    if (btn) btn.classList.add('active');
  };

  /* =====================================================
   * 6. FIX: Nav click — pastikan tidak ada intercept
   *    Patch onclick attribute yang terpasang di HTML
   * ===================================================== */
  function patchNavClicks() {
    document.querySelectorAll('.menu a[data-target]').forEach(function (a) {
      // Hapus semua handler lama, pasang baru
      var clone = a.cloneNode(true);
      clone.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var target = this.getAttribute('data-target') || this.getAttribute('onclick') || '';
        // Parse dari onclick="goToSection('xxx')"
        if (!target || target === '') {
          var match = (this.getAttribute('onclick') || '').match(/goToSection\(['"]([^'"]+)['"]\)/);
          if (match) target = match[1];
        }
        if (target) window.goToSection(target);
      });
      clone.removeAttribute('onclick');
      a.parentNode.replaceChild(clone, a);
    });
  }

  /* =====================================================
   * 7. FIX: Scroll spy — update active nav saat scroll
   * ===================================================== */
  function initScrollSpy() {
    var sections = document.querySelectorAll('section[id]');
    if (!sections.length) return;

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var scrollY = window.scrollY + 160;
        var current = '';
        sections.forEach(function (sec) {
          if (sec.offsetTop <= scrollY) {
            current = sec.id;
          }
        });
        if (current) {
          document.querySelectorAll('.menu a[data-target]').forEach(function (a) {
            if (a.getAttribute('data-target') === current) {
              a.classList.add('active');
            } else {
              a.classList.remove('active');
            }
          });
        }
        ticking = false;
      });
    }, { passive: true });
  }

  /* =====================================================
   * 8. FIX: JSONP — hanya inject SEKALI
   * ===================================================== */
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx5rCNLkiZH1-CbmicSj_Qf9JVAjYLF9LF1BKingdi9CVbsu8Sia_AgWfqC5ZiZZhVF/exec';

  window.__portfolioImagesJsonpCallback = function (payload) {
    if (payload && payload.success && payload.images) {
      window.__serverImages = payload.images;
      // Re-load semua gambar dengan server data
      loadAllImages();
    }
  };

  function loadFromBackendOnce() {
    if (_jsonpInjected) return;
    _jsonpInjected = true;

    // Coba Apps Script JSONP
    var script = document.createElement('script');
    var sep = APPS_SCRIPT_URL.indexOf('?') === -1 ? '?' : '&';
    script.src = APPS_SCRIPT_URL + sep + 'action=getPortfolioImagesJsonp&callback=__portfolioImagesJsonpCallback&v=' + Date.now();
    script.async = true;
    script.onerror = function () {
      // Gagal — loadAllImages dengan sumber lokal saja
      loadAllImages();
    };
    document.head.appendChild(script);

    // Timeout fallback
    setTimeout(function () {
      if (!window.__serverImages) {
        loadAllImages();
      }
    }, 4000);
  }

  /* =====================================================
   * 9. FIX: Admin modal — satu handler saja
   * ===================================================== */
  // Remove duplicate keydown handlers dengan cara override
  var _adminModalKeyHandled = false;
  if (!_adminModalKeyHandled) {
    _adminModalKeyHandled = true;
    document.addEventListener('keydown', function (e) {
      var modal = document.getElementById('adminModal');
      var isOpen = modal && (modal.classList.contains('show') || modal.style.display === 'flex');
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        if (window.closeAdminModal) window.closeAdminModal();
      }
      if (e.key === 'Enter' && isOpen) {
        e.preventDefault();
        if (window.verifyAdminPassword) window.verifyAdminPassword();
      }
    }, true); // capture phase agar didahulukan
  }

  /* =====================================================
   * 10. FIX: Image height saat non-admin mode
   *     upload-area-bottom hidden → img harus 100%
   * ===================================================== */
  function fixImageHeightsForMode() {
    var isAdmin = document.body.classList.contains('admin-mode');
    document.querySelectorAll('img[data-upload-preview]').forEach(function (img) {
      if (!img.src || !img.naturalWidth) return;
      if (!isAdmin) {
        img.style.height = '100%';
      }
      adjustImageFrameSafe(img);
    });
  }

  /* =====================================================
   * 11. FIX: clearAllPortfolioImages — pastikan global
   * ===================================================== */
  window.clearAllPortfolioImages = function () {
    var isAdmin = document.body.classList.contains('admin-mode');
    try { if (window.isAdminPhotoMode) isAdmin = true; } catch (e) {}
    if (!isAdmin) { alert('Masuk Admin Edit Mode dulu.'); return; }
    if (!confirm('Hapus semua cache foto di browser ini?')) return;

    document.querySelectorAll('img[data-upload-preview]').forEach(function (img) {
      if (img.id) {
        try { localStorage.removeItem(img.id); } catch (e) {}
        try { sessionStorage.removeItem(img.id); } catch (e) {}
      }
    });
    alert('Cache foto lokal berhasil dihapus. Halaman akan dimuat ulang.');
    location.reload();
  };

  /* =====================================================
   * 12. FIX: Resize handler — debounced
   * ===================================================== */
  var _resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      fixImageHeightsForMode();
    }, 150);
  }, { passive: true });

  /* =====================================================
   * INIT — urutan yang benar
   * ===================================================== */
  function init() {
    if (_domReady) return;
    _domReady = true;

    fixEmptySrcImages();     // 1. Fix src="" dulu
    loadAllImages();          // 2. Load gambar dari local/cache
    patchNavClicks();         // 3. Fix nav
    initScrollSpy();          // 4. Scroll spy

    // Load backend setelah sedikit delay
    setTimeout(loadFromBackendOnce, 500);

    // Final image frame adjustment
    setTimeout(function () {
      document.querySelectorAll('img[data-upload-preview]').forEach(function (img) {
        if (img.src && img.complete && img.naturalWidth) {
          adjustImageFrameSafe(img);
        }
      });
    }, 1500);
  }

  // Pastikan init berjalan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Juga di window.load untuk gambar yang load lambat
  window.addEventListener('load', function () {
    setTimeout(function () {
      loadAllImages();
      fixImageHeightsForMode();
    }, 200);
  });

})();
