# Quick Start Guide - Form Bot

Get your Form Bot extension up and running in 5 minutes! 🚀

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Generate Icons

**Option A: Use the Icon Generator (Easiest)**
1. Open `public/icons/generate-icons.html` in your browser
2. Click "Download All Icons"
3. Move the downloaded PNG files to `public/icons/`

**Option B: Use ImageMagick**
```bash
cd public/icons
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

**Option C: Use an Online Converter**
1. Go to [CloudConvert](https://cloudconvert.com/svg-to-png)
2. Upload `public/icons/icon.svg`
3. Convert to 16x16, 48x48, and 128x128
4. Save as `icon16.png`, `icon48.png`, `icon128.png`

## Step 3: Build the Extension

```bash
npm run build
```

This creates a `dist` folder with your built extension.

## Step 4: Load in Browser

### Chrome/Edge/Brave

1. Open your browser and navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`

2. Enable **Developer mode** (toggle in top-right corner)

3. Click **Load unpacked**

4. Select the `dist` folder from your project

5. You should see the Form Bot icon appear! 🎉

### Firefox

1. Open Firefox and navigate to: `about:debugging#/runtime/this-firefox`

2. Click **Load Temporary Add-on**

3. Navigate to the `dist` folder and select `manifest.json`

4. The extension is now loaded (note: temporary in Firefox)

## Step 5: Add Your Data

1. Click the Form Bot extension icon in your browser toolbar

2. Click **"Add Profile"** or **"Manage Data"**

3. Fill in your information (name, email, phone, address, etc.)

4. Click **Save**

## Step 6: Test It Out!

1. Visit any website with a form (e.g., contact form, registration page)

2. Click the Form Bot icon

3. You'll see detected fields with confidence scores

4. Click **"Fill X Fields"**

5. Watch the magic happen! ✨

## Bonus: Enable AI Enhancement (Optional)

For even better field matching on complex forms:

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)

2. Open Form Bot settings (click the gear icon)

3. Go to **Privacy & Settings** tab

4. Enable **"Enable OpenAI"**

5. Paste your API key

6. Save

Now Form Bot will use AI to match tricky fields!

## Development Tips

**Watch mode** (auto-rebuild on file changes):
```bash
npm run dev
```

**Type checking:**
```bash
npm run type-check
```

**After making changes:**
1. Rebuild: `npm run build`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Form Bot extension

## Troubleshooting

### Icons not showing?
- Make sure you generated all three icon sizes (16, 48, 128)
- Check they're in `public/icons/`
- Rebuild: `npm run build`

### Extension not loading?
- Check console for errors
- Make sure all dependencies installed: `npm install`
- Try cleaning: delete `dist` folder, then `npm run build`

### Fields not being detected?
- Make sure you have data saved in a profile
- Check the minimum confidence threshold in settings (lower it if needed)
- Some fields might be too obscure - try enabling AI enhancement

### Changes not appearing?
- Reload the extension at `chrome://extensions/`
- Make sure you ran `npm run build` after changes
- Hard refresh the webpage (Ctrl/Cmd + Shift + R)

## What's Next?

- Customize your settings (confidence threshold, highlighting, dark mode)
- Create multiple profiles for different uses
- Export your data as backup
- Explore the codebase and customize it to your needs!

## Need Help?

- Check the main [README.md](README.md) for detailed documentation
- Review the [project structure](#architecture) to understand the code
- Open an issue on GitHub if you find bugs

Happy auto-filling! 🎉

