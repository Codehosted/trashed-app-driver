import React from 'react';
import { ApiWebView } from '@/components/ApiWebView';
import { handleApiResponse } from '@/services/api-response-handler';
import { useNavigation } from '@react-navigation/native';

export const DashboardWebViewScreen: React.FC = () => {
  const navigation = useNavigation();

  const handleApiResponseCallback = async (
    endpoint: string,
    response: any,
    status: number
  ) => {
    await handleApiResponse(endpoint, response, status);
    
    // If session expired, redirect to native login
    if (endpoint.includes('/api/auth/session') && (status === 401 || status === 403)) {
      navigation.navigate('NativeLogin' as never);
    }
  };

  const handleNavigationChange = (url: string) => {
    // Handle navigation to different routes
    if (url.includes('/login')) {
      // If web app tries to navigate to login, redirect to native login
      navigation.navigate('NativeLogin' as never);
    }
  };

  return (
    <ApiWebView
      route="vendor/dashboard"
      onApiResponse={handleApiResponseCallback}
      onNavigationChange={handleNavigationChange}
    />
  );
};
