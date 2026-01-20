import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export default function PushTest() {
  const testPushNotifications = async () => {
    try {
      // Check if physical device
      if (!Device.isDevice) {
        Alert.alert('Error', 'Must use physical device for push notifications');
        return;
      }

      Alert.alert('Step 1', 'Requesting permission...');

      // Request permission
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Cannot test without permission');
        return;
      }

      Alert.alert('Step 2', 'Getting push token...');

      // Get token
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;

      // Show token in alert (truncated for readability)
      const tokenPreview = token.substring(0, 50) + '...';
      Alert.alert('Token Received', tokenPreview);

      // Log full token to console
      console.log('Full Push Token:', token);

      Alert.alert('Step 3', 'Sending test notification...');

      // Send test notification to self
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: 'Test Notification',
          body: 'If you see this, push notifications work!',
        }),
      });

      const result = await response.json();
      console.log('Push API Result:', result);

      if (result.data?.status === 'ok') {
        Alert.alert(
          'Success! ✅',
          'Notification sent successfully. You should receive it within 10 seconds.\n\nCheck your device for the notification.'
        );
      } else {
        Alert.alert('Error', 'Failed to send notification:\n' + JSON.stringify(result, null, 2));
      }
    } catch (error: any) {
      console.error('Push test error:', error);
      Alert.alert('Error', error.message || 'Unknown error occurred');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Push Notification Test</Text>
      <Text style={styles.subtitle}>Phase 0: Pre-Implementation Validation</Text>

      <Text style={styles.instructions}>
        This test will:{'\n'}
        1. Request notification permission{'\n'}
        2. Get your push token{'\n'}
        3. Send a test notification{'\n\n'}

        IMPORTANT: Must be run on a physical device, not simulator.
      </Text>

      <Pressable style={styles.button} onPress={testPushNotifications}>
        <Text style={styles.buttonText}>Run Push Test</Text>
      </Pressable>

      <Text style={styles.note}>
        Check console logs for full token and API response
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  instructions: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    color: '#333',
  },
  button: {
    backgroundColor: '#111',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});
