import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text as NativeText, TextInput, useColorScheme, View, type TextProps, type TextInputProps } from 'react-native';
export function usePalette() {
  return useColorScheme() === 'dark'
    ? { bg:'#201812', text:'#FFF7ED', card:'#30241C', border:'#715949', gold:'#C98A2E', coral:'#FF9079' }
    : { bg:'#FFF7ED', text:'#2B1A12', card:'#FFFFFF', border:'#CBB9A8', gold:'#C98A2E', coral:'#E85D3F' };
}
export function Text({style,...props}:TextProps) {
  const c=usePalette(); return <NativeText {...props} style={[{fontSize:17,lineHeight:25,color:c.text},style]} />;
}
export function Button({title,onPress,disabled,secondary}: {title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean;color?:string}) {
  const c=usePalette();return <Pressable accessibilityRole="button" accessibilityState={{disabled:!!disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>({minHeight:48,paddingHorizontal:18,paddingVertical:10,alignItems:'center',justifyContent:'center',borderRadius:28,backgroundColor:secondary?c.card:c.gold,borderColor:secondary?c.border:c.gold,borderWidth:1,opacity:disabled?.55:pressed?.8:1})}>
    <Text style={{fontWeight:'700',textAlign:'center',color:secondary?c.text:'#2B1A12'}}>{title}</Text></Pressable>;
}
export function Field({label,...props}:TextInputProps & {label:string}) {
  const c=usePalette();return <View style={{gap:6}}><Text style={{fontWeight:'600'}}>{label}</Text><TextInput {...props} accessibilityLabel={label} autoCapitalize={props.autoCapitalize??'none'} placeholderTextColor={c.text+'99'} style={{backgroundColor:c.card,color:c.text,borderColor:c.border,borderWidth:1,padding:12,minHeight:48,fontSize:17,borderRadius:16}} /></View>;
}
export function Card({children}:PropsWithChildren) {
  const c=usePalette();return <View style={[styles.card,{backgroundColor:c.card}]}>{children}</View>;
}
export function Progress({step,total}:{step:number;total:number}) {
  const c=usePalette();return <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:total,now:step}} style={{height:8,borderRadius:8,overflow:'hidden',backgroundColor:c.border}}>
    <View style={{height:8,width:`${step/total*100}%`,backgroundColor:c.gold}} /></View>;
}
const styles=StyleSheet.create({card:{padding:20,gap:16,borderRadius:16,shadowColor:'#2B1A12',shadowOffset:{width:0,height:4},shadowOpacity:0.1,shadowRadius:12,elevation:3}});

