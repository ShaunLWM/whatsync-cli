# whasync-cli

[![npm version](https://img.shields.io/npm/v/whasync-cli.svg)](https://www.npmjs.com/package/whasync-cli)
[![license](https://img.shields.io/github/license/ShaunLWM/whatsync-cli.svg)](https://github.com/ShaunLWM/whatsync-cli/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/whasync-cli.svg)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/ShaunLWM/whatsync-cli.svg)](https://github.com/ShaunLWM/whatsync-cli/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/ShaunLWM/whatsync-cli.svg)](https://github.com/ShaunLWM/whatsync-cli/issues)

Sync WhatsApp profile photos to Google Contacts from the terminal.

Inspired by [whatsapp-contact-sync](https://github.com/guyzyl/whatsapp-contact-sync) -- rebuilt as a simple CLI tool. No web server, no browser UI. Bring your own Google OAuth credentials.

## Prerequisites

- Node.js >= 18
- A Google Cloud project with People API enabled

## Install

```bash
npm install -g whasync-cli
```

Or run directly:

```bash
npx whasync-cli
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select an existing one)
3. Go to **APIs & Services > Library**, search for **People API** and enable it
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth client ID**
6. Set application type to **Desktop app**
7. Copy the **Client ID** and **Client Secret**

## Usage

```bash
# First run -- provide your Google credentials
whasync --client-id <YOUR_CLIENT_ID> --client-secret <YOUR_CLIENT_SECRET>

# Subsequent runs -- credentials are saved
whasync
```

The CLI walks you through:

1. **Google Auth** -- Authenticates with saved tokens or opens the browser
2. **WhatsApp Auth** -- Scan the QR code with WhatsApp (Linked Devices > Link a Device)
3. **Match** -- Finds contacts that exist in both Google and WhatsApp
4. **Sync** -- Downloads WhatsApp photos and uploads them to Google Contacts

### Options

```
Usage: whasync [options]

Options:
  -V, --version                  output the version number
  --client-id <id>               Google OAuth Client ID
  --client-secret <secret>       Google OAuth Client Secret
  --config [path]                Show config info, or use custom config directory
  --reset                        Clear all saved config, tokens, and session data
  -v, --verbose                  Show debug logs
  -h, --help                     display help for command
```

### Examples

```bash
# Show where config is stored and current state
whasync --config

# Use a custom config directory
whasync --config /path/to/config

# Clear everything and start fresh
whasync --reset

# Debug mode
whasync --verbose
```

## Config

All data is stored in `~/.config/whasync-cli/`:

| File | Purpose |
|------|---------|
| `config.json` | Google OAuth Client ID and Secret |
| `google-tokens.json` | OAuth access and refresh tokens |
| `wa-session/` | WhatsApp Web session data |

Sessions are persisted so you don't need to re-authenticate on every run.

## How It Works

- Connects to WhatsApp Web via [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) using Puppeteer
- Fetches Google Contacts via the [People API](https://developers.google.com/people)
- Matches contacts by phone number with E.164 normalization and country-specific variant handling (Brazil, Mexico, Argentina)
- Downloads WhatsApp profile photos and uploads them to Google Contacts
- Rate limited to ~60 requests/min (Google API limit)

## License

MIT
