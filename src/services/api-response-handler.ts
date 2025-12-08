import AsyncStorage from '@react-native-async-storage/async-storage';
import * as authService from './auth';
import type { NextAuthUser } from './auth';

// Simple event emitter for React Native (Node.js events module not available)
class SimpleEventEmitter {
  private listeners: Map<string, Set<() => void>> = new Map();

  on(event: string, listener: () => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: () => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  emit(event: string) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener());
    }
  }
}

// Event emitter for notifying AuthContext of user data changes
const userDataEmitter = new SimpleEventEmitter();
export const USER_DATA_UPDATED_EVENT = 'userDataUpdated';

/**
 * Emit event when user data is updated
 */
function emitUserDataUpdated() {
  userDataEmitter.emit(USER_DATA_UPDATED_EVENT);
}

export { userDataEmitter };

const USER_STORAGE_KEY = 'driver_user';
const SESSION_STORAGE_KEY = 'driver_session';

/**
 * Handle API responses and update internal storage
 */
export async function handleApiResponse(
  endpoint: string,
  response: any,
  status: number
): Promise<void> {
  console.log('[API Response Handler] Handling response:', endpoint, status);

  // Handle authentication endpoints
  if (endpoint.includes('/api/auth/')) {
    await handleAuthResponse(endpoint, response, status);
  }

  // Handle user endpoints
  if (endpoint.includes('/api/user/')) {
    await handleUserResponse(endpoint, response, status);
  }

  // Handle session endpoint
  if (endpoint.includes('/api/auth/session')) {
    await handleSessionResponse(response, status);
  }
}

/**
 * Handle authentication API responses
 */
async function handleAuthResponse(
  endpoint: string,
  response: any,
  status: number
): Promise<void> {
  // Login success - session is set via cookies, but we can store user data
  if (endpoint.includes('/api/auth/callback/credentials') && status === 200) {
    // Session will be available via cookies, fetch it
    const sessionResponse = await authService.getSession();
    if (sessionResponse.success && sessionResponse.user) {
      await storeUserData(sessionResponse.user);
    }
  }

  // Signup success
  if (endpoint.includes('/api/auth/signup') && status === 200 && response.user) {
    await storeUserData(response.user);
  }

  // Session endpoint
  if (endpoint.includes('/api/auth/session')) {
    await handleSessionResponse(response, status);
  }
}

/**
 * Handle session API response
 */
async function handleSessionResponse(response: any, status: number): Promise<void> {
  if (status === 200 && response?.user) {
    await storeUserData(response.user);
    await storeSessionData(response);
  } else if (status === 401 || status === 403) {
    // Session expired or invalid
    await clearUserData();
  }
}

/**
 * Handle user API responses
 */
async function handleUserResponse(
  endpoint: string,
  response: any,
  status: number
): Promise<void> {
  if (status === 200 && response) {
    // Update user data if it's user info
    if (response.uuid || response.email) {
      await storeUserData(response);
    }
  }
}

/**
 * Store user data in AsyncStorage
 */
async function storeUserData(user: NextAuthUser | any): Promise<void> {
  try {
    const userData = {
      uid: user.uuid || user.id,
      email: user.email,
      displayName: user.name,
      photoURL: user.image,
      id: user.id,
      uuid: user.uuid,
      roles: user.roles,
      vendor: user.vendor,
      emailVerified: user.emailVerified,
      phone: user.phone,
    };
    
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    console.log('[API Response Handler] User data stored');
    emitUserDataUpdated();
  } catch (error) {
    console.error('[API Response Handler] Error storing user data:', error);
  }
}

/**
 * Store session data in AsyncStorage
 */
async function storeSessionData(session: any): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    console.log('[API Response Handler] Session data stored');
  } catch (error) {
    console.error('[API Response Handler] Error storing session data:', error);
  }
}

/**
 * Clear user data from AsyncStorage
 */
async function clearUserData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([USER_STORAGE_KEY, SESSION_STORAGE_KEY]);
    console.log('[API Response Handler] User data cleared');
    emitUserDataUpdated();
  } catch (error) {
    console.error('[API Response Handler] Error clearing user data:', error);
  }
}

