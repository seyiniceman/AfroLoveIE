import { Redirect, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LegalModal } from '../components/LegalModal';
import { LiveSelfie } from '../components/LiveSelfie';
import { ProfileFlow } from '../components/ProfileFlow';
import { Button, Field, Progress, Text, usePalette } from '../components/ui';
import type { LegalDocKey } from '../lib/legal';
import { pollAndDeliverNotifications } from '../lib/notifications';
import { supabase } from '../lib/supabase';

type Profile = {
  user_id: string;
  phone_verified: boolean;
  email_verified: boolean;
  date_of_birth: string | null;
  verification_status: string;
  selfie_verified: boolean;
};
type AccountStatus = { banned: boolean; banned_reason: string | null; is_admin: boolean };
type PublicScreen = 'onboarding' | 'signup' | 'login' | 'email';

const PENDING_LEGAL_KEY = 'pending-legal-acceptance';
const slides = [
  ['Welcome to AfroIE Meet', 'Connect with African and Afro-Caribbean communities across Ireland.'],
  ['Start with a conversation', 'Meet people for dating and friendship, at your own pace.'],
  ['Verify before you meet', 'Confirm your email and phone, your age, and a live selfie before entering Home.'],
];

export default function AuthFlow() {
  const colours = usePalette();
  const path = usePathname();
  const [publicScreen, setPublic] = useState<PublicScreen>('onboarding');
  const [slide, setSlide] = useState(0);
  const [userId, setId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const version = useRef(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [dob, setDob] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);

  const refresh = useCallback(async () => {
    const revision = ++version.current;
    try {
      if (!supabase) return;
      const session = await supabase.auth.getSession();
      if (session.error) throw session.error;
      const id = session.data.session?.user.id ?? null;
      if (revision !== version.current) return;
      setId(id);
      if (!id) {
        setProfile(null);
        setStatus(null);
        setApproved(false);
        return;
      }
      const pendingLegal = await AsyncStorage.getItem(PENDING_LEGAL_KEY).catch(() => null);
      if (pendingLegal === '1') {
        const recorded = await supabase.rpc('record_legal_acceptance');
        if (!recorded.error) await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
      }
      const [result, gate, acct] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id,email_verified,phone_verified,date_of_birth,verification_status,selfie_verified')
          .eq('user_id', id)
          .single(),
        supabase.rpc('verified_home'),
        supabase.rpc('account_status'),
      ]);
      if (result.error) throw result.error;
      if (gate.error) throw gate.error;
      if (revision === version.current) {
        setProfile(result.data as Profile);
        setApproved(gate.data === true);
        setStatus(acct.error ? { banned: false, banned_reason: null, is_admin: false } : (acct.data as AccountStatus));
      }
      void pollAndDeliverNotifications(id, true);
    } catch (cause) {
      if (revision === version.current) {
        setProfile(null);
        setApproved(false);
        setError(cause instanceof Error ? cause.message : 'Unable to check verification. Try again.');
      }
    } finally {
      if (revision === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const generation = version;
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const auth = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        version.current++;
        setApproved(false);
        setProfile(null);
        setStatus(null);
        setId(null);
        setCode('');
        setSentTo('');
        setPhone('');
        setDob('');
        setPublic('login');
      }
      clearTimeout(timer);
      timer = setTimeout(refresh, 0);
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      generation.current++;
      clearTimeout(timer);
      auth?.data.subscription.unsubscribe();
      foreground.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (profile?.verification_status !== 'pending' && !approved) return;
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [profile?.verification_status, approved, refresh]);

  const banned = Boolean(status?.banned);
  const verified =
    !banned &&
    !!userId &&
    profile?.user_id === userId &&
    approved &&
    profile.selfie_verified &&
    profile.email_verified &&
    profile.phone_verified &&
    !!profile.date_of_birth;
  const screen = loading
    ? 'splash'
    : !userId
      ? publicScreen
      : banned
        ? 'banned'
        : !profile
          ? 'retry'
          : !profile.email_verified
            ? 'email'
            : !profile.phone_verified
              ? 'phone'
              : !profile.date_of_birth
                ? 'dob'
                : !verified
                  ? 'selfie'
                  : 'home';

  if (!loading && path === '/home' && !verified) return <Redirect href="/" />;
  if (verified && path !== '/home') return <Redirect href="/home" />;

  function navigate(next: PublicScreen) {
    setPublic(next);
    setError('');
    setPassword('');
    setCode('');
  }

  async function act(task: (client: NonNullable<typeof supabase>) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!supabase) throw new Error('Supabase is not configured on this device.');
      await task(supabase);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed. Try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const action = (title: string, task: (client: NonNullable<typeof supabase>) => Promise<void>, disabled = false) => (
    <Button title={title} color={colours.gold} disabled={busy || disabled} onPress={() => void act(task)} />
  );
  const otp = (
    <Field
      label="6-digit code"
      keyboardType="number-pad"
      autoComplete="one-time-code"
      maxLength={6}
      value={code}
      onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
    />
  );
  const emailAddress = email.trim().toLowerCase();
  const titles = {
    splash: 'AfroIE Meet',
    onboarding: slides[slide][0],
    signup: 'Create an account',
    login: 'Log in',
    email: 'Verify your email',
    phone: 'Verify your phone',
    dob: 'Your date of birth',
    selfie: 'Selfie verification',
    home: 'Home',
    retry: 'Check verification',
    banned: 'Account suspended',
  };

  if (screen === 'home' && userId && profile?.date_of_birth) {
    return (
      <ProfileFlow
        key={userId}
        user={userId}
        dob={profile.date_of_birth}
        signOut={() =>
          void act(async (c) => {
            const r = await c.auth.signOut();
            if (r.error) throw r.error;
          })
        }
      />
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colours.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={[styles.brand, { color: colours.coral }]}>AfroIE Meet</Text>
          {screen === 'onboarding' ? (
            <Progress step={slide + 1} total={3} />
          ) : (
            ['signup', 'email', 'phone', 'dob', 'selfie'].includes(screen) && (
              <Progress step={['signup', 'email', 'phone', 'dob', 'selfie'].indexOf(screen) + 1} total={5} />
            )
          )}
          <Text accessibilityRole="header" style={styles.title}>
            {titles[screen]}
          </Text>
          {screen === 'splash' && <ActivityIndicator />}
          {screen === 'onboarding' && (
            <>
              <Text>{slide + 1} of 3</Text>
              <Text>{slides[slide][1]}</Text>
              <Button
                title={slide === 2 ? 'Create account' : 'Continue'}
                onPress={() => (slide < 2 ? setSlide(slide + 1) : navigate('signup'))}
              />
              <Button secondary title="Already a member? Log in" onPress={() => navigate('login')} />
            </>
          )}
          {(screen === 'signup' || screen === 'login') && (
            <>
              <Field label="Email" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
              <Field
                label="Password"
                secureTextEntry
                autoComplete={screen === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChangeText={setPassword}
              />
              {screen === 'signup' && (
                <View style={{ gap: 10 }}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: agreed }}
                    onPress={() => setAgreed((v) => !v)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: agreed ? colours.gold : colours.border,
                      backgroundColor: colours.card,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: agreed ? colours.gold : colours.border,
                        backgroundColor: agreed ? colours.gold : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {agreed && <Text style={{ color: '#2B1A12', fontWeight: '700', fontSize: 15, lineHeight: 18 }}>✓</Text>}
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>
                      I agree to the Terms, Privacy Policy &amp; Community Guidelines and confirm I am 18+.
                    </Text>
                  </Pressable>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Button secondary title="Terms" onPress={() => setLegalDoc('terms')} />
                    <Button secondary title="Privacy Policy" onPress={() => setLegalDoc('privacy')} />
                    <Button secondary title="Community Guidelines" onPress={() => setLegalDoc('guidelines')} />
                  </View>
                </View>
              )}
              {action(
                screen === 'signup' ? 'Sign up' : 'Log in',
                async (c) => {
                  if (screen === 'signup') {
                    if (!agreed) throw new Error('Please tick "I agree + I am 18+" before signing up.');
                    if (password.length < 8) throw new Error('Use at least eight characters.');
                  }
                  const credentials = { email: emailAddress, password };
                  const r =
                    screen === 'signup'
                      ? await c.auth.signUp({ ...credentials, options: { data: { legal_accepted: true, is_18_plus: true } } })
                      : await c.auth.signInWithPassword(credentials);
                  if (r.error?.code === 'email_not_confirmed') {
                    navigate('email');
                    return;
                  }
                  if (r.error) throw r.error;
                  if (screen === 'signup') {
                    await AsyncStorage.setItem(PENDING_LEGAL_KEY, '1').catch(() => {});
                  }
                  setPassword('');
                  setCode('');
                  if (!r.data.session) navigate('email');
                  await refresh();
                },
                screen === 'signup' && !agreed
              )}
              <Button
                secondary
                title={screen === 'signup' ? 'Already registered? Log in' : 'Create account'}
                onPress={() => navigate(screen === 'signup' ? 'login' : 'signup')}
              />
            </>
          )}
          {screen === 'email' && (
            <>
              <Text>Enter the code sent to {emailAddress || 'your registered email'}.</Text>
              {otp}
              {action('Verify email', async (c) => {
                if (!/^\d{6}$/.test(code)) throw new Error('Enter all six digits.');
                const r = await c.auth.verifyOtp({ email: emailAddress, token: code, type: 'email' });
                if (r.error) throw r.error;
                setCode('');
                await refresh();
              })}
              {action('Resend email code', async (c) => {
                const r = await c.auth.resend({ type: 'signup', email: emailAddress });
                if (r.error) throw r.error;
              })}
              {!userId && <Button secondary title="Back to login" onPress={() => navigate('login')} />}
            </>
          )}
          {screen === 'phone' && (
            <>
              <Field
                label="Phone number with country code"
                placeholder="+353…"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setSentTo('');
                  setCode('');
                }}
              />
              {action(sentTo ? 'Resend SMS code' : 'Send SMS code', async (c) => {
                const number = phone.replace(/[\s()-]/g, '');
                if (!/^\+[1-9]\d{7,14}$/.test(number)) throw new Error('Enter a phone number with its country code.');
                const r = await c.auth.updateUser({ phone: number });
                if (r.error) throw r.error;
                setSentTo(number);
                setCode('');
              })}
              {!!sentTo && (
                <>
                  {otp}
                  {action('Verify phone', async (c) => {
                    if (!/^\d{6}$/.test(code)) throw new Error('Enter all six digits.');
                    const r = await c.auth.verifyOtp({ phone: sentTo, token: code, type: 'phone_change' });
                    if (r.error) throw r.error;
                    setCode('');
                    await refresh();
                  })}
                </>
              )}
            </>
          )}
          {screen === 'dob' && (
            <>
              <Text>You must be at least 18 to join.</Text>
              <Field
                label="Date of birth (YYYY-MM-DD)"
                placeholder="YYYY-MM-DD"
                value={dob}
                onChangeText={setDob}
                maxLength={10}
              />
              {action('Save date of birth', async (c) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new Error('Use YYYY-MM-DD.');
                const r = await c.rpc('record_birthdate', { birthdate: dob });
                if (r.error) throw r.error;
                await refresh();
              })}
            </>
          )}
          {screen === 'selfie' && (
            <>
              <Text accessibilityRole="alert">
                {profile?.verification_status === 'pending'
                  ? 'Pending review. Your selfie has been submitted.'
                  : profile?.verification_status === 'rejected'
                    ? 'Retake requested. Follow the pose below.'
                    : 'Live selfie required.'}
              </Text>
              {profile?.verification_status === 'pending' ? (
                action('Refresh status', refresh)
              ) : (
                <LiveSelfie
                  busy={busy}
                  submit={(bytes) =>
                    act(async (c) => {
                      const r = await c.storage
                        .from('verification-selfies')
                        .upload(userId + '/' + Date.now() + '.jpg', bytes, { contentType: 'image/jpeg', upsert: false });
                      if (r.error) throw r.error;
                      await refresh();
                    })
                  }
                />
              )}
            </>
          )}
          {screen === 'banned' && (
            <>
              <Text accessibilityRole="alert">
                This account has been suspended for breaching AfroIE Meet&apos;s Community Guidelines.
              </Text>
              {!!status?.banned_reason && <Text style={{ opacity: 0.8 }}>Reason: {status.banned_reason}</Text>}
              <Button secondary title="Read Community Guidelines" onPress={() => setLegalDoc('guidelines')} />
            </>
          )}
          {screen === 'retry' && action('Try again', refresh)}

          {!!error && (
            <Text accessibilityRole="alert" style={{ color: colours.coral, fontWeight: '600' }}>
              {error}
            </Text>
          )}
          {!!userId &&
            action('Sign out', async (c) => {
              const r = await c.auth.signOut();
              if (r.error) throw r.error;
            })}
        </ScrollView>
      </KeyboardAvoidingView>
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 480, padding: 24, gap: 16 },
  brand: { fontWeight: '700', fontSize: 18 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
});
