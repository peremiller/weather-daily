# Play Store assets

Generated graphics for the Google Play listing. Regenerate the icon/banner with
`python3 store-assets/make_store_assets.py` (needs Pillow).

| File | Size | Where it goes in Play Console |
|------|------|-------------------------------|
| `play-icon-512.png` | 512×512 | Store listing → **App icon** |
| `feature-graphic-1024x500.png` | 1024×500 | Store listing → **Feature graphic** |
| `screenshots/screenshot-1-conditions.png` | 1040×1850 | Store listing → **Phone screenshots** |
| `screenshots/screenshot-2-forecast.png` | 1040×1810 | Store listing → **Phone screenshots** |

All meet Play's rules (PNG, 320–3840px per side, aspect ratio within 2:1).

The screenshots are real captures of the app (rendered via Flutter web at phone
size). For even crisper marketing shots you can also capture on a physical device
or emulator, but these are listing-ready as-is.

## Privacy policy

`docs/index.html` is a hostable version of the privacy policy. Enable GitHub
Pages (Settings → Pages → Deploy from branch → `main` / `/docs`) and the URL
becomes **https://peremiller.github.io/weather-daily/** — paste that into the
Play Console "Privacy policy" field.
