import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/weather.dart';
import '../services/weather_service.dart';
import '../services/location_service.dart';
import 'privacy_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _service = WeatherService();

  Weather? _weather;
  String? _error;
  bool _loading = true;

  // Forecast list shows the next 6 days by default; "More" reveals the rest.
  bool _showAllDays = false;
  static const _defaultDays = 7; // today + next 6

  // Defaults to Manila until the user picks a place / uses GPS.
  double _lat = 14.5995;
  double _lon = 120.9842;
  String _placeName = 'Manila';

  // All places the user has saved (the "cities list" of the best apps). Each is
  // {lat, lon, name}; the currently-viewed one is mirrored in _lat/_lon/_name.
  List<Map<String, dynamic>> _saved = [];

  @override
  void initState() {
    super.initState();
    _restoreAndLoad();
  }

  Future<void> _restoreAndLoad() async {
    final prefs = await SharedPreferences.getInstance();
    // New multi-location store; migrate the old single 'place' if present.
    final list = prefs.getString('places_v2');
    if (list != null) {
      _saved = (jsonDecode(list) as List)
          .map((e) => (e as Map).cast<String, dynamic>())
          .toList();
    } else {
      final legacy = prefs.getString('place');
      if (legacy != null) {
        _saved = [(jsonDecode(legacy) as Map).cast<String, dynamic>()];
      }
    }
    if (_saved.isNotEmpty) {
      final m = _saved.first;
      _lat = (m['lat'] as num).toDouble();
      _lon = (m['lon'] as num).toDouble();
      _placeName = m['name'] as String;
    }
    await _load();
  }

  Future<void> _persistSaved() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('places_v2', jsonEncode(_saved));
    // Keep the legacy key in sync so the Telegram-linked flow still reads it.
    if (_saved.isNotEmpty) {
      await prefs.setString('place', jsonEncode(_saved.first));
    }
  }

  bool _sameSpot(Map<String, dynamic> a, double lat, double lon) =>
      ((a['lat'] as num) - lat).abs() < 0.02 &&
      ((a['lon'] as num) - lon).abs() < 0.02;

  /// Select this place, move it to the front of the saved list (so it's the
  /// default next launch), persist, and reload.
  Future<void> _selectPlace(double lat, double lon, String name,
      {bool save = true}) async {
    _lat = lat;
    _lon = lon;
    _placeName = name;
    if (save) {
      _saved.removeWhere((e) => _sameSpot(e, lat, lon));
      _saved.insert(0, {'lat': lat, 'lon': lon, 'name': name});
      await _persistSaved();
    }
    await _load();
  }

  Future<void> _removeSaved(int index) async {
    _saved.removeAt(index);
    await _persistSaved();
    setState(() {});
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final w = await _service.getWeather(_lat, _lon, _placeName);
      setState(() {
        _weather = w;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _useMyLocation() async {
    setState(() => _loading = true);
    try {
      final pos = await LocationService.current();
      final name = await _service.nameForCoords(pos.latitude, pos.longitude);
      await _selectPlace(pos.latitude, pos.longitude, name);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _openSearch() async {
    final place = await showModalBottomSheet<Place>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _SearchSheet(service: _service),
    );
    if (place != null) {
      await _selectPlace(place.latitude, place.longitude, place.displayName);
    }
  }

  Future<void> _openSavedLocations() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _SavedLocationsSheet(
        items: _saved,
        currentLat: _lat,
        currentLon: _lon,
        onSelect: (e) => _selectPlace(
            (e['lat'] as num).toDouble(),
            (e['lon'] as num).toDouble(),
            e['name'] as String),
        onRemove: _removeSaved,
        onAddCity: _openSearch,
        onUseLocation: _useMyLocation,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final gradient = _weather?.weather.gradient ??
        const [Color(0xFF2980B9), Color(0xFF6DD5FA)];

    return Scaffold(
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 600),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradient,
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _load,
            color: gradient.last,
            child: _buildBody(),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }
    if (_error != null && _weather == null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final w = _weather!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        _header(w),
        const SizedBox(height: 24),
        _current(w),
        const SizedBox(height: 20),
        _rainBanner(w),
        _hourlyStrip(w),
        _airQualityCard(w),
        _detailsGrid(w),
        _tomorrowSun(w),
        _driestDays(w),
        const SizedBox(height: 28),
        _forecast(w),
        const SizedBox(height: 16),
        _telegramBanner(),
      ],
    );
  }

  Future<void> _openTelegramBot() async {
    final uri = Uri.parse('https://t.me/pjo_weather_bot');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open Telegram')),
        );
      }
    }
  }

  Widget _telegramBanner() {
    return InkWell(
      onTap: _openTelegramBot,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            const Icon(Icons.send_rounded, color: Colors.white, size: 22),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Get your daily forecast on Telegram',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600),
              ),
            ),
            const Icon(Icons.open_in_new, color: Colors.white70, size: 16),
          ],
        ),
      ),
    );
  }

  // Shared "frosted glass" surface: a soft top-down light gradient plus a
  // hairline highlight border, so cards read as glass rather than flat 15%
  // overlays. (Panel note: real backdrop blur is pointless over a flat
  // gradient — nothing behind to blur — so we fake the light edge instead.)
  BoxDecoration _glass([double radius = 16]) => BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.22),
            Colors.white.withValues(alpha: 0.08),
          ],
        ),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
            color: Colors.white.withValues(alpha: 0.25), width: 0.6),
      );

  // Tabular figures keep temps/times from jittering as digits change.
  static const _tnum = [FontFeature.tabularFigures()];

  // Horizontal next-24h strip: hour · icon · temp · rain%. A staple of every
  // top weather app that this build was missing.
  Widget _hourlyStrip(Weather w) {
    if (w.hourly.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        decoration: _glass(18),
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: SizedBox(
          height: 126,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: w.hourly.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final h = w.hourly[i];
              final wet = h.precipProbability >= 10;
              return SizedBox(
                width: 46,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      i == 0 ? 'Now' : _hourLabel(h.time),
                      style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontFeatures: _tnum),
                    ),
                    const SizedBox(height: 10),
                    Icon(h.displayIcon, color: Colors.white, size: 24),
                    const SizedBox(height: 10),
                    Text(
                      '${h.temp.round()}°',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          fontFeatures: _tnum),
                    ),
                    const SizedBox(height: 6),
                    // Precip pill only when it actually might rain (no reserved
                    // blank space, and readable on any gradient).
                    if (wet)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${h.precipProbability}%',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              fontFeatures: _tnum),
                        ),
                      )
                    else
                      const SizedBox(height: 18),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  String _hourLabel(DateTime t) {
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    return '$h${t.hour < 12 ? 'AM' : 'PM'}';
  }

  // Air quality (US AQI) as a spectrum gauge: the value sits on a green→purple
  // severity bar, so it reads at a glance without a saturated block fighting
  // the background gradient.
  Widget _airQualityCard(Weather w) {
    final air = w.air;
    if (air == null) return const SizedBox.shrink();
    // Map 0..300+ onto the bar; clamp so extreme values pin to the end.
    final t = (air.usAqi / 300).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: _glass(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('AIR QUALITY',
                    style: TextStyle(
                        color: Colors.white60,
                        fontSize: 10,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w600)),
                const Spacer(),
                Text('${air.usAqi}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        fontFeatures: _tnum)),
                const SizedBox(width: 6),
                Text('US AQI',
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 11)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              air.pm25 != null
                  ? '${air.label}  ·  PM2.5 ${air.pm25!.round()} µg/m³'
                  : air.label,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            // Spectrum bar + position indicator.
            LayoutBuilder(builder: (context, c) {
              const barH = 8.0;
              const knob = 5.0;
              final x = (c.maxWidth - knob) * t;
              return SizedBox(
                height: 16,
                child: Stack(
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        height: barH,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(4),
                          gradient: const LinearGradient(colors: [
                            Color(0xFF2ECC71),
                            Color(0xFFF1C40F),
                            Color(0xFFE67E22),
                            Color(0xFFE74C3C),
                            Color(0xFF9B59B6),
                            Color(0xFF7D3C98),
                          ]),
                        ),
                      ),
                    ),
                    Positioned(
                      left: x,
                      top: 0,
                      child: Container(
                        width: knob,
                        height: 16,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(3),
                          boxShadow: [
                            BoxShadow(
                                color: Colors.black.withValues(alpha: 0.35),
                                blurRadius: 3)
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _rainBanner(Weather w) {
    final rain = w.rain;
    if (rain == null) return const SizedBox(height: 8);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(rain.icon, color: Colors.white, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                rain.label(w.now),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header(Weather w) {
    return Row(
      children: [
        const Icon(Icons.location_on, color: Colors.white, size: 20),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            w.locationName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        IconButton(
          icon: const Icon(Icons.my_location, color: Colors.white),
          tooltip: 'Use my location',
          onPressed: _useMyLocation,
        ),
        IconButton(
          icon: Badge(
            isLabelVisible: _saved.length > 1,
            label: Text('${_saved.length}'),
            child: const Icon(Icons.bookmarks_outlined, color: Colors.white),
          ),
          tooltip: 'Saved locations',
          onPressed: _openSavedLocations,
        ),
        IconButton(
          icon: const Icon(Icons.search, color: Colors.white),
          tooltip: 'Search city',
          onPressed: _openSearch,
        ),
        IconButton(
          icon: const Icon(Icons.privacy_tip_outlined, color: Colors.white),
          tooltip: 'Privacy',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const PrivacyScreen()),
          ),
        ),
      ],
    );
  }

  Widget _current(Weather w) {
    return Column(
      children: [
        Icon(w.weather.icon, size: 96, color: Colors.white),
        const SizedBox(height: 8),
        Text(
          '${w.temperature.round()}${w.unitSymbol}',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 76,
            fontWeight: FontWeight.w200,
            height: 1.0,
          ),
        ),
        Text(
          w.weather.label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Feels like ${w.feelsLike.round()}${w.unitSymbol}   ·   '
          'H:${w.tempMax.round()}°  L:${w.tempMin.round()}°',
          style: const TextStyle(color: Colors.white70, fontSize: 15),
        ),
      ],
    );
  }

  Widget _detailsGrid(Weather w) {
    final uv = w.uvIndexNow ?? w.uvIndexMax;
    final items = <_Detail>[
      _Detail(Icons.water_drop_outlined, 'Humidity', '${w.humidity}%'),
      _Detail(Icons.umbrella_outlined, 'Rain', '${w.precipProbability}%'),
      _Detail(Icons.air, 'Wind', '${w.windSpeed.round()} km/h',
          subtext: w.windDirection != null
              ? 'from ${Weather.compass(w.windDirection!)}'
              : null,
          // Arrow points where the wind is heading (bearing + 180°).
          arrowDeg: w.windDirection != null
              ? (w.windDirection! + 180).toDouble()
              : null),
      if (uv != null)
        _Detail(Icons.wb_sunny_outlined, 'UV index', '${uv.round()}',
            subtext: Weather.uvLabel(uv)),
      if (w.pressure != null)
        _Detail(Icons.speed, 'Pressure', '${w.pressure!.round()}',
            subtext: 'hPa'),
      if (w.visibilityKm != null)
        _Detail(Icons.visibility_outlined, 'Visibility',
            '${w.visibilityKm!.round()} km'),
      if (w.windGusts != null)
        _Detail(Icons.air, 'Gusts', '${w.windGusts!.round()} km/h'),
      if (w.dewPoint != null)
        _Detail(Icons.opacity, 'Dew point',
            '${w.dewPoint!.round()}${w.unitSymbol}'),
      _Detail(Icons.wb_twilight, 'Sunrise', _time(w.sunrise)),
      _Detail(Icons.nightlight_outlined, 'Sunset', _time(w.sunset)),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 0.88,
      children: items.map((d) => _detailCard(d)).toList(),
    );
  }

  Widget _detailCard(_Detail d) {
    final icon = d.arrowDeg != null
        ? Transform.rotate(
            angle: d.arrowDeg! * 0.0174533, // deg -> rad
            child: const Icon(Icons.navigation, color: Colors.white60, size: 15),
          )
        : Icon(d.icon, color: Colors.white60, size: 15);
    return Container(
      decoration: _glass(16),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              icon,
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  d.label.toUpperCase(),
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white60,
                      fontSize: 10,
                      letterSpacing: 0.6,
                      fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const Spacer(),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              d.value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                  fontFeatures: _tnum),
            ),
          ),
          if (d.subtext != null)
            Text(
              d.subtext!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white70, fontSize: 11),
            ),
        ],
      ),
    );
  }

  Widget _forecast(Weather w) {
    final total = w.daily.length;
    final visibleDays = _showAllDays || total <= _defaultDays ? total : _defaultDays;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(18),
      ),
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      child: Column(
        children: [
          for (var i = 0; i < visibleDays; i++) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      SizedBox(
                        width: 64,
                        child: Text(
                          _dayLabel(i, w.daily[i].date),
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w500,
                              fontSize: 14),
                        ),
                      ),
                      Icon(w.daily[i].displayIcon,
                          color: Colors.white, size: 22),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Row(
                          children: [
                            const Icon(Icons.umbrella,
                                color: Colors.white54, size: 13),
                            const SizedBox(width: 2),
                            Text('${w.daily[i].precipProbability}%',
                                style: const TextStyle(
                                    color: Colors.white70, fontSize: 12)),
                          ],
                        ),
                      ),
                      Text('${w.daily[i].tempMax.round()}°',
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 15)),
                      const SizedBox(width: 8),
                      Text('${w.daily[i].tempMin.round()}°',
                          style: const TextStyle(
                              color: Colors.white54, fontSize: 15)),
                    ],
                  ),
                  // Rain timeslots for today + the next 6 days (not later days).
                  if (i <= 6 && w.daily[i].rainSlots.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 4, top: 3),
                      child: Row(
                        children: [
                          const Icon(Icons.umbrella,
                              color: Colors.white54, size: 12),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              'rain ${w.daily[i].rainSlots.join(', ')}',
                              style: const TextStyle(
                                  color: Colors.white60, fontSize: 11.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            if (i != visibleDays - 1)
              Divider(color: Colors.white.withValues(alpha: 0.12), height: 1),
          ],
          if (total > _defaultDays)
            InkWell(
              onTap: () => setState(() => _showAllDays = !_showAllDays),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      _showAllDays
                          ? 'Show less'
                          : 'More (${total - _defaultDays} days)',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 14),
                    ),
                    Icon(
                      _showAllDays ? Icons.expand_less : Icons.expand_more,
                      color: Colors.white,
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _time(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final ampm = dt.hour < 12 ? 'AM' : 'PM';
    return '$h:$m $ampm';
  }

  // "Today", "Tomorrow", then "Mon 16" etc. (date disambiguates the 12-day list).
  String _dayLabel(int i, DateTime date) {
    if (i == 0) return 'Today';
    if (i == 1) return 'Tmrw';
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return '${wd[date.weekday - 1]} ${date.day}';
  }

  Widget _tomorrowSun(Weather w) {
    if (w.tomorrowSunrise == null || w.tomorrowSunset == null) {
      return const SizedBox.shrink();
    }
    const style = TextStyle(color: Colors.white70, fontSize: 13);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('Tomorrow:', style: style),
          const SizedBox(width: 8),
          const Icon(Icons.wb_sunny_outlined, color: Colors.white70, size: 15),
          const SizedBox(width: 4),
          Text(_time(w.tomorrowSunrise!), style: style),
          const SizedBox(width: 12),
          const Icon(Icons.nightlight_outlined, color: Colors.white70, size: 14),
          const SizedBox(width: 4),
          Text(_time(w.tomorrowSunset!), style: style),
        ],
      ),
    );
  }

  Widget _driestDays(Weather w) {
    final days = w.driestDays;
    if (days.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(18),
        ),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.wb_sunny_outlined, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Text('Driest days ahead',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 15)),
              ],
            ),
            const SizedBox(height: 10),
            for (var i = 0; i < days.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    SizedBox(
                      width: 20,
                      child: Text('${i + 1}.',
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 14)),
                    ),
                    Text(_shortDate(days[i].date),
                        style: const TextStyle(color: Colors.white, fontSize: 14)),
                    const Spacer(),
                    const Icon(Icons.water_drop_outlined,
                        color: Colors.white54, size: 14),
                    const SizedBox(width: 3),
                    Text('${days[i].precipProbability}%',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 14)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _shortDate(DateTime d) {
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const mo = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${wd[d.weekday - 1]} ${mo[d.month - 1]} ${d.day}';
  }
}

