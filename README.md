# Spotify Ad Pauser

Chrome extension that detects ads on Spotify Web and reacts to them: pauses playback when they end, mutes the tab while they play, and optionally replaces them with a song picked from a YouTube tab opened in the background.

## Features

- **Ad detection** on `open.spotify.com` based on the now-playing widget and page title.
- **Three pause modes**, selectable from the popup:
  - **Off** — does nothing.
  - **Auto** — pauses automatically right after every ad ends.
  - **Prompt** — when an ad starts, a system notification asks whether to pause when it finishes.
- **Mute ads** — silences the Spotify tab while an ad is playing and unmutes it when the ad ends.
- **YouTube replacement** — during an ad, opens a YouTube tab in the background with a song chosen at random from a configurable pool. Spotify stays muted during the ad and paused after it ends, until the YouTube song finishes; then the YT tab is closed and Spotify resumes.
- **Customizable keyboard shortcuts** for *Play/Pause* and *Skip track*, working from any Chrome tab as long as a Spotify Web tab is open in the background.

## Installation (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Open [open.spotify.com](https://open.spotify.com) and start playback.

## Usage

Click the extension icon to open the popup.

### Pause mode

- **Off** — extension idle.
- **Auto** — pause is applied silently at the end of every detected ad.
- **Prompt** — at the start of every ad you get a Chrome notification with *Yes / No*; the chosen action is executed when the ad ends.

### Mute ads

Toggle the **Muta pubblicità** checkbox to silence the Spotify tab during ads. The tab is automatically unmuted when the ad ends.

### YouTube replacement

Toggle **Sostituisci pub con canzone YT** to enable. When active, the extension overrides the pause modes above: every detected ad triggers the replacement flow.

Pick the source pool with the two checkboxes (both can be active — they combine):

- **Playlist / coda Spotify** — reads the tracks visible in the current Spotify queue or tracklist.
- **Lista personalizzata** — uses the lines you write in the textarea (one `Artista - Titolo` per line).

The **Importa playlist corrente** button reads the queue / tracklist from the active Spotify tab and writes it into the textarea.

When an ad is detected and replacement is on:

1. Spotify is muted and a YouTube tab opens in the background with the search results for the chosen track. The first non-Shorts, non-LIVE result with duration ≥ 60s is auto-clicked.
2. When the Spotify ad ends naturally, Spotify is paused (so the next real song doesn't start) while the YouTube song keeps playing.
3. When the YouTube video ends, the tab is closed automatically, Spotify is unmuted, and playback resumes.

If anything goes wrong (no candidate tracks, YouTube doesn't load, no valid result found within ~8 s), a Chrome notification appears and the extension falls back to the configured pause mode (Off / Auto / Prompt) for that ad.

If you close the YouTube tab manually during playback, Spotify is unmuted but **not** restarted — your action is treated as an explicit decision.

### Keyboard shortcuts

Two commands are exposed:

| Action       | Default        |
| ------------ | -------------- |
| Play / Pause | `Ctrl+Shift+Y` |
| Skip track   | `Ctrl+Shift+U` |

The shortcuts work whenever Chrome is in the foreground (any tab/window), provided a Spotify Web tab is open. They don't work when Chrome is minimized or another app has focus — this is a Chrome platform limitation, extensions cannot register OS-global hotkeys.

To change the bindings, open the popup and click **Personalizza scorciatoie**, or go to `chrome://extensions/shortcuts` directly. You can assign any combination Chrome accepts (e.g. `Alt+P`, `Ctrl+Shift+M`, `F8`).

## How it works

- `content.js` runs on `https://open.spotify.com/*` and polls the DOM every 500 ms with a 2-second debounce. An ad is detected when playback is active but the now-playing widget has no track/album link, or the page title matches known ad patterns.
- On ad start, depending on the active mode, the script either arms an automatic pause, asks the background script to fire a notification, or kicks off the YouTube replacement flow (sending the current queue and config to the background).
- `background.js` is the orchestrator: it manages the replacement state machine (open YT tab, mute Spotify, wait for video-ready / ad-ended / video-ended), forwards notification choices, and dispatches keyboard shortcuts.
- `youtube.js` runs on `youtube.com/results*` and `youtube.com/watch*`. On the results page (only when triggered by the extension via a `?sap=1` query flag) it auto-clicks the first valid video. On the watch page it listens for the `ended` event and notifies the background.
- All play/pause/skip actions on Spotify are performed by clicking Spotify's own controls (`[data-testid="control-button-playpause"]` and `[data-testid="control-button-skip-forward"]`).

## Files

- `manifest.json` — MV3 manifest, content scripts, service worker, commands, host permissions.
- `content.js` — ad detection loop, Spotify queue reader, Spotify control clicks.
- `background.js` — notifications, replacement state machine, tab management, shortcut dispatch.
- `youtube.js` — YouTube content script: auto-click first result and detect end of video.
- `popup.html` / `popup.js` — mode selector, mute toggle, YT replacement settings, shortcut info.

## Limitations

- Selectors depend on Spotify's and YouTube's current DOM. If either site changes its markup, detection or auto-click may break until selectors are updated.
- Ad detection is heuristic; it may occasionally miss or misclassify content.
- Shortcuts require Chrome to be focused — see the note above.
- YouTube replacement assumes a single Spotify tab and standard YouTube autoplay behavior. If autoplay is disabled in your YouTube account the replacement won't start (timeout fallback kicks in).

## License

MIT.
