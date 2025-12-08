import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * Get backend API base URL from config or use default
 * 
 * This is the URL for the backend services (NextAuth, API endpoints)
 * Separate from the web mobile app URL (localhost:3001)
 */
const getApiBaseUrl = (): string => {
  const apiUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (apiUrl) return apiUrl;
  
  // Default to the backend services URL (without trailing slash)
  return 'https://trashed.ngrok.app';
};

const API_BASE_URL = getApiBaseUrl();
const SESSION_COOKIE_KEY = 'nextauth_session_cookie';
const CSRF_TOKEN_KEY = 'nextauth_csrf_token';

export interface NextAuthUser {
  id: string;
  uuid: string;
  email: string;
  name: string | null;
  image: string | null;
  roles?: string[];
  vendor?: any;
  emailVerified?: Date | null;
  phone?: string | null;
}

export interface NextAuthSession {
  user: NextAuthUser;
  expires: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: NextAuthUser;
}

/**
 * Get CSRF token from NextAuth
 * Also stores the CSRF token cookie for use in subsequent requests
 */
async function getCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf`);
    const data = await response.json();
    const csrfToken = data.csrfToken || null;
    
    // Extract and store CSRF token cookie from response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader && csrfToken) {
      // NextAuth sets CSRF token cookies in multiple formats
      // Look for both __Host-next-auth.csrf-token and next-auth.csrf-token
      const cookies = setCookieHeader.split(',').map(c => c.trim());
      
      // Find __Host-next-auth.csrf-token (preferred format)
      let csrfCookie = cookies.find(c => c.includes('__Host-next-auth.csrf-token'));
      if (!csrfCookie) {
        // Fallback to next-auth.csrf-token
        csrfCookie = cookies.find(c => c.includes('next-auth.csrf-token') && !c.includes('__Host'));
      }
      
      if (csrfCookie) {
        // Extract the cookie value (format: cookie-name=value; attributes)
        const match = csrfCookie.match(/csrf-token=([^;]+)/);
        if (match) {
          const cookieValue = match[1].trim();
          // Store the full cookie value (may be URL encoded)
          await AsyncStorage.setItem(CSRF_TOKEN_KEY, cookieValue);
          console.log('Stored CSRF token cookie');
        }
      }
    }
    
    return csrfToken;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    return null;
  }
}

/**
 * Store session cookie from response
 */
async function storeSessionCookie(setCookieHeader: string | null): Promise<void> {
  if (!setCookieHeader) return;
  
  // Extract all cookies from Set-Cookie header
  const cookies = setCookieHeader.split(',').map(c => c.trim());
  
  // Find NextAuth session cookie
  const sessionCookie = cookies.find(c => 
    c.includes('next-auth.session-token') || 
    c.includes('__Secure-next-auth.session-token') ||
    c.includes('__Host-next-auth.session-token')
  );
  
  if (sessionCookie) {
    // Store the full cookie string
    await AsyncStorage.setItem(SESSION_COOKIE_KEY, sessionCookie);
  }
  
  // Store CSRF token if present
  const csrfCookie = cookies.find(c => c.includes('next-auth.csrf-token'));
  if (csrfCookie) {
    const match = csrfCookie.match(/next-auth\.csrf-token=([^;]+)/);
    if (match) {
      await AsyncStorage.setItem(CSRF_TOKEN_KEY, match[1]);
    }
  }
}

/**
 * Get stored session cookie
 */
async function getSessionCookie(): Promise<string | null> {
  return await AsyncStorage.getItem(SESSION_COOKIE_KEY);
}

/**
 * Get stored CSRF token
 */
async function getStoredCsrfToken(): Promise<string | null> {
  return await AsyncStorage.getItem(CSRF_TOKEN_KEY);
}

/**
 * Build headers for authenticated requests
 */
async function buildAuthHeaders(includeContentType: boolean = true): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  
  const sessionCookie = await getSessionCookie();
  
  if (sessionCookie) {
    // Send the cookie in the Cookie header
    headers['Cookie'] = sessionCookie;
  }
  
  return headers;
}

/**
 * Login with email and password using mobile auth endpoint
 * Uses the dedicated /api/auth/mobile/login endpoint
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  try {
    // Use the dedicated mobile login endpoint
    const response = await fetch(`${API_BASE_URL}/api/auth/mobile/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    console.log('Mobile login response status:', response.status);
    console.log('Mobile login response content-type:', response.headers.get('content-type'));

    // Extract and store session cookie from response
    const setCookieHeader = response.headers.get('set-cookie');
    console.log('Set-Cookie header:', setCookieHeader ? 'Present' : 'Missing');
    await storeSessionCookie(setCookieHeader);

    // Parse JSON response
    const data = await response.json();
    console.log('Mobile login response:', { success: data.success, hasUser: !!data.user });

    if (response.ok && data.success && data.user) {
      // Success - session cookie is already stored
      return { success: true, user: data.user };
    } else {
      // Error response
      return { success: false, error: data.error || 'Invalid email or password' };
    }
  } catch (error) {
    console.error('Mobile login error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Register a new user
 */
export async function register(email: string, password: string, name?: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        name: name || email.split('@')[0],
        companyName: name || email.split('@')[0],
        confirm: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Registration failed' };
    }

    // Automatically sign in after registration
    const loginResult = await login(email, password);
    return loginResult;
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Get current session
 */
export async function getSession(): Promise<AuthResponse & { session?: NextAuthSession }> {
  try {
    const headers = await buildAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok || !data.user) {
      // Clear invalid session
      await clearSession();
      return { success: false, error: 'Not authenticated' };
    }

    return { success: true, user: data.user, session: data };
  } catch (error) {
    console.error('Get session error:', error);
    await clearSession();
    return { success: false, error: 'Failed to get session' };
  }
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  try {
    const headers = await buildAuthHeaders();
    await fetch(`${API_BASE_URL}/api/auth/signout`, {
      method: 'POST',
      headers,
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await clearSession();
  }
}

/**
 * Clear stored session tokens
 */
async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_COOKIE_KEY, CSRF_TOKEN_KEY]);
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to send reset email' };
    }

    return { success: true };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

