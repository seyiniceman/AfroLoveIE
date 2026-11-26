import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import type { LegalDocKey } from '../lib/legal';
import { registerForPushNotifications } from '../lib/notifications';
import { rpc, type BlockedUser, type MemberSettings } from '../lib/social';
import { supabase } from '../lib/supabase';
import { LegalModal } from './LegalModal';
import { Button, Card, Field, Text, usePalette } from './ui';

type Props = {
  visible: boolean;
  initialSection?: 'settings' | 'safety';
  userId: string;
  onClose: () => void;
  onSettingsChanged: (settings: MemberSettings) => void;
  onAccountDeleted: () => Promise<void>;
};

export function SettingsCentre({
  visible,
  initialSection = 'settings',
  userId,
  onClose,
  onSettingsChanged,
  onAccountDeleted,
}: Props) {
  const c = usePalette();
  const [section, setSection] = useState<'settings' | 'safety'>(initialSection);
  const [settings, setSettings] = useState<MemberSettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);

  // Tell a friend form
  const [dateName, setDateName] = useState('');
  const [venue, setVenue] = useState('');
  const [when, setWhen] = useState('');

  // GDPR Delete confirmation
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');

  useEffect(() => {
    if (visible) setSection(initialSection);
  }, [visible, initialSection]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, b] = await Promise.all([
        rpc<MemberSettings>('get_my_settings'),
        rpc<BlockedUser[]>('my_blocked_users'),
      ]);
      setSettings(s);
      setBlocked(b);
      onSettingsChanged(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, [onSettingsChanged]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  if (!visible) return null;

  async function toggleSetting(patch: { hidden?: boolean; paused?: boolean; notifications_enabled?: boolean }) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await rpc<MemberSettings>('update_my_settings', {
        p_hidden: patch.hidden ?? null,
        p_paused: patch.paused ?? null,
        p_notifications: patch.notifications_enabled ?? null,
      });
      setSettings(updated);
      onSettingsChanged(updated);
      if (patch.notifications_enabled !== undefined) {
        const push = await registerForPushNotifications(patch.notifications_enabled);
        setNotice(
          patch.notifications_enabled
            ? push.status === 'denied'
              ? 'Notifications enabled in account settings. Allow notifications in your phone Settings to receive push alerts.'
              : 'Notifications turned on.'
            : 'Notifications turned off.'
        );
      } else if (patch.hidden !== undefined) {
        setNotice(patch.hidden ? 'Your profile is now hidden from Discovery.' : 'Your profile is visible in Discovery again.');
      } else if (patch.paused !== undefined) {
        setNotice(patch.paused ? 'Your profile is paused. Discovery and new introductions are paused.' : 'Your profile is active again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update setting.');
    } finally {
      setBusy(false);
    }
  }

  async function unblock(peer: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await rpc('unblock_user', { target: peer });
      setBlocked((prev) => prev.filter((item) => item.peer !== peer));
      setNotice('Member unblocked.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to unblock member.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadData() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const bundle = await rpc<Record<string, unknown>>('export_my_data');
      const json = JSON.stringify(bundle, null, 2);
      const filename = `afroie-meet-data-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setNotice(`Downloaded ${filename}.`);
      } else {
        let savedPath = '';
        try {
          const out = new File(Paths.cache, filename);
          out.write(json);
          savedPath = out.uri;
        } catch {
          // Fallback to sharing JSON text directly if file write is unavailable.
        }
        await Share.share({
          title: 'My AfroIE Meet GDPR Data Export',
          message: savedPath ? `Your AfroIE Meet data export is saved at ${savedPath}\n\n${json}` : json,
          ...(savedPath ? { url: savedPath } : {}),
        });
        setNotice('Your GDPR data export is ready.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export your data.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (busy || deleteWord.trim().toUpperCase() !== 'DELETE') return;
    setBusy(true);
    setError('');
    try {
      await rpc('delete_my_account');
      await AsyncStorage.multiRemove([
        'mobile-profile-v1:' + userId,
        'discovery-filters:' + userId,
        'last-notif-id:' + userId,
      ]).catch(() => {});
      await supabase?.auth.signOut().catch(() => {});
      setConfirmDeleteOpen(false);
      await onAccountDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete account.');
    } finally {
      setBusy(false);
    }
  }

  async function shareDatePlan() {
    const details = [
      'AfroIE Meet — Date Safety Check-In',
      dateName.trim() ? `Meeting: ${dateName.trim()}` : null,
      venue.trim() ? `Location: ${venue.trim()}` : 'Location: Public venue in Ireland',
      when.trim() ? `Time: ${when.trim()}` : null,
      'Please check in with me later to make sure I got home safely.',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await Share.share({ title: 'My Date Safety Plan', message: details });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open Share sheet.');
    }
  }

  async function openExternal(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setError(`Unable to open ${url} on this device.`);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 16, width: '100%', maxWidth: 620, alignSelf: 'center', padding: 20 }}
          >
            <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700' }}>
              {section === 'settings' ? 'Settings' : 'Safety Centre'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Settings"
                  secondary={section !== 'settings'}
                  onPress={() => {
                    setError('');
                    setNotice('');
                    setSection('settings');
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Safety Centre"
                  secondary={section !== 'safety'}
                  onPress={() => {
                    setError('');
                    setNotice('');
                    setSection('safety');
                  }}
                />
              </View>
            </View>

            {!!error && <Text accessibilityRole="alert" style={{ color: c.coral, fontWeight: '600' }}>{error}</Text>}
            {!!notice && <Text accessibilityLiveRegion="polite" style={{ fontWeight: '600' }}>{notice}</Text>}

            {section === 'settings' ? (
              loading ? (
                <ActivityIndicator />
              ) : (
                <>
                  <Card>
                    <Text style={{ fontSize: 20, fontWeight: '700' }}>Visibility & Notifications</Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>Hide Profile</Text>
                        <Text style={{ fontSize: 14, opacity: 0.75 }}>
                          Hide your card from Discovery while keeping existing matches and chats.
                        </Text>
                      </View>
                      <Switch
                        accessibilityLabel="Hide Profile"
                        disabled={busy}
                        value={Boolean(settings?.hidden)}
                        onValueChange={(v) => void toggleSetting({ hidden: v })}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>Pause Profile</Text>
                        <Text style={{ fontSize: 14, opacity: 0.75 }}>
                          Take a break—hides you from Discovery and pauses new introductions.
                        </Text>
                      </View>
                      <Switch
                        accessibilityLabel="Pause Profile"
                        disabled={busy}
                        value={Boolean(settings?.paused)}
                        onValueChange={(v) => void toggleSetting({ paused: v })}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>Push Notifications</Text>
                        <Text style={{ fontSize: 14, opacity: 0.75 }}>
                          New introductions, matches, chat messages, and verification updates.
                        </Text>
                      </View>
                      <Switch
                        accessibilityLabel="Push Notifications"
                        disabled={busy}
                        value={settings?.notifications_enabled ?? true}
                        onValueChange={(v) => void toggleSetting({ notifications_enabled: v })}
                      />
                    </View>
                  </Card>

                  <Card>
                    <Text style={{ fontSize: 20, fontWeight: '700' }}>Blocked Users</Text>
                    {!blocked.length ? (
                      <Text style={{ opacity: 0.75 }}>You have not blocked anyone.</Text>
                    ) : (
                      blocked.map((item) => (
                        <View
                          key={item.peer}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                        >
                          <Text style={{ flex: 1, fontWeight: '600' }}>{item.name}</Text>
                          <Button secondary title="Unblock" disabled={busy} onPress={() => void unblock(item.peer)} />
                        </View>
                      ))
                    )}
                  </Card>

                  <Card>
                    <Text style={{ fontSize: 20, fontWeight: '700' }}>Your Data & Privacy (GDPR)</Text>
                    <Text style={{ fontSize: 14, opacity: 0.8 }}>
                      Download a complete JSON copy of your AfroIE Meet profile, introductions, matches, messages, and media records.
                    </Text>
                    <Button secondary title="Download My Data" disabled={busy} onPress={() => void downloadData()} />

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      <Button secondary title="Terms" onPress={() => setLegalDoc('terms')} />
                      <Button secondary title="Privacy Policy" onPress={() => setLegalDoc('privacy')} />
                      <Button secondary title="Guidelines" onPress={() => setLegalDoc('guidelines')} />
                    </View>
                  </Card>

                  <Card>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: c.coral }}>Delete Account (GDPR)</Text>
                    <Text style={{ fontSize: 14, opacity: 0.85 }}>
                      Permanently erases your account, verification selfie, profile photos, voice intros, chat voice notes, introductions, matches, and messages. This cannot be undone.
                    </Text>
                    {!confirmDeleteOpen ? (
                      <Button
                        secondary
                        title="Delete Account"
                        disabled={busy}
                        onPress={() => {
                          setDeleteWord('');
                          setConfirmDeleteOpen(true);
                        }}
                      />
                    ) : (
                      <View style={{ gap: 10 }}>
                        <Field
                          label='Type DELETE to confirm permanent erasure'
                          value={deleteWord}
                          onChangeText={setDeleteWord}
                          autoCapitalize="characters"
                        />
                        <Button
                          title="Permanently Delete Everything"
                          disabled={busy || deleteWord.trim().toUpperCase() !== 'DELETE'}
                          onPress={() => void deleteAccount()}
                        />
                        <Button secondary title="Cancel" onPress={() => setConfirmDeleteOpen(false)} />
                      </View>
                    )}
                  </Card>
                </>
              )
            ) : (
              <>
                <Card>
                  <Text style={{ fontSize: 20, fontWeight: '700' }}>Safety Tips</Text>
                  <Text>• Never send money, cryptocurrency, bank details, or gift cards to someone you met online.</Text>
                  <Text>• Keep conversations inside AfroIE Meet until you feel genuinely comfortable—contact details are blocked in the first 10 messages for your safety.</Text>
                  <Text>• Watch for pressure to move off-app quickly or stories asking for urgent financial help.</Text>
                  <Text>• Trust your instincts. Use Report, Block, or Unmatch in any chat header at any time.</Text>
                </Card>

                <Card>
                  <Text style={{ fontSize: 20, fontWeight: '700' }}>Meet in Public</Text>
                  <Text>• Always choose a busy, well-lit public café, restaurant, or cultural spot in Dublin, Cork, Galway, or Limerick for first meetings.</Text>
                  <Text>• Arrange your own transport to and from the date—do not share your home address early.</Text>
                  <Text>• Keep your phone charged and stay in control of your drinks and belongings.</Text>
                </Card>

                <Card>
                  <Text style={{ fontSize: 20, fontWeight: '700' }}>Tell a Friend</Text>
                  <Text style={{ fontSize: 14, opacity: 0.8 }}>
                    Share who you are meeting, where you are going, and when you expect to be home with someone you trust.
                  </Text>
                  <Field label="Who are you meeting? (optional)" value={dateName} onChangeText={setDateName} />
                  <Field label="Public venue / area" placeholder="e.g. Stephen's Green Café, Dublin 2" value={venue} onChangeText={setVenue} />
                  <Field label="Date & time" placeholder="e.g. Saturday at 2:00 PM" value={when} onChangeText={setWhen} />
                  <Button title="Share Date Plan with a Friend" onPress={() => void shareDatePlan()} />
                </Card>

                <Card>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: c.coral }}>Report to An Garda Síochána</Text>
                  <Text>
                    If you are in immediate danger, have experienced threats, stalking, sexual assault, or financial fraud in Ireland, contact An Garda Síochána directly.
                  </Text>
                  <Button title="Emergency · Call 999" onPress={() => void openExternal('tel:999')} />
                  <Button secondary title="EU Emergency · Call 112" onPress={() => void openExternal('tel:112')} />
                  <Button
                    secondary
                    title="Garda Confidential Line · 1800 666 111"
                    onPress={() => void openExternal('tel:1800666111')}
                  />
                  <Button
                    secondary
                    title="Report Online at garda.ie"
                    onPress={() => void openExternal('https://www.garda.ie/en/contact-us/')}
                  />
                  <Text style={{ fontSize: 14, opacity: 0.8 }}>
                    Support in Ireland: Women&apos;s Aid 24hr Helpline 1800 341 900 · Men&apos;s Aid 01 554 3811 · Dublin Rape Crisis Centre 1800 77 8888.
                  </Text>
                </Card>
              </>
            )}

            <Button secondary title="Close" onPress={onClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </Modal>
  );
}
