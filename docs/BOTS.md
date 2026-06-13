# Setting up the messaging bots

Fill in the values you get below into `backend/.env`. You can enable just one
channel or all three — any channel with missing credentials is skipped.

---

## 1. Telegram ✅ (easiest — do this first)

1. In Telegram, message **@BotFather**.
2. Send `/newbot`, choose a name and username. BotFather replies with a **token**
   like `123456:ABC-DEF...`.
3. Put it in `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   ```
4. **Find your chat id:** message your new bot anything, then open in a browser:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   Look for `"chat":{"id":12345678}`. That number is your chat id.
   ```
   TELEGRAM_CHAT_IDS=12345678
   ```
   (Comma-separate multiple ids to message several people.)
5. Test: `npm run send-now`. You should receive the forecast instantly. 🎉

> The bot also responds to `/now` for on-demand weather once the server is running
> and its webhook is set (optional — see "Webhooks" below).

---

## 2. Viber ✅

1. Go to **https://partners.viber.com** and create a **Bot Account**.
2. Copy the **authentication token** into `.env`:
   ```
   VIBER_BOT_TOKEN=your-viber-token
   VIBER_SENDER_NAME=Weather Bot
   ```
3. Viber **requires a public HTTPS webhook**. Deploy the backend (or use `ngrok`
   in dev), set `PUBLIC_URL` in `.env`, then register the webhook once:
   ```bash
   curl -X POST https://chatapi.viber.com/pa/set_webhook \
     -H "X-Viber-Auth-Token: $VIBER_BOT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://YOUR_PUBLIC_URL/webhook/viber","event_types":["subscribed","conversation_started","message","unsubscribed"]}'
   ```
4. Open your bot in Viber and **send it a message** — that subscribes you. The
   server stores your id automatically, and you'll get the daily forecast.

---

## 3. Messenger ⚠️ (read this — there's a policy wall)

Meta **does not allow** sending unsolicited scheduled messages on Messenger.
A regular message only goes through within **24 hours** of the user's last reply.
To push a true *daily* weather message you must use Meta's **Recurring
Notifications** opt-in (the user taps "Get daily updates" in chat) or an approved
**message tag** — both require your Meta app to pass **App Review**.

This repo sends with the `CONFIRMED_EVENT_UPDATE` tag as a best effort and will
surface Meta's exact error if a send is rejected. To set it up:

1. Create a **Facebook Page** and a **Meta app** at
   https://developers.facebook.com → add the **Messenger** product.
2. Generate a **Page Access Token**:
   ```
   MESSENGER_PAGE_TOKEN=EAAG...
   MESSENGER_VERIFY_TOKEN=weather_verify
   ```
3. Set the **webhook** in the Messenger product settings:
   - Callback URL: `https://YOUR_PUBLIC_URL/webhook/messenger`
   - Verify token: the same `MESSENGER_VERIFY_TOKEN`
   - Subscribe to the `messages` and `messaging_postbacks` fields.
4. Anyone who messages your Page is captured as a recipient (PSID). You can also
   hard-code PSIDs in `MESSENGER_RECIPIENT_IDS`.

> **Recommendation:** if reliable daily pushes matter most to you, lean on
> **Telegram** (and Viber). Treat Messenger as best-effort, or implement the
> Recurring Notifications flow once you're ready for Meta's App Review.

---

## Webhooks (optional, enables on-demand `/now` replies)

- **Telegram:** `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_PUBLIC_URL/webhook/telegram`
- **Viber / Messenger:** registered as shown above.

In local development, expose your server with [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# use the https URL it prints as PUBLIC_URL
```
