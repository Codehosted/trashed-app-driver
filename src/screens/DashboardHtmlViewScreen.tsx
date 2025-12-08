import React, { useEffect } from 'react';
import { HtmlContentView } from '@/components/HtmlContentView';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import * as authService from '@/services/auth';

export const DashboardHtmlViewScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, loading: authLoading, isAuthEnabled } = useAuth();

  // Redirect to native login if auth is required but user is not logged in
  useEffect(() => {
    if (!authLoading && isAuthEnabled && !user) {
      console.log('DashboardHtmlViewScreen: Redirecting to native login (no user)');
      navigation.navigate('NativeLogin' as never);
    }
  }, [authLoading, isAuthEnabled, user, navigation]);

  const handleNavigationChange = (path: string) => {
    // Handle navigation to different routes
    if (path.includes('login')) {
      navigation.navigate('LoginWebView' as never);
    } else if (path.includes('dashboard') || path.includes('vendor')) {
      // Already on dashboard
    }
  };

  // Don't render dashboard if not authenticated
  if (isAuthEnabled && !authLoading && !user) {
    return null; // Will redirect via useEffect
  }

  return (
    <HtmlContentView
      route="vendor/dashboard"
      onNavigationChange={handleNavigationChange}
    />
  );
};

