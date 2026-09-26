import AsyncStorage from "@react-native-async-storage/async-storage";

export const INSTALL_ID_KEY = "lyriclab_install_id";

export async function getOrCreateInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (existing) return existing;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(INSTALL_ID_KEY, created);
  return created;
}