class _Detail {
  final IconData icon;
  final String label;
  final String value;
  final String? subtext;
  final double? arrowDeg; // if set, icon becomes an arrow rotated to this bearing
  _Detail(this.icon, this.label, this.value, {this.subtext, this.arrowDeg});
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 120),
        const Icon(Icons.cloud_off, color: Colors.white, size: 64),
        const SizedBox(height: 16),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: FilledButton.tonal(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ),
      ],
    );
  }
}

/// Bottom sheet listing the user's saved cities: tap to switch, delete to
/// remove, plus quick actions to add a city or jump to the current location.
class _SavedLocationsSheet extends StatefulWidget {
  final List<Map<String, dynamic>> items;
  final double currentLat;
  final double currentLon;
  final void Function(Map<String, dynamic>) onSelect;
  final Future<void> Function(int) onRemove;
  final Future<void> Function() onAddCity;
  final Future<void> Function() onUseLocation;

  const _SavedLocationsSheet({
    required this.items,
    required this.currentLat,
    required this.currentLon,
    required this.onSelect,
    required this.onRemove,
    required this.onAddCity,
    required this.onUseLocation,
  });

  @override
  State<_SavedLocationsSheet> createState() => _SavedLocationsSheetState();
}

class _SavedLocationsSheetState extends State<_SavedLocationsSheet> {
  late final List<Map<String, dynamic>> _items = List.of(widget.items);

