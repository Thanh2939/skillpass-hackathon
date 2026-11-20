import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { VerifyResultScreen } from '../../screens/VerifyResultScreen';

export default function VerifyResultRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <VerifyResultScreen code={code ?? 'SP-8F3A21'} />;
}
