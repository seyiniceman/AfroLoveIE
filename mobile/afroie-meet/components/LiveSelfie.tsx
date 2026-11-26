import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Text } from './ui';

export function LiveSelfie({ submit, busy }: { submit: (bytes: ArrayBuffer) => Promise<void>; busy: boolean }) {
  const [permission, request] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState('');
  async function capture() {
    setTaking(true);
    setError('');
    try {
      if (Platform.OS === 'web') {
        const video = document.querySelector('video');
        if (!video) throw new Error('Camera preview is unavailable.');
        await video.play();
        const deadline = Date.now() + 8000;
        while (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          if (Date.now() >= deadline) throw new Error('Waiting for your camera. Try again when you see the preview.');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      const picture = await camera.current?.takePictureAsync({ quality: 0.55, base64: true, imageType: "jpg" });
      if (!picture?.base64) throw new Error('No image was captured. Try again.');
      const bytes = Uint8Array.from(atob(picture.base64.replace(/^data:image\/jpeg;base64,/, "")), (char) => char.charCodeAt(0));
      if (bytes.length > 5242880) throw new Error('Image too large. Please retake the photo.');
      await submit(bytes.buffer);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Camera capture failed.'); }
    finally { setTaking(false); }
  }
  return <View style={{ gap: 14 }}>
    <Text style={{ fontSize: 22 }}>✋</Text>
    <Text>Face the camera and hold one open palm beside your cheek. A reviewer will check this pose. Only reviewers can see your submission.</Text>
    {permission?.granted ? <>
      <CameraView ref={camera} facing="front" style={{ width: '100%', height: 300 }} onCameraReady={() => setReady(true)}
        onMountError={() => { setReady(false); setError('Camera unavailable. Check camera access and try again.'); }} />
      <Button title="Take and submit selfie" disabled={busy || taking || !ready} onPress={capture} />
    </> : <Button title="Allow camera access" onPress={async () => { const result = await request(); if (!result.granted) setError('Allow camera access in your device settings to continue.'); }} />}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
  </View>;
}

