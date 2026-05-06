// Riceve "ad-started" dal content script -> mostra notifica con Si'/No.
// Inoltra la scelta al content script che ha originato il messaggio.

// ====== Replacement YT state machine ======
const STATE = {
  IDLE: 'IDLE',
  AD_DETECTED: 'AD_DETECTED',
  YT_LOADING: 'YT_LOADING',
  YT_PLAYING_AD_LIVE: 'YT_PLAYING_AD_LIVE',
  YT_PLAYING_AD_OVER: 'YT_PLAYING_AD_OVER',
};

let replState = STATE.IDLE;
let replSpotifyTabId = null;
let replYtTabId = null;
let replLoadingTimeout = null;

function resetReplacement() {
  if (replLoadingTimeout) { clearTimeout(replLoadingTimeout); replLoadingTimeout = null; }
  replState = STATE.IDLE;
  replSpotifyTabId = null;
  replYtTabId = null;
}

function notifyError(reason) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Replacement YT fallito',
    message: reason || 'Impossibile sostituire la pub. Comportamento normale ripristinato.',
    priority: 1,
  });
}

function pickTrack(queue, customList) {
  const pool = [];
  if (Array.isArray(queue)) pool.push(...queue.filter(Boolean));
  if (typeof customList === 'string') {
    customList.split('\n').map((s) => s.trim()).filter(Boolean).forEach((s) => pool.push(s));
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function failToLegacy(spotifyTabId, reason) {
  notifyError(reason);
  const ytId = replYtTabId;
  resetReplacement();
  if (ytId != null) { try { await chrome.tabs.remove(ytId); } catch (e) {} }
  if (spotifyTabId != null) {
    try { await chrome.tabs.update(spotifyTabId, { muted: false }); } catch (e) {}
    chrome.tabs.sendMessage(spotifyTabId, { type: 'replacement-failed' }).catch(() => {});
  }
}

async function startReplacement(spotifyTabId, msg) {
  const cfg = msg.config || {};
  const queue = cfg.ytSourceSpotify ? (msg.queue || []) : [];
  const custom = cfg.ytSourceCustom ? (cfg.ytCustomList || '') : '';
  const track = pickTrack(queue, custom);
  if (!track) {
    await failToLegacy(spotifyTabId, 'Nessun brano disponibile (sorgenti vuote).');
    return;
  }
  console.log('[SpotifyAutoPause/BG] replacement con:', track);

  replSpotifyTabId = spotifyTabId;
  replState = STATE.AD_DETECTED;

  // Mute Spotify
  try { await chrome.tabs.update(spotifyTabId, { muted: true }); } catch (e) {}

  // Apri tab YT in background
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(track)}&sap=1`;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    replYtTabId = tab.id;
    replState = STATE.YT_LOADING;
    replLoadingTimeout = setTimeout(() => {
      if (replState === STATE.YT_LOADING) {
        const sId = replSpotifyTabId;
        failToLegacy(sId, 'Timeout caricamento YouTube.');
      }
    }, 12000);
  } catch (err) {
    await failToLegacy(spotifyTabId, 'Impossibile aprire tab YouTube.');
  }
}

async function abortReplacement() {
  // Abort silenzioso (chiusura manuale tab YT da utente): smuta ma NO play, NO fallback legacy
  const spotifyId = replSpotifyTabId;
  const ytId = replYtTabId;
  resetReplacement();
  if (ytId != null) { try { await chrome.tabs.remove(ytId); } catch (e) {} }
  if (spotifyId != null) { try { await chrome.tabs.update(spotifyId, { muted: false }); } catch (e) {} }
}

const NOTIF_ID_PREFIX = 'sap-ad-';
const pending = new Map(); // notifId -> tabId

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'mute-tab') {
    if (sender.tab?.id != null) {
      chrome.tabs.update(sender.tab.id, { muted: !!msg.mute }).catch(() => {});
    }
    return;
  }

  if (msg?.type === 'ad-started') {
    if (msg.replacement) {
      // Nuovo flow replacement YT
      if (replState !== STATE.IDLE) {
        console.log('[SpotifyAutoPause/BG] ad-started ignorato, stato:', replState);
        return;
      }
      if (sender.tab?.id != null) startReplacement(sender.tab.id, msg);
      return;
    }
    // Flow legacy prompt
    if (!sender.tab?.id) return;
    for (const [nid, tid] of pending.entries()) {
      if (tid === sender.tab.id) {
        chrome.notifications.clear(nid);
        pending.delete(nid);
      }
    }
    const id = NOTIF_ID_PREFIX + sender.tab.id + '-' + Date.now();
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Spotify: pubblicita rilevata',
      message: 'Vuoi mettere pausa quando la pub finisce?',
      buttons: [{ title: 'Si, metti pausa' }, { title: 'No, lascia stare' }],
      requireInteraction: true,
      priority: 2,
    });
    pending.set(id, sender.tab.id);
    return;
  }

  if (msg?.type === 'video-ready') {
    if (replState === STATE.YT_LOADING && sender.tab?.id === replYtTabId) {
      if (replLoadingTimeout) { clearTimeout(replLoadingTimeout); replLoadingTimeout = null; }
      replState = STATE.YT_PLAYING_AD_LIVE;
      console.log('[SpotifyAutoPause/BG] YT pronto, stato AD_LIVE');
    }
    return;
  }

  if (msg?.type === 'ad-ended') {
    if (replState === STATE.YT_PLAYING_AD_LIVE && sender.tab?.id === replSpotifyTabId) {
      replState = STATE.YT_PLAYING_AD_OVER;
      // Pausa Spotify subito per non far partire la canzone vera
      chrome.tabs.sendMessage(replSpotifyTabId, { type: 'pause-spotify' }).catch(() => {});
      console.log('[SpotifyAutoPause/BG] pub finita, Spotify in pausa, YT continua');
    }
    return;
  }

  if (msg?.type === 'video-ended') {
    if (sender.tab?.id !== replYtTabId) return;
    if (replState === STATE.YT_PLAYING_AD_OVER || replState === STATE.YT_PLAYING_AD_LIVE) {
      const spotifyId = replSpotifyTabId;
      const ytId = replYtTabId;
      const wasOver = replState === STATE.YT_PLAYING_AD_OVER;
      resetReplacement();
      // Chiudi tab YT
      chrome.tabs.remove(ytId).catch(() => {});
      // Smuta Spotify
      chrome.tabs.update(spotifyId, { muted: false }).catch(() => {});
      // Solo se la pub era già finita riavviamo Spotify (canzone era in pausa)
      if (wasOver) {
        chrome.tabs.sendMessage(spotifyId, { type: 'play-spotify' }).catch(() => {});
      }
      console.log('[SpotifyAutoPause/BG] flow completato');
    }
    return;
  }

  if (msg?.type === 'yt-error') {
    if (sender.tab?.id === replYtTabId) {
      const sId = replSpotifyTabId;
      failToLegacy(sId, 'Errore YouTube: ' + (msg.reason || 'sconosciuto'));
    }
    return;
  }
});

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  const tabId = pending.get(notifId);
  if (tabId == null) return;
  const arm = btnIdx === 0; // 0 = Si', 1 = No
  chrome.tabs.sendMessage(tabId, { type: 'ad-decision', arm }).catch(() => {});
  chrome.notifications.clear(notifId);
  pending.delete(notifId);
});

chrome.notifications.onClosed.addListener((notifId) => {
  pending.delete(notifId);
});

// ----- scorciatoie -----
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-pause' && command !== 'skip-track') return;
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' });
  if (!tabs.length) return;
  const tab = tabs.find((t) => t.active) || tabs[0];
  chrome.tabs.sendMessage(tab.id, { type: 'shortcut', action: command }).catch(() => {});
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === replYtTabId && replState !== STATE.IDLE) {
    console.log('[SpotifyAutoPause/BG] tab YT chiusa manualmente, abort');
    const spotifyId = replSpotifyTabId;
    resetReplacement();
    if (spotifyId != null) {
      try { await chrome.tabs.update(spotifyId, { muted: false }); } catch (e) {}
    }
    // Niente play automatico (decisione utente)
  }
  if (tabId === replSpotifyTabId && replState !== STATE.IDLE) {
    console.log('[SpotifyAutoPause/BG] tab Spotify chiusa, abort');
    const ytId = replYtTabId;
    resetReplacement();
    if (ytId != null) { try { await chrome.tabs.remove(ytId); } catch (e) {} }
  }
});
