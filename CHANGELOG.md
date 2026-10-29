# Changelog

## 3.0.1

- Store Windows release profiles in one shared per-user directory, so extracting an update elsewhere retains login data.
- Copy compatible legacy data without deleting the original, and refuse ambiguous or incomplete migrations.
- Wait for every opened site's cookie and DOM storage writes before normal exit, including background sites and final page shutdown.
- Add process-restart and two-install-directory login regression tests, including explicit logout.

## 3.0.0

- Generalize the Fenbi-only window into a saved website library.
- Add website creation, editing, removal, switching, and current-page bookmarks.
- Preserve live background pages and isolate storage by origin while retaining the legacy Fenbi partition.
- Retain responsive controls, whole-window opacity, hover reveal, small frameless controls, hidden taskbar button, and unconstrained resizing.
- Add reproducible npm dependencies, unit tests, desktop regression tests, portable packaging, and GitHub Actions.
