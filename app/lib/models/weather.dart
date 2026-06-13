import 'package:flutter/material.dart';

// Shared gradient palettes, referenced by both the named presets and from().
const _clearGrad = [Color(0xFF2980B9), Color(0xFF6DD5FA)];
const _cloudyGrad = [Color(0xFF4B6CB7), Color(0xFF8EA6C9)];
const _rainGrad = [Color(0xFF373B44), Color(0xFF4286F4)];
const _snowGrad = [Color(0xFF83A4D4), Color(0xFFB6FBFF)];
const _stormGrad = [Color(0xFF232526), Color(0xFF414345)];
const _fogGrad = [Color(0xFF606C88), Color(0xFF3F4C6B)];

/// Maps a WMO weather interpretation code to a human label + icon + palette.
/// https://open-meteo.com/en/docs
class WeatherCode {
  final String label;
  final IconData icon;
  final List<Color> gradient;

  const WeatherCode(this.label, this.icon, this.gradient);

  static WeatherCode from(int code) {
    switch (code) {
      case 0:
        return const WeatherCode('Clear sky', Icons.wb_sunny_rounded, _clearGrad);
      case 1:
        return const WeatherCode('Mainly clear', Icons.wb_sunny_rounded, _clearGrad);
      case 2:
        return const WeatherCode('Partly cloudy', Icons.cloud_queue_rounded, _cloudyGrad);
      case 3:
        return const WeatherCode('Overcast', Icons.cloud_rounded, _cloudyGrad);
      case 45:
      case 48:
        return const WeatherCode('Fog', Icons.foggy, _fogGrad);
      case 51:
      case 53:
      case 55:
      case 56:
      case 57:
        return const WeatherCode('Drizzle', Icons.grain_rounded, _rainGrad);
      case 61:
      case 63:
      case 65:
      case 66:
      case 67:
      case 80:
      case 81:
      case 82:
        return const WeatherCode('Rain', Icons.grain_rounded, _rainGrad);
      case 71:
      case 73:
      case 75:
      case 77:
      case 85:
      case 86:
        return const WeatherCode('Snow', Icons.ac_unit_rounded, _snowGrad);
      case 95:
      case 96:
      case 99:
        return const WeatherCode('Thunderstorm', Icons.thunderstorm_rounded, _stormGrad);
      default:
        return const WeatherCode('Cloudy', Icons.cloud_rounded, _cloudyGrad);
    }
  }
}

/// A single day in the forecast.
class DailyForecast {
  final DateTime date;
  final int code;
  final double tempMax;
  final double tempMin;
  final int precipProbability;

  DailyForecast({
    required this.date,
    required this.code,
    required this.tempMax,
    required this.tempMin,
    required this.precipProbability,
  });

  WeatherCode get weather => WeatherCode.from(code);
}

/// The full weather snapshot shown on the home screen.
class Weather {
  final String locationName;
  final double temperature;
  final double feelsLike;
  final int humidity;
  final double windSpeed;
  final int code;
  final double tempMax;
  final double tempMin;
  final int precipProbability;
  final DateTime sunrise;
  final DateTime sunset;
  final List<DailyForecast> daily;
  final String unitSymbol;

  Weather({
    required this.locationName,
    required this.temperature,
    required this.feelsLike,
    required this.humidity,
    required this.windSpeed,
    required this.code,
    required this.tempMax,
    required this.tempMin,
    required this.precipProbability,
    required this.sunrise,
    required this.sunset,
    required this.daily,
    required this.unitSymbol,
  });

  WeatherCode get weather => WeatherCode.from(code);

  factory Weather.fromOpenMeteo(
    Map<String, dynamic> json,
    String locationName,
    String unitSymbol,
  ) {
    final current = json['current'] as Map<String, dynamic>;
    final daily = json['daily'] as Map<String, dynamic>;

    DateTime parse(String s) => DateTime.parse(s);

    final times = (daily['time'] as List).cast<String>();
    final codes = (daily['weather_code'] as List).cast<num>();
    final maxes = (daily['temperature_2m_max'] as List).cast<num>();
    final mins = (daily['temperature_2m_min'] as List).cast<num>();
    final precs = (daily['precipitation_probability_max'] as List);

    final forecasts = <DailyForecast>[];
    for (var i = 0; i < times.length; i++) {
      forecasts.add(DailyForecast(
        date: DateTime.parse(times[i]),
        code: codes[i].toInt(),
        tempMax: maxes[i].toDouble(),
        tempMin: mins[i].toDouble(),
        precipProbability: (precs[i] ?? 0).toInt(),
      ));
    }

    return Weather(
      locationName: locationName,
      temperature: (current['temperature_2m'] as num).toDouble(),
      feelsLike: (current['apparent_temperature'] as num).toDouble(),
      humidity: (current['relative_humidity_2m'] as num).toInt(),
      windSpeed: (current['wind_speed_10m'] as num).toDouble(),
      code: (current['weather_code'] as num).toInt(),
      tempMax: maxes[0].toDouble(),
      tempMin: mins[0].toDouble(),
      precipProbability: ((precs[0]) ?? 0).toInt(),
      sunrise: parse((daily['sunrise'] as List)[0]),
      sunset: parse((daily['sunset'] as List)[0]),
      daily: forecasts,
      unitSymbol: unitSymbol,
    );
  }
}
