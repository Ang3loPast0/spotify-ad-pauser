(() => {
  let wasAd = false;
  let armed = false;        // pausa one-shot al termine della pub corrente
  let mode = 'prompt';      // 'off' | 'auto' | 'prompt'
  let muteAds = false;

  const STABLE_MS = 2000;
  let candidate = false;
  let candidateSince = 0;

  chrome.storage?.sync.get({ mode: 'prompt', muteAds: false }, (r) => {
    mode = r.mode;
    muteAds = !!r.muteAds;
  });
  chrome.storage?.onChanged.addListener((c) => {
    if (c.mode) mode = c.mode.newValue;
    if (c.muteAds) {
      muteAds = !!c.muteAds.newValue;
      // se disattivo l'opzione mentre la tab e' mutata, smuta subito
      if (!muteAds) chrome.runtime.sendMessage({ type: 'mute-tab', mute: false });
      // se attivo l'opzione mentre c'e' una pub in corso, muta subito
      else if (wasAd) chrome.runtime.sendMessage({ type: 'mute-tab', mute: true });
    }
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

  // ----- lettura coda Spotify dal DOM -----
  const readQueue = () => {
    const tracks = [];
    // Tentativo 1: pannello "Coda" aperto
    const queuePanel = document.querySelector('[aria-label="Coda"], [aria-label="Queue"], aside[aria-label*="oda"], aside[aria-label*="ueue"]');
    if (queuePanel) {
      const rows = queuePanel.querySelectorAll('[role="row"], [data-testid="tracklist-row"]');
      rows.forEach((row) => {
        const titleEl = row.querySelector('a[href^="/track/"], div[data-encore-id="text"]');
        const artistEl = row.querySelector('a[href^="/artist/"]');
        const title = titleEl?.textContent?.trim();
        const artist = artistEl?.textContent?.trim();
        if (title && artist) tracks.push(`${artist} - ${title}`);
      });
    }
    // Tentativo 2: tracklist principale
    if (!tracks.length) {
      const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
      rows.forEach((row) => {
        const links = row.querySelectorAll('a');
        let title = null, artist = null;
        links.forEach((a) => {
          const href = a.getAttribute('href') || '';
          if (href.startsWith('/track/') && !title) title = a.textContent?.trim();
          if (href.startsWith('/artist/') && !artist) artist = a.textContent?.trim();
        });
        if (title && artist) tracks.push(`${artist} - ${title}`);
      });
    }
    return tracks;
  };

  // ----- decisione dalla notifica del browser + nuovi messaggi -----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
      return;
    }
    if (msg?.type === 'read-queue') {
      sendResponse({ tracks: readQueue() });
      return true; // async response
    }
    if (msg?.type === 'pause-spotify') {
      pause();
      return;
    }
    if (msg?.type === 'play-spotify') {
      const btn = document.querySelector('[data-testid="control-button-playpause"]');
      const label = (btn?.getAttribute('aria-label') || '').toLowerCase();
      if (btn && (label.includes('play') || label.includes('riprodu'))) {
        btn.click();
        console.log('[SpotifyAutoPause] Play premuto.');
      }
      return;
    }
    if (msg?.type === 'replacement-failed') {
      // Replacement YT fallito: applica comportamento legacy "come se il toggle fosse off"
      console.log('[SpotifyAutoPause] replacement fallito, fallback legacy:', mode);
      if (muteAds && wasAd) {
        chrome.runtime.sendMessage({ type: 'mute-tab', mute: true });
      }
      if (mode === 'auto') {
        armed = true;
      } else if (mode === 'prompt') {
        armed = false;
        chrome.runtime.sendMessage({ type: 'ad-started', replacement: false });
      }
      return;
    }
  });

  // ----- loop principale con debounce -----
  const tick = () => {
    if (mode === 'off' && !muteAds) return;
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
          chrome.storage.sync.get({
            ytReplacementEnabled: false,
            ytSourceSpotify: true,
            ytSourceCustom: false,
            ytCustomList: '',
          }, (cfg) => {
            if (cfg.ytReplacementEnabled) {
              // Replacement attivo: override totale del mode (con fallback legacy gestito al fail)
              armed = false;
              const queue = cfg.ytSourceSpotify ? readQueue() : [];
              chrome.runtime.sendMessage({
                type: 'ad-started',
                replacement: true,
                queue,
                config: cfg,
                legacyMode: mode,
                legacyMuteAds: muteAds,
              });
              console.log('[SpotifyAutoPause] Pub iniziata (replacement YT richiesto).');
              return;
            }
            // Comportamento esistente
            if (muteAds) chrome.runtime.sendMessage({ type: 'mute-tab', mute: true });
            if (mode === 'auto') {
              armed = true;
              console.log('[SpotifyAutoPause] Pub iniziata (modalita auto, armato).');
            } else if (mode === 'prompt') {
              armed = false;
              chrome.runtime.sendMessage({ type: 'ad-started', replacement: false });
              console.log('[SpotifyAutoPause] Pub iniziata (modalita prompt, in attesa).');
            }
          });
        } else if (!newState && wasAd) {
          // FINE pub
          if (armed) {
            setTimeout(() => { pause(); armed = false; }, 400);
          }
          if (muteAds) chrome.runtime.sendMessage({ type: 'mute-tab', mute: false });
          chrome.runtime.sendMessage({ type: 'ad-ended' });
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
