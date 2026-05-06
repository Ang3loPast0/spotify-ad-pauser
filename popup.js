const radios = document.querySelectorAll('input[name="mode"]');

chrome.storage.sync.get({ mode: 'prompt' }, (res) => {
  for (const r of radios) r.checked = (r.value === res.mode);
});

for (const r of radios) {
  r.addEventListener('change', () => {
    if (r.checked) chrome.storage.sync.set({ mode: r.value });
  });
}

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
