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
    if (v.readyState >= 2) {
      chrome.runtime.sendMessage({ type: 'video-ready' }).catch(() => {});
    } else {
      v.addEventListener('loadeddata', () => {
        chrome.runtime.sendMessage({ type: 'video-ready' }).catch(() => {});
      }, { once: true });
    }
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
      if (Date.now() - start > 8000) {
        clearInterval(iv);
        chrome.runtime.sendMessage({ type: 'yt-error', reason: 'no-results' }).catch(() => {});
        return;
      }
      const renderers = document.querySelectorAll('ytd-video-renderer');
      for (const r of renderers) {
        const isShort = r.querySelector('[overlay-style="SHORTS"], a[href*="/shorts/"]');
        if (isShort) continue;
        const badge = r.querySelector('.badge-style-type-live-now, [aria-label*="LIVE"]');
        if (badge) continue;
        const durationEl = r.querySelector('.ytd-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-time-status-renderer');
        const durStr = durationEl?.textContent?.trim();
        if (!durStr) continue;
        const parts = durStr.split(':').map((n) => parseInt(n, 10));
        let seconds = 0;
        if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
        else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (seconds < 60) continue;
        const link = r.querySelector('a#video-title, a#thumbnail');
        if (!link) continue;
        clearInterval(iv);
        log('click su risultato valido:', durStr, link.href);
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
