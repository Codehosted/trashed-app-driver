import React from 'react';
import { ApiWebView } from '@/components/ApiWebView';
import { handleApiResponse } from '@/services/api-response-handler';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import * as authService from '@/services/auth';

export const LoginWebViewScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();

  const handleApiResponseCallback = async (
    endpoint: string,
    response: any,
    status: number
  ) => {
    await handleApiResponse(endpoint, response, status);
    
    // If login/signup successful, update auth context and navigate
    if (
      (endpoint.includes('/api/auth/callback/credentials') || 
       endpoint.includes('/api/auth/signup')) &&
      status === 200
    ) {
      // Wait a bit for cookies to be set, then check session
      setTimeout(async () => {
        const sessionResponse = await authService.getSession();
        if (sessionResponse.success && sessionResponse.user) {
          // Navigate to dashboard
          navigation.navigate('DashboardWebView' as never);
        }
      }, 1000);
    }
    
    // Handle session response
    if (endpoint.includes('/api/auth/session') && status === 200 && response?.user) {
      // User is logged in, navigate to dashboard
      setTimeout(() => {
        navigation.navigate('DashboardWebView' as never);
      }, 500);
    }
  };

  const handleNavigationChange = (url: string) => {
    // If navigating away from login (e.g., to dashboard), handle it
    if (url.includes('/vendor/dashboard') || url.includes('/dashboard')) {
      navigation.navigate('DashboardWebView' as never);
    }
  };

  return (
    <ApiWebView
      route="login"
      onApiResponse={handleApiResponseCallback}
      onNavigationChange={handleNavigationChange}
    />
  );
};

