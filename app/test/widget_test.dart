// Basic smoke test: the app builds and shows a loading indicator on start.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:weather_daily/main.dart';

void main() {
  testWidgets('App boots and shows a loading spinner', (WidgetTester tester) async {
    await tester.pumpWidget(const WeatherDailyApp());
    // On first frame the home screen is loading weather.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
