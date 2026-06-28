# Play Console — Data safety form (fill-in answers)

Answers below match how **My Daily Weather** actually behaves. Play Console asks these as
a guided questionnaire (Policy → App content → Data safety). Copy these.

## Behavior this is based on
- The app accesses **location only when the user taps "Use my location"** (optional).
- Coordinates are sent to **Open-Meteo** *only to fetch the forecast* (ephemeral; not stored on any server we run).
- The **selected city is stored on-device** (SharedPreferences) — never leaves the phone.
- **No account, no analytics, no ads, no advertising IDs, no third-party trackers.**
- All network calls are **HTTPS**.

> Note: the separate Telegram **bot** stores users' shared locations and the operator sees a
> daily report — that's disclosed in the privacy policy, but the **app submission** is about the
> app's own behavior. The app does not share location with the developer or sell it.

## Section-by-section answers

**1. Does your app collect or share any of the required user data types?**
→ **Yes**

**2. Data types — select only:**
- **Location → Approximate location** → collected: **Yes**
- **Location → Precise location** → collected: **Yes**
- (Everything else — Personal info, Financial, Messages, Photos, Contacts, App activity,
  Web history, Device IDs, etc.) → **No / not selected**

**3. For each Location type, answer:**
| Question | Answer |
|----------|--------|
| Is this data **collected**? | Yes |
| Is this data **shared** (with third parties)? | **No** |
| Is collection **required or optional**? | **Optional** (user taps "Use my location") |
| **Purpose** | **App functionality** (only) |
| Is the data **processed ephemerally**? | **Yes** (sent to the weather service to return the forecast, not retained) |

**4. Data handling / security:**
- **Is all of the user data encrypted in transit?** → **Yes** (HTTPS)
- **Do you provide a way for users to request that their data be deleted?** → **No**
  (the app stores nothing on a server; the city stays on-device and the user can clear it
  by uninstalling). *Optionally* select "Yes" and point to your contact email if you want to
  cover the bot — but for the app alone, "No" with the on-device explanation is accurate.

**5. Other declarations (elsewhere in App content):**
- **Ads:** No (app contains no ads).
- **Target audience / Content rating:** complete the questionnaire → rates **Everyone**.
- **Government app:** No.

## One-line summary your listing will show
> "This app collects Location. Location is used for app functionality, is optional, is not
> shared, and is processed ephemerally. Data is encrypted in transit."

Keep this consistent with the hosted privacy policy at
https://peremiller.github.io/weather-daily/ (which also discloses the bot's location use).
