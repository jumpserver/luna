# JumpServer Luna

English | [中文](README_CN.md)

Luna is the asset connection workspace for JumpServer, available in the browser and as an Electron desktop app. Terminal, file manager, database, remote desktop, and Kubernetes sessions open as tabs in the same workspace.

The frontend uses Nuxt 4, Vue 3, and Nuxt UI. Web and desktop share the interface and connection modules. The desktop app adds local terminals, external application launch, and offline recording tools.

## Features

- **Terminal**: connect to SSH, Telnet, and other assets through Koko.
- **Files**: browse, upload, download, and edit remote files over SFTP.
- **Databases**: browse objects, write SQL, and inspect query results through Chen. Supported protocols include MySQL, PostgreSQL, Redis, MongoDB, Oracle, SQL Server, ClickHouse, MariaDB, Dameng, and DB2.
- **Remote desktop**: use RDP, VNC, and remote applications through Lion.
- **Kubernetes**: browse cluster resources and open container terminals.
- **Web assets**: access HTTP/HTTPS applications through Web Proxy.
- **Session collaboration and audit**: share sessions, monitor connections, and replay online recordings.
- **AI assistant**: work with terminal and database sessions through Kael, with tool approval and cancellation.

Available assets and connection methods depend on the JumpServer configuration and user permissions. The interface includes multiple languages, light and dark modes, and theme presets.

## Usage

### Web

After deploying JumpServer, open `/luna/` on your site. Unauthenticated users are redirected to the server login page. Once signed in, select an asset, account, and connection method to start a session.

Luna requires JumpServer Core and the relevant connection services. Starting the frontend alone does not start those services.

### Desktop

Download a package for your platform from [Releases](https://github.com/jumpserver/luna/releases):

| Platform | Packages                           |
| -------- | ---------------------------------- |
| macOS    | `.dmg` for Apple Silicon and Intel |
| Windows  | `.exe` or `.msi` for x64           |
| Linux    | `.deb` or `.rpm` for x64 and arm64 |

Enter your JumpServer site address and sign in. The desktop app also provides local shells, external terminal and database client launch, offline recording playback, and MP4 conversion. The FFmpeg plugin for H.264 encoding can be downloaded in Settings.

Browsers can open the client through `jms2://` links. Desktop OAuth uses `jms2://auth/callback`, which must be allowed by the server's OAuth application. The legacy client's `jms://` scheme remains separate.

## Running locally

Requires Node.js 24 and pnpm 11.4.0. The desktop app also requires Go 1.25 or later and native build tools for your platform.

```bash
git clone https://github.com/jumpserver/luna.git
cd luna
pnpm install
pnpm web:dev
```

Open `http://localhost:3000/luna/`. Start backend services separately and configure development proxy addresses in `.env.development` as needed.

To start the desktop app:

```bash
pnpm electron:dev
```

## Links

Report problems in [Issues](https://github.com/jumpserver/luna/issues). For usage and deployment, see the [JumpServer documentation](https://docs.jumpserver.org/).

## License

[MIT](LICENSE)
