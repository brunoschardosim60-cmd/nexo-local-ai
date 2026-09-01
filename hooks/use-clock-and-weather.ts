'use client';

import { useEffect, useState } from 'react';

export type Weather = {
  label: string;
  temperature: number;
  apparent: number;
  wind: number;
  code: number;
};
type WeatherApiResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    wind_speed_10m: number;
    weather_code: number;
  };
};
type GeocodingApiResponse = {
  results?: Array<{
    name: string;
    admin1?: string;
    latitude: number;
    longitude: number;
  }>;
};

export function useClockAndWeather() {
  const [currentTime, setCurrentTime] = useState('');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');

  useEffect(() => {
    const updateClock = () =>
      setCurrentTime(
        new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(new Date()),
      );
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function fetchWeather(
    latitude: number,
    longitude: number,
    label: string,
  ) {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`,
    );
    if (!response.ok) throw new Error('weather');
    const current = ((await response.json()) as WeatherApiResponse).current;
    const next = {
      label,
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      wind: current.wind_speed_10m,
      code: current.weather_code,
    };
    setWeather(next);
    setWeatherStatus('idle');
    return next;
  }

  async function loadByCity(city: string) {
    if (!city.trim()) return null;
    setWeatherStatus('loading');
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`,
      );
      const place = ((await response.json()) as GeocodingApiResponse)
        .results?.[0];
      if (!place) throw new Error('city');
      return await fetchWeather(
        place.latitude,
        place.longitude,
        `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}`,
      );
    } catch {
      setWeatherStatus('error');
      setWeather(null);
      return null;
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setWeatherStatus('error');
      return;
    }
    setWeatherStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) =>
        void fetchWeather(
          position.coords.latitude,
          position.coords.longitude,
          'Sua localização',
        ).catch(() => setWeatherStatus('error')),
      () => setWeatherStatus('error'),
      { timeout: 12_000 },
    );
  }

  return { currentTime, weather, weatherStatus, loadByCity, useDeviceLocation };
}
