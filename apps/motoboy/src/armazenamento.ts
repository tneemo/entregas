// Token no SecureStore (cofre do Android); na web, localStorage só para desenvolvimento.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHAVE_TOKEN = 'entregas.token';

export async function lerToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(CHAVE_TOKEN) ?? null;
  return SecureStore.getItemAsync(CHAVE_TOKEN);
}

export async function salvarToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(CHAVE_TOKEN, token);
    else globalThis.localStorage?.removeItem(CHAVE_TOKEN);
    return;
  }
  if (token) await SecureStore.setItemAsync(CHAVE_TOKEN, token);
  else await SecureStore.deleteItemAsync(CHAVE_TOKEN);
}
