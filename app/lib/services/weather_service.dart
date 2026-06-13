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
      'timezone': 'auto',
      'temperature_unit': temperatureUnit,
      'wind_speed_unit': windUnit,
      'forecast_days': '7',
    });
    final res = await http.get(uri);
    if (res.statusCode != 200) {
      throw Exception('Forecast failed (${res.statusCode})');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return Weather.fromOpenMeteo(data, placeName, unitSymbol);
  }
}
