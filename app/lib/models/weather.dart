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
        return const WeatherCode('Drizzle', Icons.water_drop_rounded, _rainGrad);
      case 61:
      case 63:
      case 65:
      case 66:
      case 67:
      case 80:
      case 81:
      case 82:
        return const WeatherCode('Rain', Icons.cloudy_snowing, _rainGrad);
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
  final List<String> rainSlots; // e.g. ["1–3PM", "8–11PM"]

  DailyForecast({
    required this.date,
    required this.code,
    required this.tempMax,
    required this.tempMin,
    required this.precipProbability,
    this.rainSlots = const [],
  });

  WeatherCode get weather => WeatherCode.from(code);

  /// Compact label from two 0–23 hours, e.g. (13,15) -> "1–3PM".
  static String _slotLabel(int s, int e) {
    if (e <= s) e = s + 1;
    String ap(int h) => h % 24 < 12 ? 'AM' : 'PM';
    int disp(int h) {
      final d = h % 12;
      return d == 0 ? 12 : d;
    }
    return ap(s) == ap(e)
        ? '${disp(s)}–${disp(e)}${ap(e)}'
        : '${disp(s)}${ap(s)}–${disp(e)}${ap(e)}';
  }

  /// Contiguous rain windows within one local date (preceding-hour offset).
  static List<String> rainSlotsForDate(
      Map<String, dynamic>? hourly, String dateStr,
      {int maxSlots = 3}) {
    if (hourly == null) return const [];
    final times = (hourly['time'] as List?)?.cast<String>();
    final precip = hourly['precipitation'] as List?;
    if (times == null || precip == null) return const [];
    const threshold = 0.1;
    final slots = <List<int>>[];
    int? startH;
    int prevH = 0;
    for (var i = 0; i < times.length; i++) {
      final parts = times[i].split('T');
      if (parts[0] != dateStr) continue;
      final hour = int.parse(parts[1].substring(0, 2));
      final wet = ((precip[i] ?? 0) as num) >= threshold;
      if (wet) {
        startH ??= hour;
        prevH = hour;
      } else if (startH != null) {
        slots.add([startH - 1 < 0 ? 0 : startH - 1, prevH]);
        startH = null;
      }
    }
    if (startH != null) slots.add([startH - 1 < 0 ? 0 : startH - 1, prevH]);
    return slots.take(maxSlots).map((s) => _slotLabel(s[0], s[1])).toList();
  }

  /// An icon consistent with the rain probability, so a sunny icon never shows
  /// on a high-rain day. Snow/thunderstorm keep their own icon.
  IconData get displayIcon {
    const snow = {71, 73, 75, 77, 85, 86};
    const storm = {95, 96, 99};
    if (snow.contains(code) || storm.contains(code)) return weather.icon;
    if (precipProbability >= 70) return Icons.cloudy_snowing;
    if (precipProbability >= 40) return Icons.water_drop_rounded;
    return weather.icon;
  }
}

/// One hour in the short-term (next-24h) forecast strip.
class HourlyForecast {
  final DateTime time;
  final double temp;
  final int code;
  final int precipProbability;

  HourlyForecast({
    required this.time,
    required this.temp,
    required this.code,
    required this.precipProbability,
  });

  WeatherCode get weather => WeatherCode.from(code);

  /// Rain-consistent icon (same rule the daily rows use).
  IconData get displayIcon {
    const snow = {71, 73, 75, 77, 85, 86};
    const storm = {95, 96, 99};
    if (snow.contains(code) || storm.contains(code)) return weather.icon;
    if (precipProbability >= 70) return Icons.cloudy_snowing;
    if (precipProbability >= 40) return Icons.water_drop_rounded;
    return weather.icon;
  }
}

/// US Air Quality Index bucket — label + color, mirroring EPA bands.
class AirQuality {
  final int usAqi;
  final double? pm25;
  const AirQuality(this.usAqi, this.pm25);

  String get label {
    final a = usAqi;
    if (a <= 50) return 'Good';
    if (a <= 100) return 'Moderate';
    if (a <= 150) return 'Unhealthy (sensitive)';
    if (a <= 200) return 'Unhealthy';
    if (a <= 300) return 'Very unhealthy';
    return 'Hazardous';
  }

