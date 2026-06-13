import 'package:flutter_test/flutter_test.dart';
import 'package:weather_daily/models/weather.dart';

// Builds an hourly map: hourly times from a base date, with the given
// precipitation values (mm) per hour.
Map<String, dynamic> hourly(String baseDate, List<double> precip) {
  final times = <String>[];
  for (var i = 0; i < precip.length; i++) {
    times.add('${baseDate}T${i.toString().padLeft(2, '0')}:00');
  }
  return {'time': times, 'precipitation': precip};
}

void main() {
  const now = '2026-06-13T15:30';

  test('dry now → predicts when rain starts (today)', () {
    final h = hourly('2026-06-13', [
      ...List.filled(18, 0.0), // 00:00–17:00 dry
      0.6, // 18:00 rain
      ...List.filled(5, 0.6),
    ]);
    final r = RainOutlook.fromHourly(h, now)!;
    expect(r.rainingNow, false);
    expect(r.type, 'start');
    expect(r.label(now), 'Rain expected around 6 PM');
  });

  test('raining now → predicts when rain stops', () {
    final h = hourly('2026-06-13', [
      ...List.filled(18, 0.5), // wet through 17:00
      0.0, // 18:00 dry
      ...List.filled(5, 0.0),
    ]);
    final r = RainOutlook.fromHourly(h, now)!;
    expect(r.rainingNow, true);
    expect(r.type, 'stop');
    expect(r.label(now), 'Rain should ease around 6 PM');
  });

  test('no rain in the window → none', () {
    final r = RainOutlook.fromHourly(hourly('2026-06-13', List.filled(24, 0.0)), now)!;
    expect(r.type, 'none');
    expect(r.label(now), 'No rain expected in the next 2 days');
  });

  test('rain tomorrow is labelled "tomorrow"', () {
    // 24h dry today, then rain at 02:00 the next day.
    final times = <String>[];
    final precip = <double>[];
    for (var i = 0; i < 24; i++) {
      times.add('2026-06-13T${i.toString().padLeft(2, '0')}:00');
      precip.add(0.0);
    }
    for (var i = 0; i < 6; i++) {
      times.add('2026-06-14T${i.toString().padLeft(2, '0')}:00');
      precip.add(i == 2 ? 0.8 : 0.0);
    }
    final r = RainOutlook.fromHourly({'time': times, 'precipitation': precip}, now)!;
    expect(r.type, 'start');
    expect(r.label(now), 'Rain expected tomorrow around 2 AM');
  });
}
