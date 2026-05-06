// Riceve "ad-started" dal content script -> mostra notifica con Si'/No.
// Inoltra la scelta al content script che ha originato il messaggio.

const NOTIF_ID_PREFIX = 'sap-ad-';
const pending = new Map(); // notifId -> tabId

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'mute-tab') {
    if (sender.tab?.id != null) {
      chrome.tabs.update(sender.tab.id, { muted: !!msg.mute }).catch(() => {});
    }
    return;
  }
  if (msg?.type !== 'ad-started') return;
  if (!sender.tab?.id) return;
  // chiudi eventuali notifiche pendenti per questa tab (vecchia pub non risposta)
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