  Color get color {
    final a = usAqi;
    if (a <= 50) return const Color(0xFF2ECC71);
    if (a <= 100) return const Color(0xFFF1C40F);
    if (a <= 150) return const Color(0xFFE67E22);
    if (a <= 200) return const Color(0xFFE74C3C);
    if (a <= 300) return const Color(0xFF9B59B6);
    return const Color(0xFF7D3C98);
  }
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
  final List<HourlyForecast> hourly;
  final String unitSymbol;
  final String now; // local ISO of "now", for rain-timing phrasing
  final RainOutlook? rain;
  final DateTime? tomorrowSunrise;
  final DateTime? tomorrowSunset;
  // Richer "now" metrics (best-app parity). Nullable: hidden when unavailable.
  final double? windGusts;
  final int? windDirection; // degrees, 0 = N
  final double? pressure; // hPa
  final double? uvIndexNow; // current-hour UV
  final double? uvIndexMax; // today's peak UV
  final double? dewPoint;
  final double? visibilityKm;
  final AirQuality? air;

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
    required this.now,
    this.hourly = const [],
    this.rain,
    this.tomorrowSunrise,
    this.tomorrowSunset,
    this.windGusts,
    this.windDirection,
    this.pressure,
    this.uvIndexNow,
    this.uvIndexMax,
    this.dewPoint,
    this.visibilityKm,
    this.air,
  });

  WeatherCode get weather => WeatherCode.from(code);

  /// Compass label for a wind bearing, e.g. 200° -> "SSW".
  static String compass(int deg) {
    const dirs = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ];
    return dirs[(((deg % 360) / 22.5) + 0.5).floor() % 16];
  }

  /// UV exposure band label for an index value.
  static String uvLabel(double uv) {
    if (uv < 3) return 'Low';
    if (uv < 6) return 'Moderate';
    if (uv < 8) return 'High';
    if (uv < 11) return 'Very high';
    return 'Extreme';
  }

  /// The 3 upcoming days (tomorrow onward) with the lowest rain chance, ranked.
  List<DailyForecast> get driestDays {
    final upcoming = daily.skip(1).toList()
      ..sort((a, b) {
        final byRain = a.precipProbability.compareTo(b.precipProbability);
        return byRain != 0 ? byRain : a.date.compareTo(b.date);
      });
    return upcoming.take(3).toList();
  }

  factory Weather.fromOpenMeteo(
    Map<String, dynamic> json,
    String locationName,
    String unitSymbol, {
    Map<String, dynamic>? air,
  }) {
    final current = json['current'] as Map<String, dynamic>;
    final daily = json['daily'] as Map<String, dynamic>;
    final hourly = json['hourly'] as Map<String, dynamic>?;

    DateTime parse(String s) => DateTime.parse(s);

    final times = (daily['time'] as List).cast<String>();
    final codes = (daily['weather_code'] as List).cast<num>();
    final maxes = (daily['temperature_2m_max'] as List).cast<num>();
    final mins = (daily['temperature_2m_min'] as List).cast<num>();
    final precs = (daily['precipitation_probability_max'] as List);
    final uvMaxes = daily['uv_index_max'] as List?;

    final forecasts = <DailyForecast>[];
    for (var i = 0; i < times.length; i++) {
      forecasts.add(DailyForecast(
        date: DateTime.parse(times[i]),
        code: codes[i].toInt(),
        tempMax: maxes[i].toDouble(),
        tempMin: mins[i].toDouble(),
        precipProbability: (precs[i] ?? 0).toInt(),
        // times[i] is the date-only string ("2026-06-15").
        rainSlots: DailyForecast.rainSlotsForDate(hourly, times[i]),
      ));
    }

    final nowIso = current['time'] as String?;

    // Index of the hour bucket containing "now" (last hour <= current time),
    // used both for the current-hour metrics and the strip's starting point.
    int nowIndex = 0;
    final hTimes = (hourly?['time'] as List?)?.cast<String>();
    if (hTimes != null && nowIso != null) {
      for (var i = 0; i < hTimes.length; i++) {
        if (hTimes[i].compareTo(nowIso) <= 0) {
          nowIndex = i;
        } else {
          break;
        }
      }
    }

    double? hourlyAt(String key) {
      final arr = hourly?[key] as List?;
      if (arr == null || nowIndex >= arr.length) return null;
      final v = arr[nowIndex];
      return v is num ? v.toDouble() : null;
    }

    // Next-24h strip: temp + icon + rain% per hour, starting at the next hour.
    final strip = <HourlyForecast>[];
    if (hTimes != null) {
      final temps = hourly?['temperature_2m'] as List?;
      final hCodes = hourly?['weather_code'] as List?;
      final hProbs = hourly?['precipitation_probability'] as List?;
      for (var i = nowIndex; i < hTimes.length && strip.length < 24; i++) {
        final t = temps != null && i < temps.length ? temps[i] : null;
        if (t is! num) continue;
        strip.add(HourlyForecast(
          time: DateTime.parse(hTimes[i]),
          temp: t.toDouble(),
          code: hCodes != null && i < hCodes.length && hCodes[i] is num
              ? (hCodes[i] as num).toInt()
              : 0,
          precipProbability:
              hProbs != null && i < hProbs.length && hProbs[i] is num
                  ? (hProbs[i] as num).toInt()
                  : 0,
        ));
      }
    }

    AirQuality? airQuality;
    final aqCur = air?['current'] as Map<String, dynamic>?;
    if (aqCur != null && aqCur['us_aqi'] is num) {
      airQuality = AirQuality(
        (aqCur['us_aqi'] as num).round(),
        (aqCur['pm2_5'] as num?)?.toDouble(),
      );
    }

    final vis = hourlyAt('visibility');

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
      hourly: strip,
      unitSymbol: unitSymbol,
      now: current['time'] as String,
      tomorrowSunrise: (daily['sunrise'] as List).length > 1
          ? parse((daily['sunrise'] as List)[1])
          : null,
      tomorrowSunset: (daily['sunset'] as List).length > 1
          ? parse((daily['sunset'] as List)[1])
          : null,
      windGusts: (current['wind_gusts_10m'] as num?)?.toDouble(),
      windDirection: (current['wind_direction_10m'] as num?)?.round(),
      pressure: (current['surface_pressure'] as num?)?.toDouble(),
      uvIndexNow: hourlyAt('uv_index'),
      uvIndexMax: uvMaxes != null && uvMaxes.isNotEmpty && uvMaxes[0] is num
          ? (uvMaxes[0] as num).toDouble()
          : null,
      dewPoint: hourlyAt('dew_point_2m'),
      visibilityKm: vis != null ? vis / 1000.0 : null,
      air: airQuality,
      rain: RainOutlook.fromHourly(
        json['hourly'] as Map<String, dynamic>?,
        current['time'] as String?,
      ),
    );
  }
}

