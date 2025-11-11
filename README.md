# Form Bot - Intelligent Form Auto-Fill Extension

A sleek, privacy-first browser extension that automatically fills web forms using AI-powered field matching.

## Features

### Core Functionality
- ✨ **Smart Auto-Detection**: Automatically detects forms on any webpage
- 🎯 **Intelligent Field Matching**: Uses advanced algorithms to match fields with 95%+ accuracy
- ⚡ **Instant Fill**: Fill entire forms with one click
- 🔄 **Undo Support**: Quick rollback if something goes wrong
- 🎨 **Visual Feedback**: Confidence indicators and field highlighting

### Privacy & Security
- 🔒 **Encrypted Storage**: All data encrypted using AES-256
- 💾 **Local-Only**: Data never leaves your device
- 🚫 **No Tracking**: Zero analytics or telemetry
- 🔑 **Optional AI**: OpenAI integration only sends field names, never values

### User Experience
- 🌓 **Dark Mode**: Beautiful dark theme support
- 📱 **Multi-Profile**: Support for work, personal, and custom profiles (coming soon)
- 📤 **Import/Export**: Backup and restore your data
- 🎯 **Confidence Scoring**: Visual indicators for field match confidence

## Installation

### Development Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Build the Extension**
```bash
npm run build
```

3. **Load in Browser**

**Chrome/Edge:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist` folder

### Create Icons

The extension needs icons in 16x16, 48x48, and 128x128 sizes. You can:

**Option 1: Use the SVG (Recommended)**
- Open `public/icons/icon.svg` in a vector graphics editor (Inkscape, Figma, etc.)
- Export as PNG at 16px, 48px, and 128px
- Save as `icon16.png`, `icon48.png`, `icon128.png` in `public/icons/`

**Option 2: Online Converter**
1. Upload `public/icons/icon.svg` to [CloudConvert](https://cloudconvert.com/svg-to-png)
2. Convert to PNG at 16x16, 48x48, and 128x128
3. Download and rename files as above

**Option 3: Command Line (ImageMagick)**
```bash
cd public/icons
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

## Usage

### Quick Start

1. **Add Your Data**
   - Click the Form Bot icon
   - Click "Manage Data"
   - Create a new profile with your information

2. **Fill a Form**
   - Navigate to any webpage with a form
   - Click the Form Bot icon
   - Click "Fill X Fields"
   - Done! 🎉

### Advanced Features

**Confidence Levels**
- 🟢 Green (85-100%): High confidence, will auto-fill
- 🟡 Yellow (70-84%): Medium confidence, will fill if enabled
- ⚪ Gray (<70%): Low confidence, won't auto-fill

**Settings**
- Adjust minimum confidence threshold (50-100%)
- Enable/disable field highlighting
- Toggle AI enhancement (requires OpenAI API key)
- Dark mode preference

**AI Enhancement** (Optional)
- Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Enable in Settings > Privacy & Settings
- Only field names are sent to OpenAI, never your personal data
- Improves matching for complex or unusual field names

## Architecture

```
form-bot/
├── src/
│   ├── background/        # Service worker
│   ├── content/           # Page injection scripts
│   ├── popup/             # Extension popup UI
│   ├── options/           # Settings page
│   ├── utils/             # Shared utilities
│   ├── types/             # TypeScript definitions
│   └── styles/            # Tailwind CSS
├── public/                # Static assets
└── dist/                  # Built extension (generated)
```

## Development

**Watch Mode** (auto-rebuild on changes)
```bash
npm run dev
```

**Type Checking**
```bash
npm run type-check
```

**Build for Production**
```bash
npm run build
```

## How It Works

### Field Matching Algorithm

Form Bot uses a multi-stage matching process:

1. **Exact Match**: Field name/ID exactly matches saved data key
2. **Normalized Match**: Removes special characters and matches
3. **Label Analysis**: Checks label text associated with field
4. **Type Detection**: Uses input type hints (email, tel, etc.)
5. **Pattern Recognition**: Regex patterns for phone, zip, etc.
6. **Semantic Match**: "email" matches "e-mail", "contact-email"
7. **AI Enhancement**: OpenAI for ambiguous cases (optional)

**Confidence Scoring:**
- Exact matches: 95-100%
- Strong semantic matches: 85-94%
- Pattern-based: 70-84%
- Fuzzy/AI matches: 50-69%

### Security

- **Encryption**: Web Crypto API with PBKDF2 key derivation
- **Storage**: Chrome storage API (local only, not synced)
- **Device Key**: Unique key per installation
- **No External Calls**: Except optional OpenAI (configurable)

## Roadmap

### Phase 2 Features
- [ ] Multiple profile support (work/personal)
- [ ] Form templates for repeated forms
- [ ] Auto-submit option
- [ ] Custom field mapping rules
- [ ] Analytics dashboard (time saved, forms filled)
- [ ] Browser sync (encrypted cloud sync)
- [ ] Smart learning from corrections
- [ ] Keyboard shortcuts

## Privacy Policy

Form Bot is built with privacy as the #1 priority:

- ✅ All data stored locally on your device
- ✅ Data encrypted at rest using AES-256
- ✅ No analytics, tracking, or telemetry
- ✅ No external server communication (except optional OpenAI)
- ✅ Open source - verify for yourself
- ✅ Export/delete your data anytime

**When OpenAI is enabled:**
- Only field metadata is sent (name, type, placeholder)
- Your actual form data NEVER leaves your device
- API calls are optional and user-controlled
- You provide your own API key (we don't see it)

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

Issues? Questions? Feature requests?
- Open an issue on GitHub
- Check existing issues first
- Provide browser version and steps to reproduce

---

**Made with ❤️ for privacy and productivity**

