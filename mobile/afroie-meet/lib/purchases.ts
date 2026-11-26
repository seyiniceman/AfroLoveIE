import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

export const PREMIUM_ENTITLEMENT_ID = 'premium';
export const FALLBACK_PRICE = '€14.99/month';

let configuredForUser: string | null = null;

function apiKeyForPlatform(): string | null {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() || null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim() || null;
  return null;
}

export function isRevenueCatConfigured(): boolean {
  return Platform.OS !== 'web' && !!apiKeyForPlatform();
}

export async function configurePurchases(userId: string): Promise<boolean> {
  const apiKey = apiKeyForPlatform();
  if (!apiKey || Platform.OS === 'web') return false;
  try {
    if (!configuredForUser) {
      Purchases.configure({ apiKey, appUserID: userId });
      configuredForUser = userId;
    } else if (configuredForUser !== userId) {
      await Purchases.logIn(userId);
      configuredForUser = userId;
    }
    return true;
  } catch {
    return false;
  }
}

export function hasActivePremium(info: CustomerInfo | null): boolean {
  if (!info) return false;
  return Boolean(info.entitlements.active[PREMIUM_ENTITLEMENT_ID]);
}

export async function loadPremiumOffering(): Promise<{
  pkg: PurchasesPackage | null;
  priceLabel: string;
  configured: boolean;
}> {
  if (!isRevenueCatConfigured() || !configuredForUser) {
    return { pkg: null, priceLabel: FALLBACK_PRICE, configured: false };
  }
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    const pkg = current?.monthly ?? current?.availablePackages?.[0] ?? null;
    const priceLabel = pkg?.product.priceString ? `${pkg.product.priceString}/month` : FALLBACK_PRICE;
    return { pkg, priceLabel, configured: true };
  } catch {
    return { pkg: null, priceLabel: FALLBACK_PRICE, configured: true };
  }
}

export async function purchasePremiumPackage(pkg: PurchasesPackage): Promise<{
  active: boolean;
  cancelled: boolean;
}> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { active: hasActivePremium(customerInfo), cancelled: false };
  } catch (err: unknown) {
    const code = (err as { code?: string; userCancelled?: boolean })?.code;
    const cancelled =
      Boolean((err as { userCancelled?: boolean })?.userCancelled) ||
      code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
    if (cancelled) return { active: false, cancelled: true };
    throw err;
  }
}

export async function restorePremiumPurchases(): Promise<boolean> {
  if (!isRevenueCatConfigured() || !configuredForUser) return false;
  const info = await Purchases.restorePurchases();
  return hasActivePremium(info);
}

export async function checkRevenueCatPremium(): Promise<boolean> {
  if (!isRevenueCatConfigured() || !configuredForUser) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasActivePremium(info);
  } catch {
    return false;
  }
}
