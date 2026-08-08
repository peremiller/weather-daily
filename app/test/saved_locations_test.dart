// Headless verification of the multiple-saved-locations flow — the one thing
// the CanvasKit web preview could not drive with synthetic taps.
//
// Uses an injected fake WeatherService so nothing touches the network: the
// fake echoes the requested place name back as the forecast's location, so
// switching cities is observable in the header.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:weather_daily/models/weather.dart';
import 'package:weather_daily/screens/home_screen.dart';
import 'package:weather_daily/services/weather_service.dart';

/// Returns canned weather for whatever place is requested — no HTTP.
class _FakeWeatherService extends WeatherService {
  @override
  Future<Weather> getWeather(double lat, double lon, String placeName) async {
    return Weather(
      locationName: placeName,
      temperature: 26,
      feelsLike: 28,
      humidity: 80,
      windSpeed: 10,
      code: 3,
      tempMax: 29,
      tempMin: 25,
      precipProbability: 40,
      sunrise: DateTime(2026, 7, 20, 5, 40),
      sunset: DateTime(2026, 7, 20, 18, 20),
      daily: [
        DailyForecast(
          date: DateTime(2026, 7, 20),
          code: 3,
          tempMax: 29,
          tempMin: 25,
          precipProbability: 40,
        ),
      ],
      hourly: [
        HourlyForecast(
            time: DateTime(2026, 7, 20, 12),
            temp: 26,
            code: 3,
            precipProbability: 40),
      ],
      unitSymbol: '°C',
      now: '2026-07-20T12:00',
    );
  }
}

void main() {
  Widget app() => MaterialApp(home: HomeScreen(service: _FakeWeatherService()));

  testWidgets('saved-locations sheet lists cities and switches on tap',
      (tester) async {
    // Seed two saved cities; Manila is first, so it loads by default.
    SharedPreferences.setMockInitialValues({
      'places_v2': jsonEncode([
        {'lat': 14.6, 'lon': 121.0, 'name': 'Manila'},
        {'lat': 10.3, 'lon': 123.9, 'name': 'Cebu City'},
      ]),
    });

    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    // Default city loaded into the header.
    expect(find.text('Manila'), findsWidgets);

    // Open the saved-locations sheet from the header bookmarks button.
    await tester.tap(find.byTooltip('Saved locations'));
    await tester.pumpAndSettle();

    // Sheet shows its title and both saved cities.
    expect(find.text('Saved locations'), findsOneWidget);
    expect(find.text('Cebu City'), findsOneWidget);

    // Tapping a city switches to it (sheet closes, header updates).
    await tester.tap(find.text('Cebu City'));
    await tester.pumpAndSettle();

    expect(find.text('Saved locations'), findsNothing); // sheet dismissed
    expect(find.text('Cebu City'), findsWidgets); // now the current place
  });

  testWidgets('empty state invites adding a city', (tester) async {
    SharedPreferences.setMockInitialValues({}); // no saved places

    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Saved locations'));
    await tester.pumpAndSettle();

    expect(find.text('Saved locations'), findsOneWidget);
    expect(find.textContaining('No saved places yet'), findsOneWidget);
    expect(find.text('Add city'), findsOneWidget);
  });
}
