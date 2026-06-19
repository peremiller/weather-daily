import nodemailer from 'nodemailer';
import { config } from './config.js';
import { getAllUserLocations } from './store.js';
import { getForecast, describeCode } from './weather.js';

/**
 * Builds and EMAILS a daily statistics report to the app owner: every user who
 * has shared a location, where they are, and the current weather there.
 *
 * The report is intentionally NOT posted to Telegram — it goes to OWNER_EMAIL
 * via SMTP. NOTE: this shares users' locations with the owner; disclose it in
 * your privacy policy.
 */
async function buildReport() {
  const locations = await getAllUserLocations();
  const entries = Object.entries(locations); // [chatId, { name, latitude, longitude }]
  const dateLabel = new Date().toISOString().slice(0, 10);

  const lines = [
    `Daily User Report — ${dateLabel}`,
    `Users with a saved location: ${entries.length}`,
    '',
  ];

  if (entries.length === 0) {
    lines.push('No users have shared a location yet.');
  } else {
    let temps = 0;
    let counted = 0;
    for (const [, loc] of entries) {
      try {
        const w = await getForecast(loc, 'auto');
        const c = describeCode(w.current.code);
        const temp = Math.round(w.current.temp);
        temps += temp;
        counted += 1;
        lines.push(`• ${loc.name}: ${c.emoji} ${c.label}, ${temp}°`);
      } catch {
        lines.push(`• ${loc.name}: weather unavailable`);
      }
    }
    if (counted > 0) {
      lines.push('', `Average temperature across users: ${Math.round(temps / counted)}°`);
    }
  }

  return {
    subject: `Weather — Daily User Report (${dateLabel}) · ${entries.length} users`,
    text: lines.join('\n'),
    users: entries.length,
  };
}

export async function sendOwnerReport() {
  const { email } = config;
  if (!email.configured) {
    console.warn(
      '[owner report] SMTP not configured (set SMTP_USER/SMTP_PASS) — skipping email.'
    );
    return { skipped: true };
  }

  const report = await buildReport();
  const transporter = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: email.user, pass: email.pass },
  });

  try {
    await transporter.sendMail({
      from: email.from || email.user,
      to: email.to,
      subject: report.subject,
      text: report.text,
    });
    console.log(`[owner report] Emailed to ${email.to} (${report.users} users).`);
    return { ok: true, users: report.users };
  } catch (err) {
    console.error('[owner report] Email failed:', err.message);
    return { ok: false, error: err.message };
  }
}
