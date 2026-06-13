import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() => runApp(const WeatherDailyApp());

class WeatherDailyApp extends StatelessWidget {
  const WeatherDailyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'My Daily Weather',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2980B9)),
      ),
      home: const HomeScreen(),
    );
  }
}
