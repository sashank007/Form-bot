# Contributing to Form Bot

Thank you for considering contributing to Form Bot! 🎉

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/form-bot.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Building

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run type-check
```

### Testing Changes

1. Build the extension: `npm run build`
2. Load the `dist` folder as an unpacked extension in your browser
3. Make changes to the code
4. Rebuild and reload the extension
5. Test on various websites with forms

### Code Style

- Use TypeScript for all new code
- Follow the existing code style (2 spaces, semicolons)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and small

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add multi-profile support
fix: resolve field detection on dynamic forms
docs: update README with new features
style: format code with prettier
refactor: simplify field matching logic
test: add tests for encryption utils
```

## What to Contribute

### Good First Issues

- Improve field type detection for specific websites
- Add new field type patterns
- Enhance UI/UX elements
- Fix typos or improve documentation
- Add tests

### Feature Ideas

- Multi-profile support
- Form templates
- Keyboard shortcuts
- Custom field mapping rules
- Browser sync
- Analytics dashboard
- Additional languages/locales

### Bug Fixes

- Check existing issues first
- Provide steps to reproduce
- Include browser version and OS
- Test your fix on multiple browsers if possible

## Pull Request Process

1. Update documentation if needed (README, code comments)
2. Make sure your code builds without errors
3. Test thoroughly in Chrome and Firefox (at minimum)
4. Keep PRs focused on a single feature/fix
5. Describe your changes clearly in the PR description
6. Reference any related issues

## Code Structure

```
src/
├── background/     # Background service worker
├── content/        # Content scripts (injected into pages)
├── popup/          # Extension popup UI
├── options/        # Settings/options page
├── utils/          # Shared utilities
├── types/          # TypeScript type definitions
└── styles/         # Global styles
```

## Key Files

- `manifest.json` - Extension manifest (permissions, scripts)
- `webpack.config.js` - Build configuration
- `src/types/index.ts` - All TypeScript type definitions
- `src/utils/storage.ts` - Data storage and encryption
- `src/content/fieldMatcher.ts` - Field matching algorithm
- `src/utils/fieldClassifier.ts` - Field type detection

## Privacy Guidelines

Form Bot is privacy-first. When contributing:

- ❌ Never send user data to external servers (except OpenAI when explicitly enabled)
- ✅ Keep all data processing local
- ✅ Use encryption for stored data
- ✅ Make telemetry/analytics opt-in only
- ✅ Document any external API calls clearly

## Questions?

- Open an issue for discussion
- Reach out to maintainers
- Check existing issues and PRs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for making Form Bot better! 🚀

