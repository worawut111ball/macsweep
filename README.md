# MacSweep

Mac Disk Space Manager — visualize and clean disk usage on macOS.

![Electron](https://img.shields.io/badge/Electron-35-blue)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Storage Overview** — bar chart matching macOS Storage breakdown (System Data, Applications, macOS, Projects)
- **Sunburst Chart** — interactive D3.js visualization of cleanable items
- **20 Scan Categories** — node_modules, Docker, npm/pnpm, Zed, AI tools, Playwright, Xcode, and more
- **Safe Delete** — allowlist-based path protection with path traversal prevention
- **Docker Prune** — clean build cache and unused images directly from the app
- **Auto Scan** — scans on launch, keyboard shortcut `Cmd+R` to rescan

## Categories

| Category | Safety | Description |
|----------|--------|-------------|
| node_modules | Safe | ลบแล้ว `npm install` ใหม่ได้ |
| .next Build Cache | Safe | Next.js build cache |
| npm / pnpm Cache | Safe | Package manager cache |
| Homebrew Cache | Safe | Homebrew download cache |
| PlatformIO | Caution | Toolchains & libraries |
| Generic Cache (~/.cache) | Safe | Cache ทั่วไป |
| Node Versions (nvm) | Caution | Node.js versions |
| Dart/Flutter Cache | Safe | Dart pub cache |
| Playwright Browsers | Safe | Test browser binaries |
| Chrome Cache | Safe | Browser cache |
| Discord Cache | Safe | App cache |
| AI Tool Caches | Safe | Gemini CLI, Codex CLI |
| Zed Editor Cache | Safe | LSP servers, grammars |
| Bun / Dart Server | Safe | Runtime caches |
| Docker | Caution | Build cache + unused images |
| Xcode Data | Caution | DerivedData & device support |
| Trash | Safe | macOS Trash |
| System Logs | Caution | Log files |
| Other Caches | Danger | Misc ~/Library/Caches |

## Install

```bash
# Clone
git clone https://github.com/worawut111ball/macsweep.git
cd macsweep

# Install dependencies
npm install

# Run (dev mode)
npm run dev        # Express server at http://localhost:3456

# Run (Electron)
npm start

# Build .dmg
npm run dist
```

## Tech Stack

- **Electron** — native macOS app
- **Express** — dev server fallback
- **D3.js** — sunburst visualization
- **Node.js** — disk scanning via `du`, `diskutil`, `find`

## Security

- Path allowlist prevents deletion outside approved directories
- Path traversal attacks are blocked (`../` resolved before validation)
- Docker operations use official CLI commands, not filesystem deletion
- No sudo required — scans only user-accessible paths

## License

MIT
