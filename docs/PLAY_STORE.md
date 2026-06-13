# Publishing to the Google Play Store

This walks you from the code in `app/` to a live listing. Budget ~1–2 hours for
first-time setup, plus Google's review time (a few hours to a few days).

> ⚠️ Steps that need **you** (can't be automated): paying the developer fee,
> identity verification, and creating the upload key on your own machine.

---

## 0. Prerequisites

- A **Google Play Developer account** — one-time **$25** fee, plus identity &
  (for individuals) address verification: https://play.google.com/console/signup
- The app builds locally:
  ```bash
  cd app
  flutter build appbundle --release   # produces the .aab Google wants
  ```

---

## 1. Set the app identity

- **Package name** (permanent once published): currently `com.weatherdaily.weather_daily`.
  Change it in `app/android/app/build.gradle.kts` (`applicationId`) **before**
  your first upload if you want something else.
- **App name:** set in `app/android/app/src/main/AndroidManifest.xml` (`android:label`).
  Currently "Weather Daily".
- **Version:** bump `version:` in `app/pubspec.yaml` for every release
  (e.g. `1.0.0+1` → `1.0.1+2`). The `+N` build number must increase each upload.

---

## 2. Create an upload keystore (one time, keep it SAFE)

```bash
keytool -genkey -v -keystore ~/weather-daily-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```
Then create `app/android/key.properties` (do **not** commit it):
```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=upload
storeFile=/Users/YOU/weather-daily-upload.jks
```
And wire it into `app/android/app/build.gradle.kts` signing config (see the
commented template Flutter generates, or the Flutter docs:
https://docs.flutter.dev/deployment/android#signing-the-app).

> 🔑 **If you lose this keystore you can't update the app.** Back it up.

---

## 3. Build the release bundle

```bash
cd app
flutter build appbundle --release
# output: build/app/outputs/bundle/release/app-release.aab
```

---

## 4. Create the listing in Play Console

In https://play.google.com/console → **Create app**, then complete:

- **Store listing:** app name, short (80 char) + full description, app icon
  (512×512 PNG), feature graphic (1024×500), and **at least 2 phone screenshots**.
- **Privacy policy URL** — required because the app requests **location**. Host a
  simple page (GitHub Pages works). A template is in `docs/PRIVACY_POLICY.md`.
- **Data safety form:** declare that you collect approximate/precise location and
  use it only on-device to fetch weather (not shared, not sold).
- **Content rating** questionnaire (this app rates "Everyone").
- **Target audience**, **App category** = Weather.

---

## 5. Release

1. **Testing → Internal testing**: upload `app-release.aab`, add your own email
   as a tester, and install via the opt-in link. Verify everything works.
2. When happy: **Production → Create release**, upload the bundle, fill release
   notes, and **Submit for review**.
3. Google reviews, then your app goes live. 🎉

---

## Common gotchas

- **"You uploaded a debuggable APK/AAB"** → make sure you used `--release`.
- **"Version code already used"** → bump the `+N` build number in `pubspec.yaml`.
- **Location permission rejected** → ensure the privacy policy explains it and the
  Data Safety form matches what the app actually does.
- **Min SDK** is set by Flutter (currently 21+); that's fine for Play.

---

## Bonus: where to run the backend

The daily-message backend must run **somewhere always-on** (your phone/laptop
won't do). Cheap/free options:

- **Railway** / **Render** / **Fly.io** — push the `backend/` folder, set the env
  vars from `.env`, expose port `3000`. Use the public URL as `PUBLIC_URL`.
- **A small VPS** (e.g. a $5 droplet) with `pm2 start src/index.js`.

All three give you the HTTPS URL that Viber and Messenger webhooks require.
