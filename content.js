(() => {
  let wasAd = false;
  let armed = false;        // pausa one-shot al termine della pub corrente
  let mode = 'prompt';      // 'off' | 'auto' | 'prompt'

  const STABLE_MS = 2000;
  let candidate = false;
  let candidateSince = 0;

  chrome.storage?.sync.get({ mode: 'prompt' }, (r) => { mode = r.mode; });
  chrome.storage?.onChanged.addListener((c) => {
    if (c.mode) mode = c.mode.newValue;
  });

  // ----- e' Spotify in pausa? -----
  const isPaused = () => {
    const btn = document.querySelector('[data-testid="control-button-playpause"]');
    if (!btn) return true; // niente player = niente pub
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    // se il bottone offre "play/riproduci", la riproduzione e' ferma
    return label.includes('play') || label.includes('riprodu');
  };

  // ----- rilevamento pub -----
  const rawIsAd = () => {
    // se non sta suonando nulla, non puo' esserci una pub in corso
    if (isPaused()) return false;

    const widget = document.querySelector('[data-testid="now-playing-widget"]');
    if (widget) {
      const link = widget.querySelector('a[href^="/album/"], a[href^="/track/"]');
      if (link) return false;
    }
    const t = document.title.trim();
    if (!t) return false;
    if (/advertisement/i.test(t)) return true;
    if (/spotify ad/i.test(t)) return true;
    if (/^Spotify([\s–—-]+Web Player)?$/i.test(t)) return true;
    if (widget && !t.includes('•')) return true;
    return false;
  };

  // ----- pausa Spotify -----
  const pause = () => {
    const btn = document.querySelector('[data-testid="control-button-playpause"]');
    if (!btn) return false;
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('paus')) {
      btn.click();
      console.log('[SpotifyAutoPause] Pausa premuta.');
      return true;
    }
    return false;
  };

  // ----- decisione dalla notifica del browser -----
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'ad-decision') {
      armed = !!msg.arm;
      console.log('[SpotifyAutoPause] Decisione:', armed ? 'PAUSA' : 'ignora');
      return;
    }
    if (msg?.type === 'shortcut') {
      if (msg.action === 'toggle-pause') {
        const btn = document.querySelector('[data-testid="control-button-playpause"]');
        btn?.click();
      } else if (msg.action === 'skip-track') {
        const btn = document.querySelector('[data-testid="control-button-skip-forward"]');
        btn?.click();
      }
    }
  });

  // ----- loop principale con debounce -----
  const tick = () => {
    if (mode === 'off') return;
    const raw = rawIsAd();
    const now = Date.now();

    if (raw !== wasAd) {
      if (candidate !== raw) {
        candidate = raw;
        candidateSince = now;
      } else if (now - candidateSince >= STABLE_MS) {
        const newState = candidate;
        if (newState && !wasAd) {
          // INIZIO pub
          if (mode === 'auto') {
            armed = true; // automatico: pausa garantita a fine pub
            console.log('[SpotifyAutoPause] Pub iniziata (modalita auto, armato).');
          } else if (mode === 'prompt') {
            armed = false; // serve risposta dell'utente
            chrome.runtime.sendMessage({ type: 'ad-started' });
            console.log('[SpotifyAutoPause] Pub iniziata (modalita prompt, in attesa).');
          }
        } else if (!newState && wasAd) {
          // FINE pub
          if (armed) {
            setTimeout(() => { pause(); armed = false; }, 400);
          }
          console.log('[SpotifyAutoPause] Pub finita.');
        }
        wasAd = newState;
      }
    } else {
      candidate = raw;
      candidateSince = now;
    }
  };

  setInterval(tick, 500);
  console.log('[SpotifyAutoPause] attivo, modalita iniziale:', mode);
})();
