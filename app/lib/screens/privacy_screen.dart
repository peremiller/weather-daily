import 'package:flutter/material.dart';

/// In-app privacy notice. Mirrors docs/PRIVACY_POLICY.md so users can read how
/// their location is used (and shared, if they use the Telegram bot) without
/// leaving the app. Play Store also requires an accessible privacy policy.
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Privacy'),
        backgroundColor: const Color(0xFF2980B9),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Text('Privacy Policy — My Daily Weather',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          SizedBox(height: 4),
          Text('Last updated: 2026-06-14',
              style: TextStyle(color: Colors.grey, fontSize: 13)),
          SizedBox(height: 20),
          _Section(
            title: 'This app',
            body:
                'Your location is accessed only when you tap "Use my location", '
                'and is used solely to fetch your forecast from Open-Meteo. Your '
                'selected city is saved on your device so the app remembers it. '
                'No account, ads, analytics, or trackers. The app does not store '
                'your location on our servers or share it.',
          ),
          _Section(
            title: 'The Telegram bot',
            body:
                'If you use our Telegram weather bot, the location you share with '
                'it is stored and linked to your Telegram chat so it can give you '
                'local forecasts without asking again. The bot operator receives a '
                'daily statistics report that includes the locations of users who '
                'shared one and the weather in those areas. This data is never '
                'sold or shared with other third parties. Send /changelocation to '
                'update your location, or contact us to request deletion.',
          ),
          _Section(
            title: 'Weather data',
            body:
                'Weather is provided by Open-Meteo (open-meteo.com). Requests '
                'include the coordinates being looked up.',
          ),
          _Section(
            title: 'Contact',
            body: 'Questions about this policy: pjomill@gmail.com',
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String body;
  const _Section({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(fontSize: 14, height: 1.45)),
        ],
      ),
    );
  }
}