/// When rain will start (if dry now) or stop (if raining now), derived from
/// the hourly precipitation forecast. Mirrors the Telegram bot's logic.
class RainOutlook {
  final bool rainingNow;
  final String type; // 'start' | 'stop' | 'none'
  final String? changeAt; // local ISO string, or null

  const RainOutlook({required this.rainingNow, required this.type, this.changeAt});

  static const _thresholdMm = 0.1;

  static RainOutlook? fromHourly(Map<String, dynamic>? hourly, String? currentTime) {
    if (hourly == null || currentTime == null) return null;
    final times = (hourly['time'] as List?)?.cast<String>();
    final precip = hourly['precipitation'] as List?;
    if (times == null || precip == null || times.isEmpty) return null;

    // Index of the hour bucket containing "now" (last hour <= current time).
    var now = 0;
    for (var i = 0; i < times.length; i++) {
      if (times[i].compareTo(currentTime) <= 0) {
        now = i;
      } else {
        break;
      }
    }
    bool isWet(int i) => ((precip[i] ?? 0) as num) >= _thresholdMm;
    final rainingNow = isWet(now);

    if (rainingNow) {
      for (var j = now + 1; j < times.length; j++) {
        if (!isWet(j)) {
          return RainOutlook(rainingNow: true, type: 'stop', changeAt: times[j]);
        }
      }
      return const RainOutlook(rainingNow: true, type: 'stop', changeAt: null);
    }
    for (var j = now + 1; j < times.length; j++) {
      if (isWet(j)) {
        return RainOutlook(rainingNow: false, type: 'start', changeAt: times[j]);
      }
    }
    return const RainOutlook(rainingNow: false, type: 'none', changeAt: null);
  }

  /// Human-readable line, e.g. "Rain expected tomorrow around 2 AM".
  String label(String nowIso) {
    final nowDate = nowIso.split('T').first;
    if (type == 'stop') {
      if (changeAt == null) return 'Rain set to continue for a while';
      final parts = changeAt!.split('T');
      return 'Rain should ease ${_dayPrefix(parts[0], nowDate)}around ${_formatHour(parts[1])}';
    }
    if (type == 'start' && changeAt != null) {
      final parts = changeAt!.split('T');
      return 'Rain expected ${_dayPrefix(parts[0], nowDate)}around ${_formatHour(parts[1])}';
    }
    return 'No rain expected in the next 2 days';
  }

  IconData get icon {
    if (type == 'start' && changeAt != null) return Icons.umbrella;
    if (type == 'stop') {
      return changeAt != null ? Icons.wb_sunny_outlined : Icons.grain;
    }
    return Icons.wb_sunny_outlined;
  }

  static String _dayPrefix(String targetDate, String nowDate) {
    if (targetDate == nowDate) return '';
    if (targetDate == _shiftDate(nowDate, 1)) return 'tomorrow ';
    return '${_weekday(targetDate)} ';
  }

  static String _shiftDate(String dateStr, int n) {
    final d = DateTime.parse('${dateStr}T00:00:00Z').add(Duration(days: n));
    return d.toUtc().toIso8601String().split('T').first;
  }

  static String _weekday(String dateStr) {
    final d = DateTime.parse('${dateStr}T00:00:00Z');
    const names = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ];
    return names[d.weekday - 1];
  }

  static String _formatHour(String time) {
    final parts = time.split(':');
    var h = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    final ampm = h < 12 ? 'AM' : 'PM';
    h = h % 12 == 0 ? 12 : h % 12;
    return m == 0 ? '$h $ampm' : '$h:${m.toString().padLeft(2, '0')} $ampm';
  }
}
