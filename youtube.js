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
    // Implementato nel Task 7
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
