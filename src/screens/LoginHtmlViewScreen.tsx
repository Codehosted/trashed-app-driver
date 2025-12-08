import React from 'react';
import { HtmlContentView } from '@/components/HtmlContentView';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import * as authService from '@/services/auth';

export const LoginHtmlViewScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();

  const handleNavigationChange = (path: string) => {
    // Handle navigation to different routes
    if (path.includes('dashboard') || path.includes('vendor')) {
      // Check if user is logged in
      authService.getSession().then((sessionResponse) => {
        if (sessionResponse.success && sessionResponse.user) {
          navigation.navigate('DashboardWebView' as never);
        }
      });
    }
  };

  return (
    <HtmlContentView
      route="login"
      onNavigationChange={handleNavigationChange}
    />
  );
};

