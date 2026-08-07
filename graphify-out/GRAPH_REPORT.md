# Graph Report - /Users/millertperez/weather-daily  (2026-07-26)

## Corpus Check
- 105 files · ~56,244 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 78 nodes · 36 edges · 55 communities (4 shown, 51 thin omitted)
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Play Store Publishing Guide —  / Hosted Privacy Policy Page (Gi
- Daily Broadcast Flow — node-cr / Bot Setup Guide — Telegram (Bo
- weather_daily pubspec — deps:  / weather_daily Flutter App READ
- Always-On Starter Plan Require / Render Blueprint (render.yaml)
- Messenger Channel (policy-rest / Messenger Policy Wall — Meta 2
- sendDaily
- sendText
- deleteWebhook
- registerCommands
- safeCard
- safeDailyCard
- safeTyphoonCard
- safeTyphoonCards
- sendDaily
- sendPhoto
- sendText
- startPolling
- sendDaily
- sendText
- setWebhook
- broadcastDaily
- enabledChannels
- buildPostcardHTML
- renderPostcardPNG
- handleTelegramMessage
- sendOwnerReport
- getTropicalCyclone
- getPagasaTenDay
- pagasaTenDayPanel
- startScheduler
- addSubscriber
- getAllUserLocations
- getSubscribers
- getUserLocation
- removeSubscriber
- setUserLocation
- renderTyphoonCard
- currentState
- estimateParEntry
- getParTiming
- jmaActiveStorms
- positionAt
- getTyphoonWatch
- typhoonWatchLine
- typhoonWatchLines
- dailyEmoji
- describeCode
- formatMessage
- geocode
- getDailyWeather
- getForecast
- isPhilippines
- resolveLocation
- reverseGeocode
- renderWeatherCard

## God Nodes (most connected - your core abstractions)
1. `Daily Broadcast Flow — node-cron 07:00 → broadcast() → fan-out to channels` - 7 edges
2. `weather_daily pubspec — deps: http, geolocator, shared_preferences, url_launcher, flutter_launcher_icons` - 6 edges
3. `Play Store Publishing Guide — keystore, appbundle, listing, review` - 6 edges
4. `Weather Daily — Flutter App + Node.js Daily-Message Backend` - 4 edges
5. `Open-Meteo Weather API (free, no API key)` - 4 edges
6. `Bot Setup Guide — Telegram (BotFather), Viber (partners.viber.com), Messenger (Meta app)` - 4 edges
7. `Telegram Bot Channel (fully working, recommended first)` - 3 edges
8. `Weather Daily Backend README — Express Endpoints + Module Architecture` - 3 edges
9. `Play Store Final Listing Copy — My Daily Weather (rain timeslots, 12-day forecast, PAGASA)` - 3 edges
10. `Privacy Policy (Markdown) — app vs Telegram-bot location handling` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Play Store Assets — icon 512, feature graphic, screenshots via make_store_assets.py` --conceptually_related_to--> `Play Store Publishing Guide — keystore, appbundle, listing, review`  [INFERRED]
  store-assets/README.md → docs/PLAY_STORE.md
- `Weather Daily — Flutter App + Node.js Daily-Message Backend` --references--> `Play Store Publishing Guide — keystore, appbundle, listing, review`  [EXTRACTED]
  README.md → docs/PLAY_STORE.md
- `Channel Failure Isolation — one bad token won't stop the others` --rationale_for--> `Daily Broadcast Flow — node-cron 07:00 → broadcast() → fan-out to channels`  [EXTRACTED]
  backend/README.md → README.md
- `weather_daily pubspec — deps: http, geolocator, shared_preferences, url_launcher, flutter_launcher_icons` --references--> `Open-Meteo Weather API (free, no API key)`  [EXTRACTED]
  app/pubspec.yaml → README.md
- `Privacy Policy (Markdown) — app vs Telegram-bot location handling` --references--> `Telegram Bot Channel (fully working, recommended first)`  [EXTRACTED]
  docs/PRIVACY_POLICY.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **** — readme_daily_broadcast_flow, readme_open_meteo_service, readme_telegram_channel, readme_viber_channel, readme_messenger_channel [EXTRACTED 1.00]

## Communities (55 total, 51 thin omitted)

### Community 0 - "Play Store Publishing Guide —  / Hosted Privacy Policy Page (Gi"
Cohesion: 0.28
Nodes (9): Closed-Test Recruitment Plan — 12 testers × 14 days for Play production access, Play Data Safety Form Answers — optional ephemeral location, no sharing, HTTPS, Hosted Privacy Policy Page (GitHub Pages, peremiller.github.io/weather-daily), Play Store Final Listing Copy — My Daily Weather (rain timeslots, 12-day forecast, PAGASA), PAGASA Integration — PH forecasts on PAGASA's 10-day model + official cyclone Wind Signals, Play Store Publishing Guide — keystore, appbundle, listing, review, Privacy Policy (Markdown) — app vs Telegram-bot location handling, Play Store Listing Draft + Graphic Asset Specs + Custom Icon Steps (+1 more)

### Community 1 - "Daily Broadcast Flow — node-cr / Bot Setup Guide — Telegram (Bo"
Cohesion: 0.43
Nodes (8): Channel Failure Isolation — one bad token won't stop the others, Weather Daily Backend README — Express Endpoints + Module Architecture, Bot Setup Guide — Telegram (BotFather), Viber (partners.viber.com), Messenger (Meta app), Daily Broadcast Flow — node-cron 07:00 → broadcast() → fan-out to channels, Open-Meteo Weather API (free, no API key), Telegram Bot Channel (fully working, recommended first), Viber Bot Channel (needs public HTTPS webhook), Weather Daily — Flutter App + Node.js Daily-Message Backend

### Community 2 - "weather_daily pubspec — deps:  / weather_daily Flutter App READ"
Cohesion: 0.33
Nodes (6): Dart Analyzer Config — flutter_lints ruleset, iOS Launch Screen Assets README, weather_daily pubspec — deps: http, geolocator, shared_preferences, url_launcher, flutter_launcher_icons, flutter_launcher_icons Adaptive Icon Config (#2980B9 background), weather_daily Flutter App README (default boilerplate), My Daily Weather — Flutter Web Bootstrap Shell

### Community 3 - "Always-On Starter Plan Require / Render Blueprint (render.yaml)"
Cohesion: 1.00
Nodes (3): Always-On Starter Plan Requirement, Render Blueprint (render.yaml) — Node web service, secrets sync:false, Backend Deploy Guide — Railway/Render/Fly/VPS/Docker, sleep-tier gotcha

## Knowledge Gaps
- **57 isolated node(s):** `sendDaily`, `sendText`, `sendDaily`, `sendText`, `safeCard` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Play Store Publishing Guide — keystore, appbundle, listing, review` connect `Play Store Publishing Guide —  / Hosted Privacy Policy Page (Gi` to `Daily Broadcast Flow — node-cr / Bot Setup Guide — Telegram (Bo`, `weather_daily pubspec — deps:  / weather_daily Flutter App READ`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `weather_daily pubspec — deps: http, geolocator, shared_preferences, url_launcher, flutter_launcher_icons` connect `weather_daily pubspec — deps:  / weather_daily Flutter App READ` to `Play Store Publishing Guide —  / Hosted Privacy Policy Page (Gi`, `Daily Broadcast Flow — node-cr / Bot Setup Guide — Telegram (Bo`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `Daily Broadcast Flow — node-cron 07:00 → broadcast() → fan-out to channels` connect `Daily Broadcast Flow — node-cr / Bot Setup Guide — Telegram (Bo` to `Messenger Channel (policy-rest / Messenger Policy Wall — Meta 2`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `weather_daily pubspec — deps: http, geolocator, shared_preferences, url_launcher, flutter_launcher_icons` (e.g. with `weather_daily Flutter App README (default boilerplate)` and `My Daily Weather — Flutter Web Bootstrap Shell`) actually correct?**
  _`weather_daily pubspec — deps: http, geolocator, shared_preferences, url_launcher, flutter_launcher_icons` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Play Store Publishing Guide — keystore, appbundle, listing, review` (e.g. with `Closed-Test Recruitment Plan — 12 testers × 14 days for Play production access` and `Play Store Assets — icon 512, feature graphic, screenshots via make_store_assets.py`) actually correct?**
  _`Play Store Publishing Guide — keystore, appbundle, listing, review` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `sendDaily`, `sendText`, `sendDaily` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._