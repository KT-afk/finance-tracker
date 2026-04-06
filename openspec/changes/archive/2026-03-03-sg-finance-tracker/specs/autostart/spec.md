## ADDED Requirements

### Requirement: macOS launchd auto-start
The project SHALL include a macOS launchd plist file that starts the production build of the application on login, binding to `0.0.0.0:3000` for home LAN access.

#### Scenario: App starts on login
- **WHEN** the user logs into macOS
- **THEN** the launchd agent SHALL automatically start the Next.js production server at localhost:3000

#### Scenario: App accessible on home LAN
- **WHEN** the app is running
- **THEN** it SHALL be accessible from other devices on the same network via the host machine's local IP on port 3000

### Requirement: Setup script
The project SHALL include a shell script (`scripts/setup-autostart.sh`) that installs the launchd plist to `~/Library/LaunchAgents/` and loads it, requiring no manual file copying by the user.

#### Scenario: Setup script installs service
- **WHEN** the user runs `bash scripts/setup-autostart.sh`
- **THEN** the launchd plist SHALL be copied to `~/Library/LaunchAgents/` and loaded via `launchctl`

### Requirement: Production build requirement
The launchd service SHALL run `npm run start` (production build), not `npm run dev`. The README SHALL document that `npm run build` must be run before the service starts correctly.

#### Scenario: Service uses production build
- **WHEN** the launchd agent starts the app
- **THEN** it SHALL execute the production Next.js server, not the dev server
