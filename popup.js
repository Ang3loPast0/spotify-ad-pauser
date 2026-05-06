const radios = document.querySelectorAll('input[name="mode"]');

const ytEnabled = document.getElementById('ytReplacementEnabled');
const ytSourceSpotify = document.getElementById('ytSourceSpotify');
const ytSourceCustom = document.getElementById('ytSourceCustom');
const ytCustomList = document.getElementById('ytCustomList');
const ytSourcesBlock = document.getElementById('ytSourcesBlock');
const ytSourceWarning = document.getElementById('ytSourceWarning');

const STORAGE_DEFAULTS = {
  mode: 'prompt',
  muteAds: false,
  ytReplacementEnabled: false,
  ytSourceSpotify: true,
  ytSourceCustom: false,
  ytCustomList: '',
};

chrome.storage.sync.get(STORAGE_DEFAULTS, (res) => {
  for (const r of radios) r.checked = (r.value === res.mode);
  document.getElementById('muteAds').checked = !!res.muteAds;
  ytEnabled.checked = !!res.ytReplacementEnabled;
  ytSourceSpotify.checked = !!res.ytSourceSpotify;
  ytSourceCustom.checked = !!res.ytSourceCustom;
  ytCustomList.value = res.ytCustomList || '';
  refreshYtUI();
});

document.getElementById('muteAds').addEventListener('change', (e) => {
  chrome.storage.sync.set({ muteAds: e.target.checked });
});

for (const r of radios) {
  r.addEventListener('change', () => {
    if (r.checked) chrome.storage.sync.set({ mode: r.value });
  });
}

function refreshYtUI() {
  const on = ytEnabled.checked;
  ytSourcesBlock.style.opacity = on ? '1' : '0.5';
  ytSourcesBlock.style.pointerEvents = on ? 'auto' : 'none';
  const noSource = on && !ytSourceSpotify.checked && !ytSourceCustom.checked;
  ytSourceWarning.style.display = noSource ? 'block' : 'none';
}

ytEnabled.addEventListener('change', () => {
  chrome.storage.sync.set({ ytReplacementEnabled: ytEnabled.checked });
  refreshYtUI();
});
ytSourceSpotify.addEventListener('change', () => {
  chrome.storage.sync.set({ ytSourceSpotify: ytSourceSpotify.checked });
  refreshYtUI();
});
ytSourceCustom.addEventListener('change', () => {
  chrome.storage.sync.set({ ytSourceCustom: ytSourceCustom.checked });
  refreshYtUI();
});
ytCustomList.addEventListener('change', () => {
  chrome.storage.sync.set({ ytCustomList: ytCustomList.value });
});

// ----- mostra le scorciatoie attualmente impostate (lettura sola da Chrome) -----
const labels = {
  'toggle-pause': 'Play / Pausa',
  'skip-track': 'Salta traccia',
};

chrome.commands.getAll((cmds) => {
  const container = document.getElementById('shortcuts');
  for (const cmd of cmds) {
    if (!labels[cmd.name]) continue;
    const row = document.createElement('div');
    row.className = 'sc-row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = labels[cmd.name];
    const key = document.createElement('span');
    key.className = 'key' + (cmd.shortcut ? '' : ' unset');
    key.textContent = cmd.shortcut || 'non impostata';
    row.appendChild(name);
    row.appendChild(key);
    container.appendChild(row);
  }
});

document.getElementById('customize').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
