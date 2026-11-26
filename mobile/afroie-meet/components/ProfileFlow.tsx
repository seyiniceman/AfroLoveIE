import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pollAndDeliverNotifications, registerForPushNotifications } from '../lib/notifications';
import { age, blank, intents, locations, prompts, section, stageNames, type Form } from '../lib/profile';
import { checkRevenueCatPremium, configurePurchases } from '../lib/purchases';
import { rpc, type Entitlements, type MemberSettings } from '../lib/social';
import { supabase } from '../lib/supabase';
import { AdminDashboard } from './AdminDashboard';
import { PremiumPaywall } from './PremiumPaywall';
import { Photo, Photos, Voice } from './ProfileMedia';
import { SettingsCentre } from './SettingsCentre';
import { Social } from './Social';
import { Button, Card, Field, Progress, Text, usePalette } from './ui';

const tabs = ['Home', 'Likes', 'Matches', 'Chat', 'Profile'] as const;

function Select({ label, value, options, change }: { label: string; value: string; options: readonly string[]; change: (v: string) => void }) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '600' }}>{label}</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: 'hidden' }}>
        <Picker
          accessibilityLabel={label}
          selectedValue={value}
          onValueChange={change}
          dropdownIconColor={c.text}
          style={{ backgroundColor: c.card, color: c.text, minHeight: 48, fontSize: 17 }}
        >
          <Picker.Item label="Choose an option" value="" />
          {options.map((v) => (
            <Picker.Item key={v} label={v} value={v} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function Preview({ form, user, displayAge }: { form: Form; user: string; displayAge?: number }) {
  return (
    <Card>
      <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700' }}>
        {form.name}, {displayAge ?? age(form.dob)}
      </Text>
      <Text>{[form.gender, form.location, form.height + ' cm'].join(' · ')}</Text>
      <ScrollView horizontal accessibilityLabel="Profile photos" contentContainerStyle={{ gap: 10 }}>
        {form.photos.map((p) => (
          <Photo key={p} path={p} />
        ))}
      </ScrollView>
      <Text style={{ fontWeight: '700' }}>{form.intent}</Text>
      <Text>{[form.origin, form.languages, form.religion, form.ethnicity].filter(Boolean).join(' · ')}</Text>
      <Text>{'Kids: ' + form.kids + ' · Smoking: ' + form.smoking + ' · Drinking: ' + form.drinking}</Text>
      <Text>{form.education + ' · ' + form.occupation}</Text>
      <Text>{form.bio}</Text>
      {form.answers.map((a) => (
        <View key={a.prompt}>
          <Text style={{ fontWeight: '700' }}>{a.prompt}</Text>
          <Text>{a.answer}</Text>
        </View>
      ))}
      {!!form.voice && <Voice user={user} path={form.voice} preview />}
    </Card>
  );
}

export function ProfileFlow({ user, dob, signOut }: { user: string; dob: string; signOut: () => void }) {
  const c = usePalette();
  const cache = 'mobile-profile-v1:' + user;
  const [form, setForm] = useState<Form>(() => blank(dob));
  const [stage, setStage] = useState(1);
  const [serverStep, setServerStep] = useState(0);
  const [published, setPublished] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Home');
  const [chat, setChat] = useState<{ id: string; name: string } | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);

  const [settings, setSettings] = useState<MemberSettings | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [settingsModal, setSettingsModal] = useState<'settings' | 'safety' | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const refreshAccountMeta = useCallback(async () => {
    try {
      const [s, ent, rcActive] = await Promise.all([
        rpc<MemberSettings>('get_my_settings').catch(() => null),
        rpc<Entitlements>('my_entitlements').catch(() => null),
        checkRevenueCatPremium(),
      ]);
      if (s) setSettings(s);
      if (ent) {
        setEntitlements(rcActive && !ent.is_premium ? { ...ent, is_premium: true } : ent);
      }
    } catch {
      // Non-fatal metadata load
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase!.from('member_drafts').select('step,sections,published_at').eq('user_id', user).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      const row = r.data;
      const base = Object.assign(blank(dob), ...Object.values(row?.sections ?? {}));
      const step = row?.step ?? 1;
      const stored = await AsyncStorage.getItem(cache);
      const local = stored ? JSON.parse(stored) : null;
      if (!live) return;
      if (step < 9 && !row?.published_at && local && local.serverStep === step && local.stage <= step) {
        Object.assign(base, local.form);
        setStage(local.stage);
      } else {
        setStage(step);
      }
      base.dob = dob;
      setServerStep(step);
      setForm(base);
      setPublished(!!row?.published_at);
      setReady(true);
    })().catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [user, dob, cache, attempt]);

  useEffect(() => {
    void configurePurchases(user).then(() => refreshAccountMeta());
  }, [user, refreshAccountMeta]);

  useEffect(() => {
    if (!settings) return;
    void registerForPushNotifications(settings.notifications_enabled);
  }, [settings]);

  useEffect(() => {
    const enabled = settings?.notifications_enabled ?? true;
    void pollAndDeliverNotifications(user, enabled);
    const timer = setInterval(() => {
      void pollAndDeliverNotifications(user, enabled);
    }, 12000);
    return () => clearInterval(timer);
  }, [user, settings?.notifications_enabled]);

  useEffect(() => {
    if (!ready || published) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(cache, JSON.stringify({ stage, serverStep: serverStep || stage, form })).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [cache, form, stage, serverStep, ready, published]);

  function patch(v: Partial<Form>) {
    setForm((prev) => ({ ...prev, ...v }));
    setError('');
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await supabase!.rpc('save_member_step', { stage, entry: stage === 9 ? {} : section(form, stage) });
      if (r.error) throw new Error(r.error.message);
      if (stage === 9) {
        setPublished(true);
        setTab('Profile');
        await AsyncStorage.removeItem(cache);
        await refreshAccountMeta();
      } else {
        setServerStep(r.data.step);
        setStage(stage + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save profile.');
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Form, label: string, max = 160) => (
    <Field label={label} value={String(form[key] ?? '')} maxLength={max} onChangeText={(v) => patch({ [key]: v })} />
  );
  const select = (key: keyof Form, label: string, options: readonly string[]) => (
    <Select label={label} value={String(form[key] ?? '')} options={options} change={(v) => patch({ [key]: v })} />
  );
  const percent = Math.round((Math.min(stage - 1, 8) / 8) * 100);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          key={published ? tab : stage}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ width: '100%', maxWidth: 620, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: 16 }}
        >
          {!ready ? (
            <>
              <Text>{error || 'Opening your profile…'}</Text>
              {!!error && <Button title="Retry" onPress={() => setAttempt((v) => v + 1)} />}
            </>
          ) : published ? (
            <>
              <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 38, fontWeight: '700' }}>
                {tab}
              </Text>
              {tab === 'Profile' ? (
                <>
                  {(settings?.hidden || settings?.paused) && (
                    <Card>
                      <Text style={{ fontWeight: '700', color: c.coral }}>
                        {settings.paused ? 'Profile paused' : 'Profile hidden from Discovery'}
                      </Text>
                      <Text style={{ fontSize: 14 }}>
                        {settings.paused
                          ? 'Your profile is paused. Resume it in Settings to browse Discovery and receive introductions.'
                          : 'Your profile is hidden from Discovery. Existing matches and chats remain active.'}
                      </Text>
                    </Card>
                  )}

                  <Card>
                    <Text style={{ fontWeight: '700', fontSize: 18 }}>
                      {entitlements?.is_premium ? 'AfroIE Meet Premium · Active' : 'AfroIE Meet Free'}
                    </Text>
                    <Text style={{ fontSize: 14, opacity: 0.8 }}>
                      {entitlements?.is_premium
                        ? entitlements.boosted_until
                          ? 'Boost active now.'
                          : 'Unlimited introductions, See Who Liked You, Advanced Filters, Read Receipts & Weekly Boost.'
                        : 'Upgrade to €14.99/month for unlimited intros, See Who Liked You, Advanced Filters, Read Receipts & Weekly Boost.'}
                    </Text>
                    <Button
                      title={entitlements?.is_premium ? 'Manage Premium & Weekly Boost' : 'Upgrade to Premium (€14.99/mo)'}
                      onPress={() => setPaywallOpen(true)}
                    />
                  </Card>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Button secondary title="Settings" onPress={() => setSettingsModal('settings')} />
                    </View>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Button secondary title="Safety Centre" onPress={() => setSettingsModal('safety')} />
                    </View>
                  </View>

                  {entitlements?.is_admin && (
                    <Button title="Open Admin Dashboard" onPress={() => setAdminOpen(true)} />
                  )}

                  <Preview form={form} user={user} />
                  <Button secondary title="Sign out" onPress={signOut} />
                </>
              ) : (
                <Social
                  key={tab}
                  tab={tab}
                  user={user}
                  location={form.location}
                  thread={chat}
                  entitlements={entitlements}
                  paused={Boolean(settings?.paused)}
                  openPaywall={() => setPaywallOpen(true)}
                  openSafety={() => setSettingsModal('safety')}
                  open={(t) => {
                    setChat(t);
                    setTab('Chat');
                  }}
                  close={() => setChat(null)}
                />
              )}
            </>
          ) : (
            <>
              <Text>Step {stage} of 9</Text>
              <Progress step={stage} total={9} />
              <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 38, fontWeight: '700' }}>
                {stageNames[stage - 1]}
              </Text>
              {stage !== 9 && (
                <Card>
                  {stage === 1 && (
                    <>
                      {field('name', 'First name')}
                      <Text>Date of birth · {dob} (verified)</Text>
                      {field('gender', 'Gender')}
                      {select('location', 'Location', locations)}
                      <Field
                        label="Height in cm"
                        value={form.height}
                        keyboardType="number-pad"
                        maxLength={3}
                        onChangeText={(height) => patch({ height })}
                      />
                    </>
                  )}
                  {stage === 2 && (
                    <>
                      {field('origin', 'Country of origin')}
                      {field('languages', 'Languages')}
                      {field('religion', 'Religion')}
                      {field('ethnicity', 'Tribe or ethnicity (optional)')}
                    </>
                  )}
                  {stage === 3 && select('intent', 'Connection intention', intents)}
                  {stage === 4 && (
                    <>
                      {select('kids', 'Kids', ['I have children', 'I do not have children', 'Prefer not to say'])}
                      {select('smoking', 'Smoking', ['Never', 'Sometimes', 'Regularly', 'Prefer not to say'])}
                      {select('drinking', 'Drinking', ['Never', 'Sometimes', 'Regularly', 'Prefer not to say'])}
                      {field('education', 'Education')}
                      {field('occupation', 'Occupation')}
                    </>
                  )}
                  {stage === 5 && <Photos photos={form.photos} user={user} change={(photos) => patch({ photos })} />}
                  {stage === 6 &&
                    form.answers.map((answer, i) => (
                      <View key={i} style={{ gap: 10 }}>
                        <Select
                          label={'Prompt ' + (i + 1)}
                          options={prompts.filter((p) => p === answer.prompt || !form.answers.some((a) => a.prompt === p))}
                          value={answer.prompt}
                          change={(prompt) => patch({ answers: form.answers.map((a, j) => (j === i ? { ...a, prompt } : a)) })}
                        />
                        <Field
                          multiline
                          label={'Answer ' + (i + 1) + ' (30 characters minimum)'}
                          value={answer.answer}
                          maxLength={1000}
                          onChangeText={(v) => patch({ answers: form.answers.map((a, j) => (j === i ? { ...a, answer: v } : a)) })}
                        />
                      </View>
                    ))}
                  {stage === 7 && (
                    <>
                      <Field
                        label="Bio (100–500 characters)"
                        value={form.bio}
                        multiline
                        maxLength={500}
                        onChangeText={(bio) => patch({ bio })}
                      />
                      <Text>{form.bio.trim().length} / 500</Text>
                    </>
                  )}
                  {stage === 8 && (
                    <Voice
                      user={user}
                      path={form.voice}
                      setLocked={setAudioBusy}
                      change={(voice, duration) => patch({ voice, duration })}
                    />
                  )}
                </Card>
              )}
              {stage === 9 && (
                <>
                  <Text>Completeness: {percent}%</Text>
                  <Preview form={form} user={user} />
                </>
              )}
              {!!error && <Text accessibilityRole="alert" style={{ color: c.coral, fontWeight: '600' }}>{error}</Text>}
              <Button title={stage === 9 ? 'Publish profile' : 'Save and continue'} disabled={busy || audioBusy} onPress={save} />
              {stage > 1 && (
                <Button
                  secondary
                  title="Back"
                  disabled={busy || audioBusy}
                  onPress={() => {
                    setError('');
                    setStage(stage - 1);
                  }}
                />
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button secondary title="Settings & Safety" disabled={busy} onPress={() => setSettingsModal('settings')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button secondary title="Sign out" disabled={busy} onPress={signOut} />
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {published && (
          <View
            accessibilityRole="tablist"
            style={{ flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderColor: c.border }}
          >
            {tabs.map((name, i) => (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityLabel={name}
                accessibilityState={{ selected: tab === name }}
                onPress={() => setTab(name)}
                style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: i === 1 ? c.coral : c.text, fontSize: 20 }}>{['⌂', '♥', '◇', '✉', '○'][i]}</Text>
                <Text style={{ fontSize: 14, fontWeight: tab === name ? '700' : '400' }}>{name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>

      <SettingsCentre
        visible={settingsModal !== null}
        initialSection={settingsModal ?? 'settings'}
        userId={user}
        onClose={() => setSettingsModal(null)}
        onSettingsChanged={(next) => setSettings(next)}
        onAccountDeleted={async () => {
          setSettingsModal(null);
          signOut();
        }}
      />

      <PremiumPaywall
        visible={paywallOpen}
        entitlements={entitlements}
        onClose={() => setPaywallOpen(false)}
        onRefresh={refreshAccountMeta}
      />

      <AdminDashboard visible={adminOpen} onClose={() => setAdminOpen(false)} />
    </SafeAreaView>
  );
}
