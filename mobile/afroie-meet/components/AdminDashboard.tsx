import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rpc, type AdminDashboardData } from '../lib/social';
import { supabase } from '../lib/supabase';
import { Button, Card, Text, usePalette } from './ui';

function SelfiePreview({ path }: { path: string }) {
  const [uri, setUri] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setUri('');
    setFailed(false);
    supabase?.storage
      .from('verification-selfies')
      .createSignedUrl(path, 300)
      .then((res) => {
        if (!live) return;
        if (res.data?.signedUrl) setUri(res.data.signedUrl);
        else setFailed(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [path]);

  if (failed) return <Text style={{ fontSize: 14, opacity: 0.75 }}>Selfie image unavailable.</Text>;
  if (!uri) return <ActivityIndicator />;
  return (
    <Image
      accessibilityLabel="Pending verification selfie"
      source={{ uri }}
      style={{ width: '100%', height: 240, borderRadius: 12, backgroundColor: '#00000015' }}
      resizeMode="cover"
    />
  );
}

export function AdminDashboard({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = usePalette();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await rpc<AdminDashboardData>('admin_dashboard');
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  if (!visible) return null;

  async function runAction(task: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Moderation action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={{ gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700' }}>
              Admin Dashboard
            </Text>
            <Button secondary title="Refresh" disabled={busy || loading} onPress={() => void load()} />
          </View>

          {loading && <ActivityIndicator />}
          {!!error && <Text accessibilityRole="alert" style={{ color: c.coral, fontWeight: '600' }}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={{ fontWeight: '600' }}>{notice}</Text>}

          {!loading && data && (
            <>
              <Card>
                <Text style={{ fontSize: 20, fontWeight: '700' }}>
                  Pending Selfie Verifications ({data.pending_selfies.length})
                </Text>
                {!data.pending_selfies.length ? (
                  <Text style={{ opacity: 0.75 }}>No selfies waiting for review.</Text>
                ) : (
                  data.pending_selfies.map((item) => (
                    <View
                      key={item.user_id}
                      style={{
                        gap: 10,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderColor: c.border,
                      }}
                    >
                      <Text style={{ fontWeight: '700' }}>{item.name}</Text>
                      <Text style={{ fontSize: 14, opacity: 0.8 }}>
                        {item.email ?? 'No email'} · DOB {item.date_of_birth ?? 'Unknown'}
                      </Text>
                      <SelfiePreview path={item.selfie_path} />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Button
                          title="Approve"
                          disabled={busy}
                          onPress={() =>
                            void runAction(
                              () => rpc('admin_review_selfie', { target_user: item.user_id, approve: true }),
                              `Approved ${item.name}.`
                            )
                          }
                        />
                        <Button
                          secondary
                          title="Reject"
                          disabled={busy}
                          onPress={() =>
                            void runAction(
                              () => rpc('admin_review_selfie', { target_user: item.user_id, approve: false }),
                              `Rejected selfie for ${item.name}.`
                            )
                          }
                        />
                        <Button
                          secondary
                          title="Ban"
                          disabled={busy}
                          onPress={() =>
                            void runAction(
                              () => rpc('admin_ban_user', { target_user: item.user_id, reason: 'Failed selfie verification / policy breach' }),
                              `Banned ${item.name}.`
                            )
                          }
                        />
                      </View>
                    </View>
                  ))
                )}
              </Card>

              <Card>
                <Text style={{ fontSize: 20, fontWeight: '700' }}>
                  Safety Reports ({data.reports.length})
                </Text>
                {!data.reports.length ? (
                  <Text style={{ opacity: 0.75 }}>No reports submitted.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View style={{ minWidth: 560, gap: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 12,
                          paddingBottom: 8,
                          borderBottomWidth: 1,
                          borderColor: c.border,
                        }}
                      >
                        <Text style={{ width: 90, fontWeight: '700', fontSize: 14 }}>Status</Text>
                        <Text style={{ width: 120, fontWeight: '700', fontSize: 14 }}>Reported</Text>
                        <Text style={{ width: 110, fontWeight: '700', fontSize: 14 }}>Reporter</Text>
                        <Text style={{ width: 220, fontWeight: '700', fontSize: 14 }}>Reason</Text>
                      </View>
                      {data.reports.map((report) => (
                        <View
                          key={report.id}
                          style={{
                            gap: 8,
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderColor: c.border + '66',
                          }}
                        >
                          <View style={{ flexDirection: 'row', gap: 12 }}>
                            <Text
                              style={{
                                width: 90,
                                fontSize: 14,
                                fontWeight: '700',
                                color: report.status === 'open' ? c.coral : c.gold,
                              }}
                            >
                              {report.status.toUpperCase()}
                            </Text>
                            <Text style={{ width: 120, fontSize: 14 }}>
                              {report.peer_name}
                              {report.peer_banned ? ' (Banned)' : ''}
                            </Text>
                            <Text style={{ width: 110, fontSize: 14 }}>{report.reporter_name}</Text>
                            <Text style={{ width: 220, fontSize: 14 }}>{report.reason}</Text>
                          </View>
                          <Text style={{ fontSize: 12, opacity: 0.7 }}>
                            Filed {new Date(report.created_at).toLocaleString()}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            <Button
                              secondary
                              title="Approve / Resolve"
                              disabled={busy || report.status === 'resolved'}
                              onPress={() =>
                                void runAction(
                                  () => rpc('admin_resolve_report', { report_id: report.id, decision: 'resolved' }),
                                  'Report marked resolved.'
                                )
                              }
                            />
                            <Button
                              secondary
                              title="Reject / Dismiss"
                              disabled={busy || report.status === 'dismissed'}
                              onPress={() =>
                                void runAction(
                                  () => rpc('admin_resolve_report', { report_id: report.id, decision: 'dismissed' }),
                                  'Report dismissed.'
                                )
                              }
                            />
                            <Button
                              title="Ban User"
                              disabled={busy || !report.peer_id || report.peer_banned}
                              onPress={() =>
                                void runAction(
                                  () =>
                                    rpc('admin_resolve_report', {
                                      report_id: report.id,
                                      decision: 'banned',
                                      ban_reason: report.reason,
                                    }),
                                  `Banned ${report.peer_name}.`
                                )
                              }
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </Card>
            </>
          )}

          <Button secondary title="Close" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
