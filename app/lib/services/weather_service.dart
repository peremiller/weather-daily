import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/weather.dart';

/// A geocoded place the user can pick.
class Place {
  final String name;
  final double latitude;
  final double longitude;

  Place({required this.name, required this.latitude, required this.longitude});

  String get displayName => name;
}

/// Talks to the free Open-Meteo APIs (no key required).
class WeatherService {
  static const _geocodeUrl = 'https://geocoding-api.open-meteo.com/v1/search';
  static const _forecastUrl = 'https://api.open-meteo.com/v1/forecast';

  final String temperatureUnit; // 'celsius' | 'fahrenheit'
  final String windUnit; // 'kmh' | 'mph' | 'ms' | 'kn'

  WeatherService({this.temperatureUnit = 'celsius', this.windUnit = 'kmh'});

  String get unitSymbol => temperatureUnit == 'fahrenheit' ? '°F' : '°C';

  /// Search place names -> list of candidates.
  Future<List<Place>> searchPlaces(String query) async {
    if (query.trim().isEmpty) return [];
    final uri = Uri.parse(
        '$_geocodeUrl?name=${Uri.encodeComponent(query)}&count=8&language=en&format=json');
    final res = await http.get(uri);
    if (res.statusCode != 200) {
      throw Exception('Search failed (${res.statusCode})');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final results = (data['results'] as List?) ?? [];
    return results.map((r) {
      final m = r as Map<String, dynamic>;
      final parts = [m['name'], m['admin1'], m['country']]
          .where((e) => e != null && (e as String).isNotEmpty)
          .join(', ');
      return Place(
        name: parts,
        latitude: (m['latitude'] as num).toDouble(),
        longitude: (m['longitude'] as num).toDouble(),
      );
    }).toList();
  }

  /// Reverse geocode coordinates into a readable place name (best effort).
  Future<String> nameForCoords(double lat, double lon) async {
    try {
      final uri = Uri.parse(
          '$_geocodeUrl?latitude=$lat&longitude=$lon&count=1&language=en&format=json');
      final res = await http.get(uri);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final results = (data['results'] as List?) ?? [];
        if (results.isNotEmpty) {
          final m = results.first as Map<String, dynamic>;
          return [m['name'], m['admin1'], m['country']]
              .where((e) => e != null)
              .join(', ');
        }
      }
    } catch (_) {/* fall through */}
    return 'My location';
  }

  /// Fetch the full forecast (current + 7 days) for a place.
  Future<Weather> getWeather(double lat, double lon, String placeName) async {
    final uri = Uri.parse(_forecastUrl).replace(queryParameters: {
      'latitude': '$lat',
      'longitude': '$lon',
      'current':
          'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      'daily':
          'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
      'hourly': 'precipitation,precipitation_probability,weather_code',
      'timezone': 'auto',
      'temperature_unit': temperatureUnit,
      'wind_speed_unit': windUnit,
      'forecast_days': '13',
      // Blend two models (Open-Meteo's multi-source best_match + GFS): average
      // the highs/lows and pick a daytime-representative condition, so the app
      // tracks apps like Google Weather instead of a single model's rainiest
      // hour. See _blendModels().
      'models': _models.join(','),
    });
    final res = await http.get(uri);
    if (res.statusCode != 200) {
      throw Exception('Forecast failed (${res.statusCode})');
    }
    final data = _blendModels(jsonDecode(res.body) as Map<String, dynamic>);
    return Weather.fromOpenMeteo(data, placeName, unitSymbol);
  }

  // Models to average. `best_match` is Open-Meteo's multi-source blend; GFS is
  // NOAA's global model (PAGASA's official 10-day forecast is GFS-based). The
  // first is "primary" for values we don't average (sunrise/sunset).
  static const _models = ['best_match', 'gfs_seamless'];
  static const _dayStart = 6; // 6 AM — daytime window used to pick a condition
  static const _dayEnd = 18; // 6 PM

