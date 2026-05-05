import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { MapDashboard } from '@/components/MapDashboard';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteDetail'>;

export const RouteDetailScreen: React.FC<Props> = ({ route }) => {
  return <MapDashboard route={route.params.route} />;
};
