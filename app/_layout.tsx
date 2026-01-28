import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a365d' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="download" 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="index" 
          options={{ title: 'KVEC Triage' }} 
        />
        <Stack.Screen 
          name="results" 
          options={{ title: 'Triage Results' }} 
        />
      </Stack>
    </>
  );
}
