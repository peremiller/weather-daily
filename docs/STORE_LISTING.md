# Play Store listing — ready-to-paste content

Copy these into Play Console → your app → **Store listing**. Character limits are
Google's; the text below fits them.

---

## App name (max 30 chars)
```
My Daily Weather
```

## Short description (max 80 chars)
```
Live local weather & a 12-day forecast, delivered to your chat every morning.
```

## Full description (max 4000 chars)
```
My Daily Weather gives you a clean, fast look at the weather wherever you are — and
can message your daily forecast straight to your favorite chat app.

CURRENT CONDITIONS AT A GLANCE
• Real-time temperature, "feels like", humidity, and wind
• Today's high and low, plus rain probability
• Sunrise and sunset times
• A colorful background that changes with the weather

12-DAY FORECAST
• See nearly two weeks ahead at a glance
• Daily highs, lows, conditions, and rain chance
• Highlights the 3 driest days, ranked, so you can plan around the rain

ANYWHERE IN THE WORLD
• Search any city instantly
• Or tap "Use my location" for an automatic, on-device lookup
• Your last location is remembered for next time

DAILY WEATHER IN YOUR CHAT (optional)
• Pair My Daily Weather with our companion bot to get your morning forecast
  delivered to Telegram automatically — no need to open the app

PRIVACY FIRST
• No account required
• No ads, no trackers
• Your location is used only to fetch the forecast and never sold or shared

Weather data is provided by Open-Meteo.
```

## Release notes (max 500 chars) — for v1.0.0
```
First release! 🌦️
• Current conditions + 7-day forecast
• Search any city or use your location
• Weather-driven design
```

---

## Graphic assets to prepare

| Asset | Spec | Notes |
|-------|------|-------|
| App icon | 512×512 PNG, 32-bit | See "Custom app icon" below — don't ship the default Flutter icon. |
| Feature graphic | 1024×500 PNG/JPG | Banner shown at top of listing. |
| Phone screenshots | 2–8 images, 16:9 or 9:16, min 320px | Capture the home screen + forecast + search. Use a real device or emulator. |
| (Optional) 7" / 10" tablet shots | — | Only if you market to tablets. |

**Easy screenshots:** run the app, then `flutter screenshot` (or your device's
screenshot button). Frame them nicely at https://screenshots.pro or similar.

---

## Custom app icon (do before submitting)

The project still uses Flutter's default icon. To set your own:

1. Make a 1024×1024 PNG icon (a sun/cloud works great), save as
   `app/assets/icon/icon.png`.
2. Add to `app/pubspec.yaml`:
   ```yaml
   dev_dependencies:
     flutter_launcher_icons: ^0.14.1

   flutter_launcher_icons:
     android: true
     ios: true
     image_path: "assets/icon/icon.png"
     adaptive_icon_background: "#2980B9"
     adaptive_icon_foreground: "assets/icon/icon.png"
   ```
3. Run:
   ```bash
   cd app
   flutter pub get
   dart run flutter_launcher_icons
   flutter build appbundle --release   # rebuild with the new icon
   ```

> Ask me and I can generate a weather icon PNG for you to drop in.

---

## Other Play Console sections (quick answers)

- **App category:** Weather
- **Content rating:** complete the questionnaire → rates **Everyone**
- **Target audience:** 13+ (or your choice; avoids extra child-privacy rules)
- **Privacy policy URL:** host `docs/PRIVACY_POLICY.md` publicly (GitHub Pages
  works) and paste the URL. Remember to fill in your contact email there.
- **Data safety form:** declare **Location (approximate & precise)**, used for
  **App functionality**, **not shared**, **not collected/stored on a server**,
  collection is **optional** (only when the user taps "Use my location").
- **Ads:** No
- **Government app:** No

---

## Submission order (recap from PLAY_STORE.md)

1. Create app → fill the sections above.
2. Upload `app/build/app/outputs/bundle/release/app-release.aab`.
3. Run an **Internal testing** release first; install via the opt-in link; verify.
4. Promote to **Production** → submit for review.
```
