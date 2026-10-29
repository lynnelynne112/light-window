# Security and local data

Remote sites run in sandboxed, isolated WebContentsViews with Node integration disabled. They do not receive the local UI preload or the privileged IPC bridge. Local controls use a restrictive Content Security Policy, and IPC only accepts the application's own control views.

Only HTTP/HTTPS addresses may be saved or opened through the address field. Credentials in URLs and executable/local schemes are rejected. Blank child pages are allowed for ordinary `window.open` login flows, while child pages retain the opener's isolated browser partition.

Camera, microphone, location and other extra site permissions are denied by default. The app has no updater, telemetry service, remote debugging port or upload service.

`data/` can contain sensitive login state and personal URLs. Do not attach it to bug reports. Build and source exports deliberately exclude this directory and generated test profiles. Close the app before manually backing up or moving local browser data.

Report a potential security issue through the repository's private security advisory feature if the owner enables it. Do not publish tokens, passwords, browser databases, or private URLs in public issues. Keep Electron updated and review the [official Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) when changing navigation or IPC behavior.
