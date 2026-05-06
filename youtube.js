(() => {
  const log = (...a) => console.log('[SpotifyAutoPause/YT]', ...a);

  let attachedVideo = null;
  let endedSent = false;

  const onEnded = () => {
    if (endedSent) return;
    endedSent = true;
    log('video ended');
    chrome.runtime.sendMessage({ type: 'video-ended' }).catch(() => {});
  };

  const attachToVideo = () => {
    const v = document.querySelector('video');
    if (!v) return false;
    if (attachedVideo === v) return true;
    if (attachedVideo) attachedVideo.removeEventListener('ended', onEnded);
    attachedVideo = v;
    endedSent = false;
    v.addEventListener('ended', onEnded);
    log('listener attached to <video>');

    // Strategia: autoplay con audio bloccato sui background tab.
    // Avviamo MUTED (autoplay sempre permesso) e poi smutiamo appena parte.
    v.muted = true;

    const notifyReady = () => {
      chrome.runtime.sendMessage({ type: 'video-ready' }).catch(() => {});
    };

    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    let unmuted = false;
    v.addEventListener('playing', () => {
      log('video playing, smuto');
      if (!unmuted) {
        unmuted = true;
        try { v.muted = false; } catch (e) {}
      }
      notifyReady();
    });

    // Fallback: notifica ready anche se solo loadeddata scatta (raro)
    if (v.readyState >= 2) {
      tryPlay();
    } else {
      v.addEventListener('loadeddata', tryPlay, { once: true });
    }
    tryPlay();
    // Retry play per i primi 15s
    let attempts = 0;
    const playIv = setInterval(() => {
      if (++attempts > 30 || !v.paused) { clearInterval(playIv); return; }
      tryPlay();
    }, 500);
    return true;
  };

  const handleWatchPage = () => {
    if (attachToVideo()) return;
    const start = Date.now();
    const iv = setInterval(() => {
      if (attachToVideo() || Date.now() - start > 10000) clearInterval(iv);
    }, 200);
  };

  const handleResultsPage = () => {
    // Cerca il primo video valido: non Shorts, non LIVE, durata >= 60s
    const params = new URLSearchParams(location.search);
    if (params.get('sap') !== '1') return; // click solo se siamo arrivati qui dal background
    log('results page, attendo primo video valido');

    const start = Date.now();
    const iv = setInterval(() => {
      if (Date.now() - start > 10000) {
        clearInterval(iv);
        chrome.runtime.sendMessage({ type: 'yt-error', reason: 'no-results' }).catch(() => {});
        return;
      }
      const renderers = document.querySelectorAll('ytd-video-renderer');
      for (const r of renderers) {
        // Skip Shorts
        if (r.querySelector('[overlay-style="SHORTS"], a[href*="/shorts/"]')) continue;
        // Skip live (badge classico, aria-label, oppure testo "LIVE NOW" / "IN DIRETTA")
        if (r.querySelector('.badge-style-type-live-now, [aria-label*="LIVE" i], [aria-label*="diretta" i]')) continue;
        // Durata: regex sul testo del renderer (resistente ai cambi di selettori)
        const text = r.textContent || '';
        const m = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[^\d]|$)/);
        if (m) {
          const has3 = m[3] !== undefined;
          const h = has3 ? parseInt(m[1], 10) : 0;
          const mm = has3 ? parseInt(m[2], 10) : parseInt(m[1], 10);
          const ss = has3 ? parseInt(m[3], 10) : parseInt(m[2], 10);
          const seconds = h * 3600 + mm * 60 + ss;
          if (seconds < 60) continue;
        }
        // Se non trovo durata, accetto comunque (meglio click su qualcosa che timeout)
        const link = r.querySelector('a#video-title, a#thumbnail, a[href*="/watch"]');
        if (!link) continue;
        clearInterval(iv);
        log('click su risultato valido:', link.href);
        link.click();
        return;
      }
    }, 300);
  };

  const route = () => {
    const url = location.href;
    if (url.includes('/watch')) handleWatchPage();
    else if (url.includes('/results')) handleResultsPage();
  };

  // SPA navigation handling
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('SPA nav to', lastUrl);
      route();
    }
  }).observe(document.body, { subtree: true, childList: true });

  route();
  log('youtube.js attivo');
})();
