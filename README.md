# Spotify Ad Pauser

Chrome extension that detects ads on Spotify Web and pauses playback as soon as they end — automatically or after confirming via a browser notification. Includes customizable keyboard shortcuts for play/pause and skip.

## Features

- **Ad detection** on `open.spotify.com` based on the now-playing widget and page title.
- **Three modes**, selectable from the popup:
  - **Off** — does nothing.
  - **Auto** — pauses automatically right after every ad ends.
  - **Prompt** — when an ad starts, a system notification asks whether to pause when it finishes.
- **Customizable keyboard shortcuts** for *Play/Pause* and *Skip track*, working from any Chrome tab as long as a Spotify Web tab is open in the background.

## Installation (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Open [open.spotify.com](https://open.spotify.com) and start playback.

## Usage

Click the extension icon to open the popup and choose a mode:

- **Off** — extension idle.
- **Auto** — pause is applied silently at the end of every detected ad.
- **Prompt** — at the start of every ad you get a Chrome notification with *Yes / No*; the chosen action is executed when the ad ends.

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
- On ad start, depending on the mode, the script either arms an automatic pause or asks the background script to fire a notification.
- `background.js` shows the notification, forwards the user's choice back to the content script, and dispatches keyboard-shortcut commands to the active Spotify tab.
- The play/pause and skip actions are implemented by clicking Spotify's own controls (`[data-testid="control-button-playpause"]` and `[data-testid="control-button-skip-forward"]`).

## Files

- `manifest.json` — MV3 manifest, content script, service worker, commands.
- `content.js` — ad detection loop and Spotify control clicks.
- `background.js` — notifications and shortcut dispatch.
- `popup.html` / `popup.js` — mode selector and shortcut info.

## Limitations

- Selectors depend on Spotify's current DOM (`data-testid` attributes). If Spotify changes its markup, detection may break until selectors are updated.
- Ad detection is heuristic; it may occasionally miss or misclassify content.
- Shortcuts require Chrome to be focused — see the note above.

## License

MIT.
