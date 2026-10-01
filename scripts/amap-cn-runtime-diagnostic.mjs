import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFirstJsonObject } from './cloudbase-cli-json.mjs';
import { runCommand } from './cloudbase-run-source-submitter.mjs';
import { wgs84Coordinates } from '../src/lib/providers/maps/types.ts';
import { wgs84ToGcj02 } from '../src/lib/providers/amap/coordinates.ts';

export async function diagnoseCnRuntime(stages, seal) {
  const envId = process.env.CLOUDBASE_ENV_ID;
  const name = `trip-route-diag-${process.env.GITHUB_RUN_ID}`;
  const cwd = await mkdtemp(join(tmpdir(), 'amap-cn-diagnostic-'));
  const auth = randomBytes(32).toString('hex');
  const cli = async (args, timeoutMs = 120_000) => {
    const result = await runCommand('npx', ['--yes', '--package', '@cloudbase/cli@3.8.1',
      'tcb', '--yes', '--env-id', envId, ...args, '--json'], { capture: true, timeoutMs, cwd });
    if (result.code !== 0) {
      seal({ diagnosticCliFailure: { args: args.slice(0, 3), output: result.output, error: result.errorOutput } });
      throw new Error('CN diagnostic CLI operation failed.');
    }
    try { return parseFirstJsonObject(result.output); }
    catch {
      if(args[0] === 'fn' && ['deploy', 'delete'].includes(args[1])) return {};
      seal({ diagnosticCliFailure: { args: args.slice(0,2), output: result.output, error: result.errorOutput } });
      throw new Error('CN diagnostic CLI response invalid.');
    }
  };
  let deployAttempted = false;
  try {
    await cli(['login', '--cloudbase-api-key', process.env.CLOUDBASE_API_KEY]);
    const detail = await cli(['cloudrun', 'detail', '--service-name', 'trip-planner-cn']);
    const environment = JSON.parse(detail.data.ServerConfig.EnvParams);
    const runtimeKey = environment.AMAP_WEB_SERVICE_KEY;
    if (!runtimeKey) throw new Error('CN runtime AMap key is absent.');
    console.log(JSON.stringify({ runtimeKeyMatchesWorkflow: runtimeKey === process.env.AMAP_WEB_SERVICE_KEY,
      siteUrlMatchesReported: environment.NEXT_PUBLIC_SITE_URL === 'https://cn.therewego.world',
      versions: detail.data.OnlineVersionInfos?.map(v => ({ name: v.VersionName, flow: v.FlowRatio })) }));
    const health = await fetch('https://cn.therewego.world/api/health', {signal: AbortSignal.timeout(15_000)});
    console.log(`Reported CN domain health: ${health.status}`);
    await mkdir(join(cwd, 'functions', name), { recursive: true });
    const publicKey = await readFile('/tmp/amap-diagnostic-public.pem', 'utf8');
    await writeFile(join(cwd, 'cloudbaserc.json'), JSON.stringify({ version: '2.0', envId,
      region: 'ap-shanghai', functionRoot: 'functions', functions: [{ name, type: 'Event',
        runtime: 'Nodejs18.15', handler: 'index.main', timeout: 120, memorySize: 256,
        installDependency: false, public: false,
        envVariables: { AMAP_WEB_SERVICE_KEY: runtimeKey, DIAGNOSTIC_AUTH: auth } }] }));
    await writeFile(join(cwd, 'functions', name, 'index.js'), `
const {createCipheriv,publicEncrypt,randomBytes}=require('node:crypto');
const publicKey=${JSON.stringify(publicKey)};
exports.main=async event=>{
  if(event.auth!==process.env.DIAGNOSTIC_AUTH || !Array.isArray(event.legs) || event.legs.length!==8) throw Error('Invalid diagnostic invocation');
  const results=new Array(8); let next=0;
  async function worker(){ while(next<8){const i=next++;const leg=event.legs[i];
    const url=new URL('https://restapi.amap.com/v3/direction/driving');
    for(const [k,v] of Object.entries({...leg,key:process.env.AMAP_WEB_SERVICE_KEY,extensions:'all',output:'json'}))url.searchParams.set(k,v);
    try{const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
      const raw=await response.text(); results[i]={position:i+1,httpStatus:response.status,raw};
    }catch(error){results[i]={position:i+1,errorName:error.name,errorMessage:error.message};}
  }}
  await Promise.all([worker(),worker(),worker()]);
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify({cnRuntimeResults:results})),cipher.final()]);
  return {encrypted:Buffer.from(JSON.stringify({key:publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})).toString('base64'),
    summary:results.map(r=>{let b;try{b=JSON.parse(r.raw)}catch{};return{position:r.position,httpStatus:r.httpStatus,errorName:r.errorName,status:b?.status,infoCode:b?.infocode,info:b?.info,distance:b?.route?.paths?.[0]?.distance}})};
};`);
    const coordinates = s => { const p = wgs84ToGcj02(wgs84Coordinates(s.latitude, s.longitude)); return `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`; };
    await writeFile(join(cwd, 'params.json'), JSON.stringify({auth,legs:stages.slice(0,-1).map((s,i)=>({origin:coordinates(s),destination:coordinates(stages[i+1])}))}));
    deployAttempted = true;
    await cli(['fn', 'deploy', name], 180_000);
    const invocation = await cli(['fn', 'invoke', name, '--data', '@params.json'], 180_000);
    seal({ invocationEnvelope: invocation });
    const rawResult = invocation.data?.RetMsg ?? invocation.data?.Response?.RetMsg ?? invocation.RetMsg;
    if (rawResult) {
      const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
      console.log('CN concurrent actual route results:', JSON.stringify(result.summary));
      if (result.encrypted) console.log(`AMAP_ENCRYPTED_DIAGNOSTIC=${result.encrypted}`);
    }
  } finally {
    if (deployAttempted) {
      await cli(['fn', 'delete', name]);
      const listed = await cli(['fn', 'list']);
      if (JSON.stringify(listed).includes(name)) throw new Error('CN diagnostic function residue detected.');
      console.log('Private CN diagnostic function deleted; residue audit passed.');
    }
    await rm(cwd, {recursive:true, force:true});
  }
}
