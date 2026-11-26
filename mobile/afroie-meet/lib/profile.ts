export const stageNames=['Your details','Culture and roots','Your intention','Everyday life','Your photos','Conversation prompts','About you','Voice intro','Profile preview'];
export const locations=[...Array.from({length:24},(_,i)=>'Dublin '+(i+1)),'Cork','Galway','Limerick'];
export const intents=['Serious Relationship','Marriage','Dating','Friendship','Networking'];
export const prompts=['My ideal Saturday in Ireland…','A tradition I would love to share…','My favourite way to meet someone…','A skill I could teach you…','My friends know me for…','A place I want to explore…'];
export type Answer={prompt:string;answer:string};
export type Form={name:string;dob:string;gender:string;location:string;height:string;origin:string;languages:string;religion:string;ethnicity:string;intent:string;kids:string;smoking:string;drinking:string;education:string;occupation:string;photos:string[];answers:Answer[];bio:string;voice?:string;duration?:number};
export function blank(dob:string):Form{return {name:'',dob,gender:'',location:'',height:'',origin:'',languages:'',religion:'',ethnicity:'',intent:'',kids:'',smoking:'',drinking:'',education:'',occupation:'',photos:[],answers:Array.from({length:3},()=>({prompt:'',answer:''})),bio:''};}
export const fieldKeys: (keyof Form)[][]=[['name','dob','gender','location','height'],['origin','languages','religion','ethnicity'],['intent'],['kids','smoking','drinking','education','occupation'],['photos'],['answers'],['bio'],['voice','duration']];
export function section(form:Form,stage:number){return Object.fromEntries(fieldKeys[stage-1].filter(key=>form[key]!==undefined).map(key=>[key,typeof form[key]==='string'?(form[key] as string).trim():form[key]]));}
export function age(dob:string){const birth=new Date(dob+'T00:00:00Z'), now=new Date();return now.getUTCFullYear()-birth.getUTCFullYear()-Number(now.toISOString().slice(5,10)<dob.slice(5));}

