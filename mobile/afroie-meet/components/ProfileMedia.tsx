import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, View } from 'react-native';
import * as Picker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Audio } from 'expo-av';
import { supabase } from '../lib/supabase';
import { Button, Text, usePalette } from './ui';

async function upload(bucket:string,user:string,blob:ArrayBuffer,type:string,extension:string) {
  const key=user+'/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+extension;
  const r=await supabase!.storage.from(bucket).upload(key,blob,{contentType:type}); if(r.error)throw r.error;return key;
}
export function Photo({path,large=false}:{path:string;large?:boolean}) {
  const c=usePalette();
  const [uri,setUri]=useState('');
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let live=true;
    setUri('');
    setLoading(true);
    setFailed(false);
    if(!path){setLoading(false);setFailed(true);return}
    supabase!.storage.from('member-photos').createSignedUrl(path,3600).then(r=>{
      if(!live)return;
      if(r.data?.signedUrl){setUri(r.data.signedUrl)}else{setFailed(true)}
      setLoading(false);
    }).catch(()=>{if(live){setFailed(true);setLoading(false)}});
    return()=>{live=false};
  },[path,attempt]);
  const box={width:large?('100%' as const):140,height:large?320:140,borderRadius:16,backgroundColor:c.border+'44',overflow:'hidden' as const,alignItems:'center' as const,justifyContent:'center' as const};
  if(loading)return <View style={box}><ActivityIndicator color={c.gold}/></View>;
  if(failed||!uri)return <Pressable accessibilityRole="button" onPress={()=>setAttempt(v=>v+1)} style={box}><Text style={{fontSize:14,textAlign:'center',padding:8}}>Tap to reload photo</Text></Pressable>;
  return <Image accessibilityLabel="Profile photo" source={{uri}} resizeMode="cover" onError={()=>setFailed(true)} style={{width:large?'100%':140,height:large?320:140,borderRadius:16,backgroundColor:c.border+'44'}}/>;
}
export function Photos({photos,change,user}:{photos:string[];change:(value:string[])=>void;user:string}) {
  const [asset,setAsset]=useState<Picker.ImagePickerAsset|null>(null),[pos,setPos]=useState(.5),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState('');
  const cover=photos[0];
  useEffect(()=>{let active=true;setReview('');if(!cover)return;const load=async()=>{const r=await supabase!.rpc('request_cover_review',{photo:cover});if(active){if(r.error)setError(r.error.message);else setReview(r.data)}};void load();const timer=setInterval(load,6000);return()=>{active=false;clearInterval(timer)}},[cover]);
  async function pick(){try{setError('');const r=await Picker.launchImageLibraryAsync({mediaTypes:['images'],quality:1});if(!r.canceled){setAsset(r.assets[0]);setPos(.5)}}catch(e){setError(String(e))}}
  async function crop(){if(!asset||busy)return;setBusy(true);try{const side=Math.min(asset.width,asset.height);const rect={originX:Math.round((asset.width-side)*pos),originY:Math.round((asset.height-side)*pos),width:side,height:side};
    const result=await manipulateAsync(asset.uri,[{crop:rect},{resize:{width:900}}],{format:SaveFormat.JPEG,compress:.83,base64:true});
    const bytes=Uint8Array.from(atob(result.base64!),c=>c.charCodeAt(0));const key=await upload('member-photos',user,bytes.buffer,'image/jpeg','jpg');change([...photos,key]);setAsset(null);
  }catch(e){setError(String(e))}finally{setBusy(false)}}
  return <View style={{gap:12}}><Text>Add 3–6 photos. Choose a clear face photo first. A reviewer confirms the cover before you continue.</Text>
    {photos.map((path,i)=><View key={path} style={{gap:6}}><Photo path={path}/><Text>{i===0?'Cover · '+(review||'Checking'): 'Photo '+(i+1)}</Text>
      {i>0&&<Button secondary disabled={busy} title={'Move photo '+(i+1)+' earlier'} onPress={()=>{const next=[...photos];[next[i-1],next[i]]=[next[i],next[i-1]];change(next)}}/>}
      <Button secondary disabled={busy} title={'Remove photo '+(i+1)} onPress={()=>change(photos.filter(p=>p!==path))}/></View>)}
    {asset?<><View style={{width:200,height:200,borderRadius:16,overflow:'hidden'}}>
      <Image source={{uri:asset.uri}} accessibilityLabel="Crop preview" style={{position:'absolute',width:200*asset.width/Math.min(asset.width,asset.height),height:200*asset.height/Math.min(asset.width,asset.height),left:-200*pos*(asset.width/Math.min(asset.width,asset.height)-1),top:-200*pos*(asset.height/Math.min(asset.width,asset.height)-1)}}/>
    </View>
      <Text>Square crop · {pos===0?'start':pos===1?'end':'centre'}</Text><View style={{gap:6}}>{['Start','Centre','End'].map((label,i)=><Button secondary key={label} title={'Align '+label} onPress={()=>setPos(i/2)}/>)}</View>
      <Button disabled={busy} title="Save cropped photo" onPress={crop}/><Button secondary disabled={busy} title="Cancel crop" onPress={()=>setAsset(null)}/></>:photos.length<6&&<Button title="Choose photo" onPress={pick}/>}
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}</View>;
}

