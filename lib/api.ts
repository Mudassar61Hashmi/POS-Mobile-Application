import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './config';

const TOKEN_KEY = 'pos_auth_token';
const TIMEOUT_MS = 10_000; // 10 seconds

export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const saveToken = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t);
export const removeToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Timed out connecting to: ${API_BASE}\nIs the POS server running?`);
    }
    throw new Error(`Cannot connect to: ${API_BASE}\nRun: adb reverse tcp:3000 tcp:3000`);
  } finally {
    clearTimeout(timer);
  }
}
