import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { legalDocs, type LegalDocKey } from '../lib/legal';
import { Button, Card, Text, usePalette } from './ui';

export function LegalModal({ doc, onClose }: { doc: LegalDocKey | null; onClose: () => void }) {
  const c = usePalette();
  if (!doc) return null;
  const content = legalDocs[doc];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={{ gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center', padding: 24 }}
        >
          <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700' }}>
            {content.title}
          </Text>
          <Text style={{ fontSize: 14, opacity: 0.75 }}>{content.updated}</Text>
          {content.sections.map((section) => (
            <Card key={section.heading}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', fontSize: 18 }}>{section.heading}</Text>
                <Text>{section.body}</Text>
              </View>
            </Card>
          ))}
          <Button title="Close" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
