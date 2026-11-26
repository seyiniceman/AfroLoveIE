import type { PropsWithChildren } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from './ui';

export function Screen({ children }: PropsWithChildren) {
  const colours=usePalette();
  return <SafeAreaView style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, backgroundColor: colours.bg }}>{children}</SafeAreaView>;
}
