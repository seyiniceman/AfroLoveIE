import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useSessionRefresh } from '../hooks/useSessionRefresh';
import { configureNotificationHandler } from '../lib/notifications';

export default function Layout() {
  useSessionRefresh();
  useEffect(() => {
    configureNotificationHandler();
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