  bool _isCurrent(Map<String, dynamic> e) =>
      ((e['lat'] as num) - widget.currentLat).abs() < 0.02 &&
      ((e['lon'] as num) - widget.currentLon).abs() < 0.02;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.black26,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(8, 12, 8, 8),
            child: Text('Saved locations',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ),
          if (_items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('No saved places yet — add a city below.',
                  style: TextStyle(color: Colors.black54)),
            )
          else
            ConstrainedBox(
              constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.45),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: _items.length,
                itemBuilder: (_, i) {
                  final e = _items[i];
                  final current = _isCurrent(e);
                  return ListTile(
                    leading: Icon(
                      current ? Icons.my_location : Icons.location_city,
                      color: current
                          ? Theme.of(context).colorScheme.primary
                          : Colors.black54,
                    ),
                    title: Text(e['name'] as String),
                    subtitle: current ? const Text('Showing now') : null,
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline),
                      tooltip: 'Remove',
                      onPressed: () async {
                        await widget.onRemove(i);
                        setState(() => _items.removeAt(i));
                      },
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      widget.onSelect(e);
                    },
                  );
                },
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.my_location),
                  label: const Text('My location'),
                  onPressed: () {
                    Navigator.pop(context);
                    widget.onUseLocation();
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  icon: const Icon(Icons.add),
                  label: const Text('Add city'),
                  onPressed: () {
                    Navigator.pop(context);
                    widget.onAddCity();
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet for searching and picking a city.
class _SearchSheet extends StatefulWidget {
  final WeatherService service;
  const _SearchSheet({required this.service});

  @override
  State<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<_SearchSheet> {
  final _controller = TextEditingController();
  List<Place> _results = [];
  bool _searching = false;

  Future<void> _search(String q) async {
    if (q.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    setState(() => _searching = true);
    try {
      final r = await widget.service.searchPlaces(q);
      if (mounted) setState(() => _results = r);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _controller,
            autofocus: true,
            onChanged: _search,
            decoration: InputDecoration(
              hintText: 'Search city…',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.4),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: _results.length,
              itemBuilder: (_, i) => ListTile(
                leading: const Icon(Icons.location_city),
                title: Text(_results[i].displayName),
                onTap: () => Navigator.pop(context, _results[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