  /// Collapse a multi-model Open-Meteo response back into the classic
  /// single-series shape [Weather.fromOpenMeteo] expects, but blended:
  ///   - daily highs/lows -> averaged across models
  ///   - daily rain % + code -> daytime-representative (mean %, modal code)
  ///   - hourly precipitation -> averaged (drives rain slots + start/stop)
  ///   - sunrise/sunset -> primary model; current -> passthrough (one nowcast).
  Map<String, dynamic> _blendModels(Map<String, dynamic> data) {
    final d = data['daily'] as Map<String, dynamic>?;
    final h = data['hourly'] as Map<String, dynamic>?;
    if (d == null || h == null) return data;
    final dates = (d['time'] as List).cast<String>();
    final day = _daytimeByDate(h, dates);

    List<num?> avg(String base, Map<String, dynamic> src) {
      final arrays = _models
          .map((m) => src['${base}_$m'])
          .whereType<List>()
          .toList();
      final n = arrays.fold<int>(0, (mx, a) => a.length > mx ? a.length : mx);
      return List.generate(n, (i) {
        num sum = 0;
        var cnt = 0;
        for (final a in arrays) {
          final v = i < a.length ? a[i] : null;
          if (v is num) {
            sum += v;
            cnt++;
          }
        }
        return cnt > 0 ? sum / cnt : null;
      });
    }

    List? primary(String base, Map<String, dynamic> src) {
      for (final m in _models) {
        final v = src['${base}_$m'];
        if (v is List) return v;
      }
      return src[base] as List?;
    }

    final probFallback = avg('precipitation_probability_max', d);
    final codeFallback = primary('weather_code', d);

    data['daily'] = {
      'time': dates,
      'temperature_2m_max': avg('temperature_2m_max', d),
      'temperature_2m_min': avg('temperature_2m_min', d),
      'sunrise': primary('sunrise', d),
      'sunset': primary('sunset', d),
      'precipitation_probability_max': List.generate(dates.length, (i) {
        return day.prob[dates[i]] ?? ((probFallback[i] ?? 0).round());
      }),
      'weather_code': List.generate(dates.length, (i) {
        return day.code[dates[i]] ??
            (codeFallback != null && i < codeFallback.length
                ? (codeFallback[i] as num).toInt()
                : 0);
      }),
    };

    data['hourly'] = {
      'time': h['time'],
      'precipitation': avg('precipitation', h),
    };
    // `current` is a single nowcast even with models=, so leave it untouched.
    return data;
  }

  /// Per-date daytime-representative rain % (mean over 6 AM–6 PM, all models)
  /// and condition code (mode of daytime hourly codes across models).
  ({Map<String, int?> prob, Map<String, int?> code}) _daytimeByDate(
      Map<String, dynamic> hourly, List<String> dates) {
    final times = (hourly['time'] as List?)?.cast<String>() ?? const [];
    final probArrays = _models
        .map((m) => hourly['precipitation_probability_$m'])
        .whereType<List>()
        .toList();
    final codeArrays =
        _models.map((m) => hourly['weather_code_$m']).whereType<List>().toList();
    final probs = {for (final d in dates) d: <num>[]};
    final codes = {for (final d in dates) d: <int>[]};
    for (var i = 0; i < times.length; i++) {
      final parts = times[i].split('T');
      final d = parts[0];
      if (!probs.containsKey(d)) continue;
      final hour = int.parse(parts[1].substring(0, 2));
      if (hour < _dayStart || hour > _dayEnd) continue;
      for (final a in probArrays) {
        final v = i < a.length ? a[i] : null;
        if (v is num) probs[d]!.add(v);
      }
      for (final a in codeArrays) {
        final v = i < a.length ? a[i] : null;
        if (v is num) codes[d]!.add(v.toInt());
      }
    }
    final prob = <String, int?>{};
    final code = <String, int?>{};
    for (final d in dates) {
      final ps = probs[d]!;
      prob[d] = ps.isEmpty ? null : (ps.reduce((a, b) => a + b) / ps.length).round();
      code[d] = _modeCode(codes[d]!);
    }
    return (prob: prob, code: code);
  }

  /// Most frequent code; ties break toward the milder (lower) code.
  int? _modeCode(List<int> codes) {
    if (codes.isEmpty) return null;
    final counts = <int, int>{};
    for (final c in codes) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
    int? best;
    var bestN = -1;
    counts.forEach((c, n) {
      if (n > bestN || (n == bestN && c < best!)) {
        best = c;
        bestN = n;
      }
    });
    return best;
  }
}
