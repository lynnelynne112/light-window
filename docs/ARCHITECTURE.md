# Architecture

`src/host.js` owns the native BrowserWindow, tray, shortcut, and WebContentsViews. `chrome.html` and its UI scripts are local trusted controls. Remote website views receive no preload and cannot call the local IPC bridge.

`src/sites.js` validates website records and derives persistent session partitions from the URL origin. The original Fenbi entry intentionally retains `persist:fenbi` for Windows 2.x profile compatibility. An entry ID identifies a saved shortcut, while the partition identifies browser storage; deleting a shortcut does not erase login data.

Each saved entry lazily owns a stack of views. Only the selected entry's last view is visible. Popup views remain with the website that opened them, including their opener relationship and session. Switching entries hides old views without destroying or reloading them. Removing an entry closes its live views, and shutdown closes every site's cached views.

`src/core.js` contains the hover transition controller and responsive chrome geometry. The renderer receives that geometry from the host so that website views start below the controls instead of covering them. The frameless corner uses the same 20×20 bounds for its view and pointer detection.

`npm test` covers URL validation, saved entry behavior, session partitioning, and interrupted fade transitions. Desktop tests exercise real native windows and local HTTP fixtures, including switching live pages, storage isolation, popup return, responsive controls, and persistence across an actual process restart. Optional Win32 checks query resize hit tests with a confirmed invisible, unfocused window; they do not move the user's mouse or capture the desktop.

The Windows packaging script copies a runtime and an explicit source-file allowlist into a fresh output folder. It never copies the project's runtime `data`, test profiles, Git metadata, or node_modules into the portable distribution.