export function Voice({user,path,change,setLocked,preview=false,thread}:{thread?:string;user:string;path?:string;change?:(path?:string,duration?:number)=>void;setLocked?:(v:boolean)=>void;preview?:boolean}) {
  const bucket=thread?'chat-voice':'member-voice';
  const rec=useRef<Audio.Recording|null>(null),sound=useRef<Audio.Sound|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),live=useRef(true),working=useRef(false);
  const [recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{live.current=true;return()=>{live.current=false;clearTimeout(timeout.current);if(rec.current)void rec.current.stopAndUnloadAsync().catch(()=>{});rec.current=null;if(sound.current)void sound.current.unloadAsync()}},[]);
  useEffect(()=>{setLocked?.(recording||busy);return()=>setLocked?.(false)},[recording,busy,setLocked]);
  async function stop(){const r=rec.current;if(!r)return;rec.current=null;clearTimeout(timeout.current);setRecording(false);setBusy(true);
    try{const status=await r.stopAndUnloadAsync();const duration=status.durationMillis; if(duration>15000)throw Error('Recording exceeded 15 seconds. Please record again.');if(duration<1)throw Error('Record a short introduction first.');
      const uri=r.getURI();if(!uri)throw Error('Recording is unavailable.');
      const bytes=Platform.OS==='web'?await (await fetch(uri)).arrayBuffer():await new File(uri).arrayBuffer();
      if(!live.current)return;
      const web=Platform.OS==='web';const key=await upload(bucket,thread?thread+'/'+user:user,bytes,web?'audio/webm':'audio/mp4',web?'webm':'m4a');if(live.current)change?.(key,duration);
    }catch(e){if(live.current)setError(String(e))}finally{if(live.current)setBusy(false);void Audio.setAudioModeAsync({allowsRecordingIOS:false});}}
  async function start(){if(working.current||rec.current)return;working.current=true;setBusy(true);setError('');try{if(!(await Audio.requestPermissionsAsync()).granted)throw Error('Microphone permission is required.');
    await Audio.setAudioModeAsync({allowsRecordingIOS:true,playsInSilentModeIOS:true});const result=await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    if(!live.current){await result.recording.stopAndUnloadAsync();return;}rec.current=result.recording;setRecording(true);timeout.current=setTimeout(()=>void stop(),14800);
  }catch(e){setError(String(e))}finally{working.current=false;if(live.current)setBusy(false)}}
  async function play(){try{if(!path)return;const r=await supabase!.storage.from(bucket).createSignedUrl(path,600);if(r.error)throw r.error;if(sound.current)await sound.current.unloadAsync();const result=await Audio.Sound.createAsync({uri:r.data.signedUrl},{shouldPlay:true});sound.current=result.sound;}catch(e){setError(String(e))}}
  return <View style={{gap:8}}>{!preview&&<><Text>{thread?'Voice notes are reviewed for contact details and scam warnings before delivery.':'Optional · Record up to 15 seconds, or continue without audio.'}</Text><Button disabled={busy} title={recording?'Stop recording':thread?'Record voice note':'Record voice intro'} onPress={recording?stop:start}/></>}
    {path&&<><Button title={thread?"Play voice note":"Play voice intro"} secondary onPress={play}/>{!preview&&<Button secondary title={thread?"Discard note":"Remove voice intro"} onPress={()=>change?.()}/>}</>}
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}</View>;
}

