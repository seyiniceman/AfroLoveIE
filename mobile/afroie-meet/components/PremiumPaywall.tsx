import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  FALLBACK_PRICE,
  loadPremiumOffering,
  purchasePremiumPackage,
  restorePremiumPurchases,
} from '../lib/purchases';
import { rpc, type Entitlements } from '../lib/social';
import { Button, Card, Text, usePalette } from './ui';

const comparisons: { feature: string; free: string; premium: string }[] = [
  { feature: 'Daily introductions', free: '5 / day', premium: 'Unlimited' },
  { feature: 'See who liked you', free: 'Latest 1', premium: 'Everyone' },
  { feature: 'Advanced filters (Religion, Origin, Verified)', free: 'Basic only', premium: 'Unlocked' },
  { feature: 'Read receipts in Chat', free: '—', premium: 'Included' },
  { feature: 'Profile Boost', free: '—', premium: '1× / week' },
];

type Props = {
  visible: boolean;
  entitlements: Entitlements | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

export function PremiumPaywall({ visible, entitlements, onClose, onRefresh }: Props) {
  const c = usePalette();
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [priceLabel, setPriceLabel] = useState(FALLBACK_PRICE);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    setError('');
    setNotice('');
    loadPremiumOffering()
      .then((res) => {
        if (!alive) return;
        setPkg(res.pkg);
        setPriceLabel(res.priceLabel);
        setConfigured(res.configured);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  if (!visible) return null;

  const isPremium = Boolean(entitlements?.is_premium);
  const boostedUntil = entitlements?.boosted_until ? new Date(entitlements.boosted_until) : null;
  const nextBoostAt = entitlements?.next_boost_at ? new Date(entitlements.next_boost_at) : null;

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!pkg) {
        setNotice(
          Platform.OS === 'web'
            ? 'Subscriptions are purchased via Apple App Store or Google Play inside the iOS/Android app (powered by RevenueCat).'
            : configured
              ? 'No RevenueCat offering is available yet. Configure the "premium" entitlement and monthly package (€14.99) in RevenueCat.'
              : 'Set EXPO_PUBLIC_REVENUECAT_IOS_KEY or EXPO_PUBLIC_REVENUECAT_ANDROID_KEY in .env to enable live store purchases.'
        );
        return;
      }
      const result = await purchasePremiumPackage(pkg);
      if (result.cancelled) return;
      if (result.active) {
        setNotice('Welcome to AfroIE Meet Premium! Syncing your subscription…');
        await onRefresh();
      } else {
        setNotice('Purchase received. Your entitlement will unlock shortly once store confirmation finishes.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete subscription.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const restored = await restorePremiumPurchases();
      await onRefresh();
      setNotice(restored ? 'Premium subscription restored.' : 'No active Premium subscription was found to restore.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to restore purchases.');
    } finally {
      setBusy(false);
    }
  }

  async function boostNow() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await rpc<string>('activate_boost');
      await onRefresh();
      setNotice('Boost active! Your profile is prioritised in Discovery for 30 minutes.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to activate Boost.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={{ gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center', padding: 24 }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.gold, fontWeight: '700', fontSize: 15 }}>AFROIE MEET PREMIUM</Text>
            <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700' }}>
              {isPremium ? 'You are a Premium member' : `Upgrade for ${priceLabel}`}
            </Text>
            <Text>
              Connect without limits across Dublin and Ireland with full visibility, read receipts, and weekly profile boosts.
            </Text>
          </View>

          {loading && <ActivityIndicator />}
          {!!error && <Text accessibilityRole="alert" style={{ color: c.coral, fontWeight: '600' }}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={{ fontWeight: '600' }}>{notice}</Text>}

          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: c.border, paddingBottom: 10 }}>
              <Text style={{ flex: 2, fontWeight: '700' }}>Feature</Text>
              <Text style={{ flex: 1, fontWeight: '700', textAlign: 'center' }}>Free</Text>
              <Text style={{ flex: 1, fontWeight: '700', textAlign: 'center', color: c.gold }}>Premium</Text>
            </View>
            {comparisons.map((row) => (
              <View
                key={row.feature}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderColor: c.border + '55',
                }}
              >
                <Text style={{ flex: 2, fontSize: 15 }}>{row.feature}</Text>
                <Text style={{ flex: 1, fontSize: 14, textAlign: 'center', opacity: 0.75 }}>{row.free}</Text>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'center', color: c.gold }}>
                  {row.premium}
                </Text>
              </View>
            ))}
          </Card>

          {isPremium ? (
            <Card>
              <Text style={{ fontWeight: '700', fontSize: 18 }}>Weekly Profile Boost</Text>
              {boostedUntil ? (
                <Text>Boost is active until {boostedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</Text>
              ) : entitlements?.can_boost ? (
                <>
                  <Text>Put your profile at the top of Discovery for 30 minutes (available once every 7 days).</Text>
                  <Button title="Activate 30-min Boost" disabled={busy} onPress={() => void boostNow()} />
                </>
              ) : (
                <Text>
                  Next weekly Boost available{' '}
                  {nextBoostAt ? nextBoostAt.toLocaleDateString() : 'in 7 days'}.
                </Text>
              )}
              {entitlements?.expires && (
                <Text style={{ fontSize: 14, opacity: 0.75 }}>
                  Current period ends {new Date(entitlements.expires).toLocaleDateString()}.
                </Text>
              )}
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              <Button title={`Subscribe · ${priceLabel}`} disabled={busy || loading} onPress={() => void subscribe()} />
              <Button secondary title="Restore purchases" disabled={busy || loading} onPress={() => void restore()} />
              <Text style={{ fontSize: 13, opacity: 0.75, textAlign: 'center' }}>
                Auto-renewable monthly subscription ({priceLabel}) managed via Apple App Store / Google Play and RevenueCat. Cancel anytime in your store settings.
              </Text>
            </View>
          )}

          <Button secondary title="Close" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
