import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
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

  // Defaults to Manila until the user picks a place / uses GPS.
  double _lat = 14.5995;
  double _lon = 120.9842;
  String _placeName = 'Manila';

  @override
  void initState() {
    super.initState();
    _restoreAndLoad();
  }

  Future<void> _restoreAndLoad() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('place');
    if (saved != null) {
      final m = jsonDecode(saved) as Map<String, dynamic>;
      _lat = (m['lat'] as num).toDouble();
      _lon = (m['lon'] as num).toDouble();
      _placeName = m['name'] as String;
    }
    await _load();
  }

  Future<void> _savePlace() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'place',
      jsonEncode({'lat': _lat, 'lon': _lon, 'name': _placeName}),
    );
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
      _lat = pos.latitude;
      _lon = pos.longitude;
      _placeName = name;
      await _savePlace();
      await _load();
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
      _lat = place.latitude;
      _lon = place.longitude;
      _placeName = place.displayName;
      await _savePlace();
      await _load();
    }
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
        _detailsGrid(w),
        _tomorrowSun(w),
        _driestDays(w),
        const SizedBox(height: 28),
        _forecast(w),
      ],
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
    final items = [
      _Detail(Icons.water_drop_outlined, 'Humidity', '${w.humidity}%'),
      _Detail(Icons.umbrella_outlined, 'Rain chance', '${w.precipProbability}%'),
      _Detail(Icons.air, 'Wind', '${w.windSpeed.round()} km/h'),
      _Detail(Icons.wb_twilight, 'Sunrise', _time(w.sunrise)),
      _Detail(Icons.nightlight_outlined, 'Sunset', _time(w.sunset)),
      _Detail(Icons.thermostat, 'Feels like', '${w.feelsLike.round()}${w.unitSymbol}'),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 0.95,
      children: items.map((d) => _detailCard(d)).toList(),
    );
  }

  Widget _detailCard(_Detail d) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(d.icon, color: Colors.white, size: 26),
          const SizedBox(height: 8),
          Text(d.value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(d.label,
              style: const TextStyle(color: Colors.white70, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _forecast(Weather w) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(18),
      ),
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      child: Column(
        children: [
          for (var i = 0; i < w.daily.length; i++) ...[
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
                  if (w.daily[i].rainSlots.isNotEmpty)
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
            if (i != w.daily.length - 1)
              Divider(color: Colors.white.withValues(alpha: 0.12), height: 1),
          ],
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
  _Detail(this.icon, this.label, this.value);
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
