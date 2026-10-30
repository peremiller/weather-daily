import {cp,mkdir,rm} from 'node:fs/promises';
import {buildOffline} from './offline/build.mjs';
await rm('public/offline',{recursive:true,force:true});await mkdir('public/offline',{recursive:true});await cp('offline-src','public/offline',{recursive:true});
const report=await buildOffline({directory:'public/offline',base:'/offline/',name:'Weather Daily',limits:'The complete local interface, last retrieved public forecasts and your plan save on this device. Fresh forecasts, server schedules and bot delivery require internet.'});console.log(JSON.stringify(report));
