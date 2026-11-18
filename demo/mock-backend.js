/* Demo backend: stands in for native_carla.py so the passenger UI runs without CARLA.
 *
 * It intercepts fetch() for the lab server's API paths (/state, /api/*, /control,
 * /admin/api/*) and answers from a small scripted simulation that follows the
 * same state shape and request flow (midterm_study.StudyRequests). Everything
 * else goes to the network unchanged.
 *
 * Turn it off with ?backend=live (for example when this page is served by the
 * real lab server). Data stays in this browser: the drive in sessionStorage,
 * participants and trial records in localStorage.
 */
(()=>{
'use strict';
const query=new URLSearchParams(location.search);
if(query.get('backend')==='live'||window.HMI_LIVE_BACKEND){return}
const realFetch=window.fetch.bind(window);
// Keep WebGL pixels readable so page-capture tools (HTML to Figma) get the 3D road, not a blank canvas.
{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,attrs){if(/webgl/.test(type))attrs={...attrs,preserveDrawingBuffer:true};return getContext.call(this,type,attrs)}}
const DATA='/demo/data/';
let study=null;const studyReady=realFetch(DATA+'study.json').then(r=>r.json()).then(d=>{study=d});

// ---------- persistence ----------
const LOCAL='hmi-demo-records-v1',SESSION='hmi-demo-drive-v1';
function readJSON(store,key,fallback){try{return JSON.parse(store.getItem(key))??fallback}catch{return fallback}}
const records=readJSON(localStorage,LOCAL,{participants:[],current:null,trials:[],events:[]});
function saveRecords(){try{localStorage.setItem(LOCAL,JSON.stringify(records))}catch{}}
const uid=()=>crypto.randomUUID().replace(/-/g,'');
const utc=()=>new Date().toISOString();

// ---------- world geometry (CARLA convention: yaw in degrees, right = (-sin, cos)) ----------
const STEP=2,LENGTH=4200,WIDTH=3.5;
const centre=[];{let x=0,y=0;for(let s=0;s<=LENGTH;s+=STEP){const yaw=14*Math.sin(s/520)+6*Math.sin(s/170);centre.push([x,y,yaw]);const r=yaw*Math.PI/180;x+=Math.cos(r)*STEP;y+=Math.sin(r)*STEP}}
function sample(s,offset=0){const i=Math.max(0,Math.min(centre.length-2,Math.floor(s/STEP))),t=Math.max(0,Math.min(1,s/STEP-i)),a=centre[i],b=centre[i+1];
 const yaw=a[2]+(b[2]-a[2])*t,r=yaw*Math.PI/180,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;return [x-Math.sin(r)*offset,y+Math.cos(r)*offset,yaw]}
const LANES=[-WIDTH,0,WIDTH,2*WIDTH];
const atlas={map:'CARLA Town04 (demo)',destinations:[],buildings:[],roads:[
 ...LANES.map((o,i)=>({points:range(0,LENGTH,6).map(s=>sample(s,o).slice(0,2)),width:WIDTH,kind:'Driving',road_id:4,lane_id:-(i+1)})),
 {points:range(0,LENGTH,6).map(s=>sample(s,2.5*WIDTH+.4).slice(0,2)),width:2.6,kind:'Shoulder',road_id:4,lane_id:-5}]};
function range(a,b,step){const out=[];for(let v=a;v<=b;v+=step)out.push(v);return out}

// ---------- scenario profiles ----------
const PROFILES={congestion:'4차로 정체',night:'야간 졸음운전 차량',fog:'짙은 안개',yield:'보행자와 서로 양보',carpool:'카풀 대기 중 외부인 접근',rattle:'주행 중 반복되는 이상음',cargo:'도로 위 낙하물'};
const TUNING={
 congestion:{cruise:32,lead:28,gap:5.5,wide:28,onset:10,horn:2.2,layout:'four_lane_blockade'},
 night:{cruise:62,lead:58,gap:6.5,wide:28,onset:10,horn:.4,layout:'two_lane_boundary_weaving'},
 fog:{cruise:55,lead:50,gap:8,wide:36,onset:10,horn:.4},
 yield:{cruise:24,lead:null,gap:9,wide:28,onset:8,horn:.4},
 carpool:{cruise:0,lead:null,gap:9,wide:28,onset:6,horn:.4},
 rattle:{cruise:50,lead:46,gap:12,wide:28,onset:8,horn:.4},
 cargo:{cruise:58,lead:null,gap:9,wide:28,onset:10,horn:.4}};
const FEEDBACK={horn:'경적을 한 번 울렸어요. 앞차의 반응을 확인하고 있어요.',widen:'서서히 감속해 앞차와의 간격을 넓히고 있어요.',merge:'왼쪽 차로의 안전한 틈을 기다리고 있어요.',pass:'왼쪽 차로를 확인하고 앞차를 지나갈 공간을 살피고 있어요.',slow:'속도를 더 낮추고 주행 상태를 확인하고 있어요.',inspect:'주변과 차량 상태를 자세히 표시하고 있어요.',announce:'외부 스피커로 먼저 건너시라고 알렸어요. 정지한 채 반응을 확인해요.',creep:'보행자가 횡단 구간을 벗어났는지 확인하고 있어요.',support:'지원 요청을 접수했어요. 차량 상태를 확인하며 안내를 기다려요.',relocate:'주변 사람이 물러나면 대기 위치를 옮겨요.',safe_stop:'정차할 공간을 확인하고 감속하고 있어요.',end_ride:'안전하게 정차할 장소를 확인하고 있어요.',maintain:'현재 차량의 대응을 유지하고 있어요.',avoid:'옆 차로를 확인하고 낙하물을 피할 공간을 살피고 있어요.',stop:'낙하물 앞에서 간격을 두고 멈추고 있어요.',delegate:'정지 후 주변 공간이 확보되면 회피해요.',highbeam:'상향등을 두 번 점멸하고 주변 흐름을 확인합니다.'};
const RESULT={horn:'경적을 한 번 울렸어요. 앞차의 움직임을 살피며 주행했어요.',merge:'왼쪽 차로의 공간을 확인하고 차로를 변경했어요.',pass:'왼쪽 차로로 이동해 앞차를 지나갔어요.',slow:'속도를 더 낮추고 주행 상태를 확인했어요.',inspect:'주변 위치와 현재 차량 상태를 자세히 표시했어요. 확인되지 않은 원인은 계속 살피고 있어요.',announce:'먼저 건너시라고 안내한 뒤 보행자가 횡단 구간을 벗어나는 것을 확인했어요.',creep:'보행자가 횡단 구간을 벗어난 것을 확인한 뒤 서행으로 출발했어요.',support:'지원 요청을 접수했어요. 실제 상담원 연결은 아직 확인되지 않아 현재 차량 상태를 유지해요.',relocate:'주변 사람이 물러난 뒤 다른 대기 위치로 이동해 정차했어요.',maintain:'추가 요청 없이 현재 차량의 대응을 유지했어요.',avoid:'옆 차로로 이동해 낙하물을 지나갔어요.',delegate:'정지 후 주변을 확인하고 낙하물을 피해 지나갔어요.',stop:'낙하물 앞에서 간격을 두고 기다렸어요.',highbeam:'상향등을 두 번 점멸하고 주변 흐름을 확인했어요.'};
const CLASSIC_MAP={study_horn:'horn',study_distance:'widen',study_wait:'maintain',study_inspect:'inspect',study_stop_request:'safe_stop',study_highbeam:'highbeam',study_overtake:'pass'};

// ---------- the drive ----------
let sim=readJSON(sessionStorage,SESSION,null);
let speedFactor=Number(sessionStorage.getItem('hmi-demo-speed'))||1;
function blankSim(){return {phase:'choose',mode:'paused',quality:'high',profile:null,condition:'B',presentation:'midterm',language:'ko',error:null,frames:0,frame:0,preparingAt:0}}
if(!sim)sim=blankSim();
function saveSim(){try{sessionStorage.setItem(SESSION,JSON.stringify(sim))}catch{}}
function prepare(profile,condition='B',presentation='midterm',language='ko'){
 const t=TUNING[profile];
 Object.assign(sim,{phase:'preparing',frozen:false,mode:'paused',profile,condition,presentation,language,error:null,preparingAt:Date.now(),frames:0,
  session:uid(),elapsed:0,onset:false,onsetAt:null,completed:false,completion_reason:null,dialog_open:false,horn_count:0,
  speed:0,lead_speed:0,ego_s:120,offset:0,target_offset:0,lead_s:120+t.gap+4.6,lead_lateral:0,gap:t.gap,desired_gap:t.gap,
  feedback:'',last_action:null,action_complete:false,highbeam_at:null,cargo_hits:0,
  traffic:makeTraffic(profile),ped:profile==='yield'?{forward:16,right:5.5,crossed:false}:profile==='carpool'?{forward:-6,right:5,approach:0}:null,
  options_open:false,choice:null,requests:{},replies:{},
  study:{phase:'idle',action:null,pending_at:null,started_at:null,observed:0,stopped:0,status:null,summary:'',feedback:'',view_seen:false,repeat_count:0,service_end:false,fixed:false}});
 attachTrial();saveSim();
}
function makeTraffic(profile){
 if(profile==='congestion')return [{id:9101,lane:WIDTH,s:118,speed:26,len:12,wid:2.6,large:true},{id:9102,lane:WIDTH,s:150,speed:27,len:9,wid:2.5,large:true},
  ...[0,1,2,3].map(i=>({id:9201+i,lane:-WIDTH,s:40+i*70,speed:90,len:4.6,wid:1.9}))];
 if(profile==='night')return [{id:9301,lane:-WIDTH,s:60,speed:72,len:4.6,wid:1.9}];
 if(profile==='fog'||profile==='rattle')return [{id:9401,lane:WIDTH,s:170,speed:48,len:4.6,wid:1.9}];
 return [];
}
const T=()=>TUNING[sim.profile];
const hasLead=()=>T().lead!=null;
const live=()=>sim.phase==='live';

function log(event,extra={}){
 if(!sim.trialId)return;
 const trial=records.trials.find(t=>t.id===sim.trialId);if(!trial)return;
 const labels=Object.fromEntries([...(study?.options?.[sim.profile]||[]),{action:'study_maintain',label:'그냥 둘게요'},{action:'study_fixed_help',label:'도움 요청'},{action:'study_fixed_stop',label:'정차 요청'}].map(o=>[o.action,o.label]));
 const action=extra.action||extra.client_event?.choice||null;
 records.events.push({id:records.events.length+1,trial_id:trial.id,utc:utc(),elapsed_s:+sim.elapsed.toFixed(2),since_onset_s:sim.onsetAt==null?null:+(sim.elapsed-sim.onsetAt).toFixed(2),event,action,label:labels[action]||labels['study_'+action]||null,details:JSON.stringify(extra)});
 if(event==='scenario_onset')trial.onset_s=+sim.elapsed.toFixed(2);
 if(event==='navigation_study_choice'&&trial.selected_s==null)trial.selected_s=+sim.elapsed.toFixed(2);
 if(event==='request_execution_started'){trial.executed_s=+sim.elapsed.toFixed(2);trial.last_action=extra.action}
 if(event==='request_completed'||event==='trial_completed'){trial.completed=1;trial.result=extra.status||extra.reason;trial.finished_utc=utc()}
 saveRecords();
}
function attachTrial(){
 sim.trialId=null;const p=records.current;if(!p)return;
 records.trials.push({id:sim.session,participant_id:p.id,profile:sim.profile,condition:sim.condition,language:sim.language,created_utc:utc(),started_utc:null,finished_utc:null,onset_s:null,selected_s:null,executed_s:null,last_action:null,result:null,completed:0});
 sim.trialId=sim.session;saveRecords();
}

// ---------- study requests (port of midterm_study.StudyRequests, simplified physics) ----------
function schedule(action,fixed=false){
 const st=sim.study;
 if(!['idle','complete'].includes(st.phase))throw Error('요청을 진행 중이에요.');
 if(sim.completed)throw Error('주행이 끝났어요. 출발 설정에서 다시 준비해 주세요.');
 if(!fixed&&sim.presentation==='midterm'&&(sim.condition!=='B'||!sim.onset||!sim.dialog_open))throw Error('현재 상황을 먼저 확인해 주세요.');
 Object.assign(st,{action,phase:'queued',pending_at:sim.elapsed,feedback:'요청을 준비했어요. 3초 안에 취소할 수 있어요.',summary:'',status:null,view_seen:false,stopped:0,observed:0,fixed});
 log('request_queued',{action,countdown_s:3,condition:sim.condition,fixed_button:fixed});
}
function cancelStudy(){
 const st=sim.study;
 if(st.phase==='queued'){log('request_cancelled_before_execution',{action:st.action});Object.assign(st,{phase:'idle',action:null,pending_at:null,feedback:'요청을 취소했어요.'})}
 else if(['applying','observing'].includes(st.phase)){log('request_cancelled_after_execution',{action:st.action});Object.assign(st,{phase:'stopping',status:'cancelled',summary:'요청을 중단하고 차량이 정차했어요.',feedback:'요청을 중단하고 차량을 정지하고 있어요.'})}
 return st.feedback;
}
function execute(){
 const st=sim.study,a=st.action,t=T();
 Object.assign(st,{phase:'applying',started_at:sim.elapsed});sim.last_action=a;sim.action_complete=false;
 if(a==='horn')sim.horn_count++;
 if(a==='highbeam')sim.highbeam_at=sim.elapsed;
 if(a==='widen'||a==='slow')sim.desired_gap=Math.max(sim.desired_gap+8,t.wide);
 if(['merge','pass','avoid','delegate'].includes(a))sim.target_offset=-WIDTH;
 if(['safe_stop','end_ride'].includes(a)&&!['yield','carpool'].includes(sim.profile))sim.target_offset=2.5*WIDTH;
 if(a==='relocate'||(sim.profile==='carpool'&&a==='end_ride'))sim.ped&&(sim.ped.leaving=true);
 if(a==='announce'||a==='creep')sim.ped&&(sim.ped.crossing=true);
 st.feedback=FEEDBACK[a]||'요청을 반영하고 있어요.';sim.feedback=st.feedback;
 log('request_execution_started',{action:a,repeat_count:st.repeat_count});
}
function ready(age){
 const a=sim.study.action,sp=sim.speed;
 if(a==='horn'||a==='highbeam')return age>=3;
 if(a==='widen')return sim.gap>=sim.desired_gap-.8;
 if(a==='slow')return sp<=Math.max(13,T().cruise*.45)&&age>=4;
 if(a==='inspect')return sim.study.view_seen&&age>=3||age>=6;
 if(a==='merge')return Math.abs(sim.offset-sim.target_offset)<.8&&age>4;
 if(['pass','avoid','delegate'].includes(a))return Math.abs(sim.offset-sim.target_offset)<.8&&(!hasLead()||sim.ego_s>sim.lead_s+9)&&age>4;
 if(['safe_stop','end_ride','stop'].includes(a))return sp<.5&&age>=5;
 if(a==='announce'||a==='creep')return sim.ped?.crossed&&age>=4;
 if(a==='relocate')return age>=8;
 if(a==='support')return age>=8;
 return age>=8;
}
function describe(){
 const st=sim.study,a=st.action;
 if(st.status==='unfulfilled')return '요청한 동작의 완료를 확인하지 못했어요. 차량을 정지하고 주변을 확인해요.';
 if(a==='safe_stop'||a==='end_ride')return '확인한 정차 공간으로 이동해 멈췄어요.'+(a==='end_ride'?' 이용을 마칠 수 있어요.':' 주변 상황을 확인하고 있어요.');
 if(a==='widen')return `감속해 앞차와 약 ${sim.desired_gap}m 간격을 확보했어요.`;
 return RESULT[a]||'차량의 대응 결과를 확인했어요.';
}
function tickStudy(dt,driving){
 const st=sim.study;
 if(['idle','complete'].includes(st.phase))return;
 if(!driving&&st.phase!=='stopping')return;
 if(st.phase==='queued'){if(sim.elapsed-st.pending_at>=3)execute();return}
 const age=sim.elapsed-(st.started_at??sim.elapsed);
 if(st.phase==='applying'){
  const ok=ready(age);
  if(ok||age>=50){st.status=ok?(st.action==='support'?'partial':'achieved'):'unfulfilled';st.summary=describe();st.feedback=st.summary;sim.action_complete=ok;st.phase='observing';st.observed=0;
   log('request_result_observation',{action:st.action,status:st.status,summary:st.summary})}
 }else if(st.phase==='observing'){st.observed+=dt;if(st.observed>=12)st.phase='stopping'}
 else if(st.phase==='stopping'){st.stopped=sim.speed<.5?st.stopped+dt:0;
  if(st.stopped>=1){st.phase='complete';sim.completed=true;sim.completion_reason='action_outcome';st.service_end=st.action==='end_ride'&&st.status==='achieved';
   log('request_completed',{action:st.action,status:st.status,service_end:st.service_end})}}
}
function studyOutcome(){const st=sim.study;return {action:st.action,phase:st.phase==='queued'?'applying':st.phase,status:st.status,summary:st.summary,observed_s:+st.observed.toFixed(2),observe_s:12,elapsed_s:+Math.max(0,sim.elapsed-(st.started_at??sim.elapsed)).toFixed(2),message:st.phase==='complete'?'주변 상황을 확인했어요.':st.feedback}}
function studyPublic(){const st=sim.study;return {phase:st.phase,action:st.action,countdown_s:st.phase==='queued'?+Math.max(0,3-(sim.elapsed-st.pending_at)).toFixed(2):null,condition:sim.condition,
 cancellable:['queued','applying','observing'].includes(st.phase),repeatable:st.phase==='observing'&&['horn','widen','lateral','inspect'].includes(st.action),repeat_count:st.repeat_count,view_seen:st.view_seen,service_end:st.service_end,
 safe_bay:null,offset_m:sim.offset,request_elapsed_s:+Math.max(0,sim.elapsed-(st.started_at??sim.elapsed)).toFixed(2),source:'demo mock backend; scripted, not CARLA'}}

// ---------- kinematics ----------
function step(dt){
 if(!live())return;
 const driving=sim.mode==='auto',t=T(),st=sim.study;
 if(driving&&!sim.completed){
  sim.elapsed+=dt;
  if(!sim.onset&&sim.elapsed>=t.onset){sim.onset=true;sim.onsetAt=sim.elapsed;log('scenario_onset',{renderer:'demo',profile:sim.profile})}
 }
 // target speed
 let target=driving&&!sim.completed?t.cruise:0;
 if(sim.profile==='fog'&&sim.onset)target=Math.min(target,38);
 if(sim.profile==='yield'&&sim.onset&&!sim.ped.crossed)target=0;
 if(sim.profile==='yield'&&sim.ped?.crossed)target=Math.min(t.cruise,14);
 if(sim.profile==='cargo'&&sim.onset&&!['avoid','delegate'].includes(st.action))target=Math.min(target,Math.max(0,(130+t.onset*16-sim.ego_s)));
 if(sim.profile==='carpool')target=st.action==='relocate'&&st.phase==='applying'?8:0;
 if(['stopping','complete'].includes(st.phase)||st.status==='unfulfilled')target=0;
 if(['safe_stop','end_ride','stop'].includes(st.action)&&st.phase==='applying')target=Math.abs(sim.offset-sim.target_offset)<.4?0:Math.min(target,18);
 if(st.action==='slow'&&['applying','observing'].includes(st.phase))target=Math.min(target,Math.max(10,t.cruise*.4));
 if(st.action==='pass'&&st.phase==='applying'&&Math.abs(sim.offset+WIDTH)<.8)target=t.cruise+18;
 // following
 const leadTarget=hasLead()&&driving&&!sim.completed?t.lead+(sim.profile==='congestion'?6*Math.sin(sim.elapsed/7):0):0;
 sim.lead_speed=(sim.lead_speed||0)+Math.max(-12*dt,Math.min(7*dt,leadTarget-(sim.lead_speed||0)));const leadSpeed=sim.lead_speed;
 const sameLane=hasLead()&&Math.abs(sim.offset-sim.lead_lateral)<2.2;
 if(sameLane&&target>0){const follow=leadSpeed+2.2*(sim.gap-sim.desired_gap);target=Math.max(0,Math.min(target+12,follow))}
 const accel=target>sim.speed?7:12;sim.speed+=Math.max(-accel*dt,Math.min(accel*dt,target-sim.speed));if(sim.speed<.05)sim.speed=0;
 sim.ego_s+=sim.speed/3.6*dt;
 sim.offset+=Math.max(-1.3*dt,Math.min(1.3*dt,sim.target_offset-sim.offset));
 if(hasLead()){sim.lead_s+=leadSpeed/3.6*dt;sim.gap=Math.max(0,sim.lead_s-sim.ego_s-4.6);
  sim.lead_lateral=sim.profile==='night'&&sim.onset&&!sim.completed?1.25*Math.sin(sim.elapsed*.9):0}
 for(const v of sim.traffic){v.s+=v.speed/3.6*dt*(driving?1:0);if(v.speed>60&&v.s>sim.ego_s+160)v.s=sim.ego_s-90-Math.random()*40}
 if(sim.ped){
  if(sim.profile==='yield'){if(sim.ped.crossing&&!sim.ped.crossed){sim.ped.right-=1.1*dt;if(sim.ped.right<-6)sim.ped.crossed=true}
   else if(!sim.ped.crossing)sim.ped.right=5.5+.35*Math.sin(sim.elapsed*1.7)}
  if(sim.profile==='carpool'){if(sim.onset&&!sim.ped.leaving)sim.ped.approach=Math.min(1,sim.ped.approach+dt/4);if(sim.ped.leaving)sim.ped.approach=Math.max(-1,sim.ped.approach-dt/3)}
 }
 tickStudy(dt,driving);
 if(!sim.completed&&sim.elapsed>=300&&sim.speed<.5){sim.completed=true;sim.completion_reason='duration_end';log('trial_completed',{reason:'duration_end'})}
 sim.frame++;
}

// ---------- state builders ----------
function egoPose(){return sample(sim.ego_s,sim.offset)}
function local(x,y,angle,ex,ey,eyaw){const r=eyaw*Math.PI/180,dx=x-ex,dy=y-ey;return {forward_m:dx*Math.cos(r)+dy*Math.sin(r),right_m:-dx*Math.sin(r)+dy*Math.cos(r),up_m:-.4,yaw_deg:((angle-eyaw+180)%360+360)%360-180}}
function fogDensity(e){const u=Math.min(1,Math.max(0,(e-10)/5));return 99*u*u*(3-2*u)}
function scenarioPublic(){
 const t=T(),st=sim.study,midterm=sim.presentation==='midterm';
 const since=sim.highbeam_at==null?-1:sim.elapsed-sim.highbeam_at;
 const r={id:sim.profile==='congestion'?'congestion_long':sim.profile==='fog'?'dense_fog':sim.profile==='night'?'drowsy_night':sim.profile,session:sim.session,enabled:true,onset:sim.onset,
  elapsed_s:+sim.elapsed.toFixed(2),duration_s:300,remaining_s:Math.max(0,300-sim.elapsed),gap_m:+sim.gap.toFixed(2),target_gap_m:sim.desired_gap,horn_count:sim.horn_count,horn_duration_s:t.horn,
  collision_count:0,action:sim.last_action,action_complete:sim.action_complete,feedback:st.phase!=='idle'?st.feedback:sim.feedback,completed:sim.completed,completion_reason:sim.completion_reason,
  outcome:studyOutcome(),dialog_open:sim.dialog_open,high_beam:{on:(since>=0&&since<.6)||(since>=1.1&&since<1.7)},
  state_source:'demo mock backend; scripted, not CARLA'};
 if(st.phase==='idle')r.outcome={action:null,phase:'idle',status:null,summary:'',observed_s:0,observe_s:12,elapsed_s:0,message:''};
 if(t.layout)r.layout=t.layout;
 if(sim.profile==='fog'){const d=fogDensity(sim.elapsed);r.fog={density:d,stage:d===0?'clear':d>95?'dense':'thick'}}
 if(sim.profile==='cargo')r.cargo={impact_count:0};
 if(midterm)r.study=studyPublic();
 return r;
}
function bridgeState(){
 const s={kind:'hongik-native-carla',phase:sim.phase,renderer_backend:'demo',error:sim.error,lab_rig:false,mode:sim.mode,quality:sim.quality,width:1280,height:720,
  speed_kph:live()?+sim.speed.toFixed(2):0,frames:sim.frames,frame:sim.frame,target_fps:30,measured_fps:live()?30:0,presentation:sim.presentation,condition:sim.condition,demo:true};
 if(sim.profile){s.profile=sim.profile;s.route_length_m=LENGTH;s.lane_count=4}
 return {...s,scenario:live()?scenarioPublic():null};
}
function options(){
 if(sim.presentation==='midterm'){if(sim.condition==='A')return [];return [...(study?.options?.[sim.profile]||[]),{action:'study_maintain',scenario_action:'request_maintain',label:'그냥 둘게요',detail:'현재 차량의 대응을 유지해요.'}]}
 return study?.classic?.[sim.profile]||study?.classic?.night||[];
}
function navState(){
 if(!live())return {connected:false,reason:sim.error||'CARLA 도로와 차량을 준비하고 있어요.'};
 const [ex,ey,eyaw]=egoPose(),sc=scenarioPublic(),st=sim.study,midterm=sim.presentation==='midterm';
 const lanes=LANES.map((o,i)=>({id:i+1,points:range(-25,141,4).map(d=>{const [x,y,a]=sample(sim.ego_s+d,o);return {...local(x,y,a,ex,ey,eyaw),width_m:WIDTH}})}));
 const actors=[];
 const vehicle=(id,s,lane,len,wid,label,role,speed,large)=>{const [x,y,a]=sample(s,lane),p=local(x,y,a,ex,ey,eyaw);if(p.forward_m<-45||p.forward_m>180||Math.abs(p.right_m)>25)return;
  actors.push({id,kind:'vehicle',label,role,vehicle_type:large?'large':'car',length_m:len,width_m:wid,height_m:large?3.2:1.5,speed_kmh:speed,motion_source:'demo script',world_pose:{x,y,yaw:a},...p})};
 if(hasLead())vehicle(9001,sim.lead_s,sim.lead_lateral,4.6,1.9,'앞차','lead',T().lead,false);
 for(const v of sim.traffic)vehicle(v.id,v.s,v.lane,v.len,v.wid,'주변 차량','context',v.speed,v.large);
 if(sim.profile==='cargo'){const s=130+T().onset*16+6,[x,y,a]=sample(s,0);actors.push({id:9501,kind:'obstacle',label:'낙하물',role:'lead',length_m:1.1,width_m:1.4,height_m:.45,world_pose:{x,y,yaw:a},...local(x,y,a,ex,ey,eyaw)})}
 if(sim.ped){const p=sim.profile==='yield'?{forward:sim.ego_s<120+8?24-(sim.ego_s-120):16,right:sim.ped.right}:{forward:1.5-2*sim.ped.approach,right:2.4+1.6*(1-Math.abs(sim.ped.approach))};
  actors.push({id:9601,kind:'pedestrian',label:'보행자',role:'context',length_m:.5,width_m:.5,height_m:1.7,forward_m:p.forward,right_m:p.right,up_m:-.4,yaw_deg:90})}
 const active=sim.onset&&!sim.completed;
 const COPY=study?.copy?.[sim.profile]||['','',''];
 let title=active?COPY[0]:'주행 상황을 살피고 있습니다';
 const outcome=sc.outcome;
 if(outcome.phase!=='idle')title=sim.completed?'차량이 정차했습니다':'요청한 대응을 진행하고 있어요';
 const narration={text:outcome.phase!=='idle'?(outcome.message||sc.feedback):COPY[1]+' '+COPY[2],speaker:'Sohee',url:null,cached:false};
 let detail=`현재 속도 ${sim.speed.toFixed(0)} km/h · 앞차 간격 약 ${sim.gap.toFixed(1)} m`;
 const event={active,pending:outcome.phase!=='idle',outcome,feedback:sc.feedback,title,description:narration.text,narration,options:options(),live_detail:detail};
 const pts=range(0,LENGTH,6).map(s=>sample(s).slice(0,2));
 const data={connected:true,schema:2,map:'CARLA Town04 (demo)',source:'demo mock backend; scripted, not CARLA',frame:sim.frame,timestamp:Date.now()/1000,
  ego:{id:1,role:'native_carla_ego',forward_m:0,right_m:0,up_m:-.4,yaw_deg:0,speed_kmh:+sim.speed.toFixed(2),lane_index:Math.max(1,Math.min(4,2+Math.round(sim.offset/WIDTH))),lane_count:4,lane_id:-2},
  road:{id:4,lanes},lane_width_m:WIDTH,actors,destinations:[],world_pose:{x:ex,y:ey,yaw:eyaw},
  route:{destination:{id:'trial_end',name:'목적지',point:pts.at(-1),distance_m:LENGTH,detail:'경로 안내'},points:pts,index:Math.floor(sim.ego_s/6),remaining_m:Math.round(Math.max(0,300-sim.elapsed)*30/3.6),arrived:sim.completed&&sim.completion_reason==='duration_end',off_route:false},
  session:{session_id:sim.session,stage:sim.elapsed>0||sim.mode==='auto'?'running':'ready',scenario:{congestion:1,night:2,fog:3}[sim.profile]||4,
   navigation:{id:sim.session+'-weaving',status:'monitoring',map_label:PROFILES[sim.profile],title,body:narration.text,research_event:event}},
  nurec:{...bridgeState(),scenario:sc},renderer:'demo'};
 if(!midterm)return data;
 // midterm_study.enrich_navigation
 let [mt,situation,behavior]=COPY;
 if(!sim.onset){mt=sim.profile==='carpool'?'동승자를 기다리고 있어요':'경로를 따라 이동하고 있어요';situation='주변 교통과 주행 상태를 확인하고 있어요.'}
 detail=`현재 속도 ${sim.speed.toFixed(0)} km/h`+(['congestion','night','fog'].includes(sim.profile)?(['merge','pass'].includes(st.action)&&Math.abs(sim.offset+WIDTH)<.8?' · 왼쪽 차로 주행':` · 앞차 간격 약 ${sim.gap.toFixed(0)} m`):'');
 const level=sim.onsetAt==null?1:sim.elapsed-sim.onsetAt<15?1:sim.elapsed-sim.onsetAt<30?2:3;
 Object.assign(event,{title:mt,situation,vehicle_action:behavior,description:situation+' '+behavior,active:sim.onset&&!sim.completed&&st.phase==='idle'&&sim.condition==='B',
  pending:!['idle','complete'].includes(st.phase),feedback:st.feedback||sim.feedback,options:options(),staged_options:false,hide_eta:true,live_detail:detail,condition:sim.condition,level,study:studyPublic(),outcome:st.phase!=='idle'?studyOutcome():sc.outcome});
 event.narration={...event.narration,text:event.description};
 if(!['idle','queued'].includes(st.phase)){event.description=st.feedback;event.outcome=studyOutcome()}
 Object.assign(data.session.navigation,{title:mt,body:event.description});
 data.passive={title:mt,body:behavior,detail,door_locked:sim.profile==='carpool',physical_state_source:false,level:sim.onset?level:0};
 return data;
}

// ---------- commands (port of NavigationAdapter.command) ----------
function command(body){
 if(!live())throw Error('시나리오를 먼저 준비해 주세요.');
 if(body.session_id!==sim.session||body.navigation_id!==sim.session+'-weaving')throw Error('주행이 변경됐습니다. 현재 화면에서 다시 선택해 주세요.');
 const request=body.request_id;if(typeof request!=='string'||!request||request.length>128)throw Error('요청 ID가 필요합니다.');
 if(sim.requests[request]){if(sim.requests[request].action!==body.action)throw Error('같은 요청 ID에 다른 동작을 보낼 수 없습니다.');return sim.requests[request].queued}
 const action=body.action,details=body.client_event||{},opts=options(),st=sim.study;let message='확인했습니다.';
 const busy=()=>{if(!['idle','complete'].includes(st.phase))throw Error('선택한 요청을 진행하고 있어요. 취소하거나 결과를 확인해 주세요.')};
 if(opts.some(o=>o.action===action)){
  busy();if(sim.completed)throw Error('주행이 끝났습니다. 처음으로 돌아간 뒤 다시 선택해 주세요.');
  if(!sim.options_open||sim.choice!==action)throw Error('대응 방법을 선택한 뒤 실행해 주세요.');
  const chosen=opts.find(o=>o.action===action);log('navigation_execution_confirmed',{action,client_event:details});
  schedule(chosen.scenario_action?chosen.scenario_action.slice(8):CLASSIC_MAP[action]||'maintain');
  if(sim.presentation!=='midterm'){execute();st.phase='applying'}
  message=st.feedback;sim.options_open=false;sim.choice=null;
 }else if(['study_fixed_help','study_fixed_stop','study_cancel_pending','study_view_opened','study_repeat'].includes(action)){
  if(action==='study_cancel_pending')message=cancelStudy();
  else if(action==='study_view_opened'){st.view_seen=true;log('requested_view_exposed',{action:st.action});message='화면을 표시했어요.'}
  else if(action==='study_fixed_help'){schedule('support',true);message=st.feedback}
  else if(action==='study_fixed_stop'){schedule('safe_stop',true);message=st.feedback}
  else{if(st.phase!=='observing'||!['horn','widen','inspect'].includes(st.action))throw Error('현재 결과에서 반복할 수 있는 요청이 없어요.');
   const a=st.action;st.phase='idle';st.repeat_count++;log('request_repeat',{action:a,count:st.repeat_count});schedule(a);message=st.feedback}
  log('navigation_'+action,{client_event:details});
 }else if(action==='emergency_stop'){sim.mode='paused';message='주행을 일시정지했습니다.'}
 else if(['study_presented','study_open','study_close','study_options','study_choice','study_cancel'].includes(action)){
  if(action==='study_open'){sim.dialog_open=true;sim.options_open=details.options_visible===true&&sim.onset&&!sim.completed&&['idle','complete'].includes(st.phase);sim.choice=null;if(sim.options_open)log('navigation_options_exposed',{client_event:details})}
  else if(action==='study_close'){if(st.phase==='queued')cancelStudy();sim.dialog_open=false;sim.options_open=false;sim.choice=null}
  else if(action==='study_options'){busy();if(!sim.onset||!sim.dialog_open)throw Error('주행 정보를 먼저 열어 주세요.');sim.options_open=true}
  else if(action==='study_choice'){busy();if(!sim.options_open||!sim.dialog_open||!opts.some(o=>o.action===details.choice))throw Error('대응 방법을 먼저 열어 주세요.');sim.choice=details.choice}
  else if(action==='study_cancel')sim.choice=null;
  log('navigation_'+action,{client_event:details,action:details.choice});
 }else throw Error('이 주행에서 사용할 수 없는 동작입니다.');
 const queued={session_id:sim.session,command_id:uid()};
 sim.requests[request]={action,queued};sim.replies[queued.command_id]={accepted:true,message,session_id:sim.session,action};
 saveSim();return queued;
}
function control(body){
 if(body.session_id&&body.session_id!==sim.session)throw Error('이전 주행 화면에서 온 요청입니다. 현재 내비를 새로 열어 주세요.');
 if(body.reset){if(!sim.profile)throw Error('시나리오를 먼저 선택해 주세요.');prepare(sim.profile,sim.condition,sim.presentation,sim.language)}
 if('mode' in body){if(!['auto','paused'].includes(body.mode))throw Error('Invalid mode');if(!live()||sim.completed)throw Error('시나리오를 먼저 준비해 주세요.');
  if(body.mode==='auto'&&sim.trialId){const t=records.trials.find(t=>t.id===sim.trialId);if(t&&!t.started_utc){t.started_utc=utc();saveRecords()}}
  sim.mode=body.mode}
 if('quality' in body)sim.quality=body.quality;
 saveSim();return {accepted:true};
}

// ---------- fetch routing ----------
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
async function route(url,init){
 const path=url.pathname,method=(init?.method||'GET').toUpperCase();
 let body={};if(method==='POST'&&init?.body){try{body=JSON.parse(init.body)}catch{return json({error:'Invalid request'},400)}}
 if(method==='GET'){
  if(path==='/state')return json(bridgeState());
  if(path==='/api/state'){await studyReady;return json(navState())}
  if(path==='/api/atlas')return json(atlas);
  if(path==='/api/library')return json({tracks:[]});
  if(path==='/api/reply'){const id=url.searchParams.get('id');if(url.searchParams.get('session')!==sim.session)return json({accepted:false,message:'주행 세션이 변경됐습니다.'});return json(sim.replies?.[id]||{accepted:false,message:'확인할 요청이 없습니다.'})}
  if(path==='/api/participant/current')return json({participant:records.current});
  if(path==='/api/language/en'||path==='/api/language/zh')return realFetch(DATA+'language-'+path.slice(-2)+'.json');
  if(path==='/api/research-voice'){const all=await (await realFetch(DATA+'research-voice.json')).json();return json(all[url.searchParams.get('lang')||'ko']||all.ko||{voices:{}})}
  if(path==='/api/footsteps'||path==='/api/cabin-audio'||path==='/api/mechanical-audio')return json({available:false,reason:'demo: recordings stay in the lab'});
  if(path==='/admin/api/trials'){const q=(url.searchParams.get('q')||'').toLowerCase();
   const trials=records.trials.map(t=>{const p=records.participants.find(p=>p.id===t.participant_id)||{},ev=records.events.filter(e=>e.trial_id===t.id&&e.event==='navigation_study_choice');
    return {...t,participant_name:p.name,scenario_name:PROFILES[t.profile]||t.profile,first_choice:ev[0]?.label||null,selection_count:ev.length,selected_after_onset_s:t.selected_s!=null&&t.onset_s!=null?t.selected_s-t.onset_s:null}})
    .filter(t=>!q||String(t.participant_name).toLowerCase().includes(q)||t.profile.includes(q)).reverse();
   return json({trials,counts:{participants:records.participants.length,trials:records.trials.length,events:records.events.length},sync:{state:'local-only'},recording_error:'데모: 이 브라우저에만 저장됩니다'})}
  if(path==='/admin/api/events')return json(records.events.filter(e=>e.trial_id===url.searchParams.get('trial')));
 }
 if(method==='POST'){
  try{
   if(path==='/api/select'){if(!PROFILES[body.profile])throw Error('시나리오를 선택해 주세요.');if(sim.phase==='preparing')throw Error('시나리오를 준비하고 있어요.');
    prepare(body.profile,body.condition||'B',body.presentation||'midterm',['ko','en','zh'].includes(body.language)?body.language:'ko');return json({accepted:true})}
   if(path==='/api/participant'){const name=String(body.name||'').trim();if(!name||name.length>80)throw Error('참가자 이름 또는 ID를 1~80자로 입력해 주세요.');
    if(live()&&sim.elapsed>0&&!sim.completed)throw Error('현재 주행이 끝난 뒤 참가자를 변경해 주세요.');
    const p={id:uid(),name,created_utc:utc()};records.participants.push(p);records.current=p;saveRecords();return json({participant:p})}
   if(path==='/api/command')return json(command(body));
   if(path==='/control')return json(control(body));
   if(path==='/api/route')return json({accepted:true});
   if(path==='/admin/api/sync')return json({accepted:true});
  }catch(e){return json({error:e.message},400)}
 }
 return null;
}
const OURS=/^\/(?:state|control|api\/|admin\/api\/)/;
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
 if(url.origin===location.origin&&OURS.test(url.pathname)){
  if(input instanceof Request&&!init)init={method:input.method,body:input.method==='POST'?await input.clone().text():undefined};
  const answer=await route(url,init);if(answer)return answer;
  return json({error:'demo backend: '+url.pathname+' is not mocked'},404);
 }
 return realFetch(input,init);
};

// ---------- clock ----------
let last=performance.now();
setInterval(()=>{
 const now=performance.now(),dt=Math.min(.25,(now-last)/1000)*speedFactor;last=now;
 if(sim.phase==='preparing'&&Date.now()-sim.preparingAt>1200){sim.phase='live';sim.frames=3}
 if(sim.frozen)return;
 const n=Math.max(1,Math.round(speedFactor));for(let i=0;i<n;i++)step(dt/n);
 saveSim();
},100);

// ?state=<name> opens the navigation frozen in one representative screen state
// (for design review and page capture). Dialog states still need the UI click:
// options/confirm open from the 홍익 AI button.
const STATES={
 ready:{},
 driving:{mode:'auto',elapsed:5,speed:62},
 alert:{mode:'auto',elapsed:14,onset:true,speed:62},
 countdown:{mode:'auto',elapsed:16,onset:true,speed:62,study:{phase:'queued',action:'horn',pending_at:16},horn:0},
 result:{mode:'auto',elapsed:24,onset:true,speed:58,study:{phase:'observing',action:'horn',pending_at:16,started_at:19,observed:4,status:'achieved'},horn:1},
 ending:{mode:'auto',elapsed:40,onset:true,speed:0,completed:true,study:{phase:'complete',action:'horn',pending_at:16,started_at:19,observed:12,stopped:1,status:'achieved'},horn:1}};
const preset=query.get('state');
if(STATES[preset]&&/^\/navigation/.test(location.pathname)){
 studyReady.then(()=>{
  const p=STATES[preset],profile=PROFILES[query.get('profile')]?query.get('profile'):'night';
  prepare(profile,query.get('condition')==='A'?'A':'B','midterm',query.get('lang')||'ko');
  Object.assign(sim,{phase:'live',frames:3,frozen:true,mode:p.mode||'paused',elapsed:p.elapsed||0,onset:!!p.onset,onsetAt:p.onset?T().onset:null,
   speed:p.speed||0,lead_speed:hasLead()?T().lead:0,completed:!!p.completed,completion_reason:p.completed?'action_outcome':null,horn_count:p.horn||0,ego_s:120+(p.elapsed||0)*15});
  sim.lead_s=sim.ego_s+sim.desired_gap+4.6;sim.gap=sim.desired_gap;
  if(sim.profile==='night'&&p.onset)sim.lead_lateral=.9;
  if(p.study){Object.assign(sim.study,p.study);sim.last_action=p.study.action;if(p.study.status){sim.study.summary=RESULT[p.study.action]||'';sim.study.feedback=sim.study.summary}else sim.study.feedback='요청을 준비했어요. 3초 안에 취소할 수 있어요.'}
  saveSim();
 });
}
// Opening /navigation directly (bookmark, shared link) starts a drive instead of waiting forever.
else if(/^\/navigation(?:\/classic)?(?:\.html)?$/.test(location.pathname)&&(sim.phase==='choose'||query.has('profile'))){
 const p=query.get('profile');const presentation=location.pathname.includes('classic')?'classic':'midterm';
 if(!PROFILES[sim.profile]||p||sim.presentation!==presentation)studyReady.then(()=>{prepare(PROFILES[p]?p:sim.profile&&PROFILES[sim.profile]?sim.profile:'night',query.get('condition')==='A'?'A':'B',presentation,query.get('lang')||'ko');sim.phase='live';sim.frames=3;saveSim()});
}

// ---------- small demo toolbar ----------
window.HMIDemo={
 get state(){return sim},
 setSpeed(v){speedFactor=v;sessionStorage.setItem('hmi-demo-speed',String(v))},
 skipToEvent(){if(!live())return;if(sim.mode!=='auto')sim.mode='auto';const t=T();if(sim.elapsed<t.onset-.5){sim.elapsed=t.onset-.5}saveSim()},
 reset(){sessionStorage.removeItem(SESSION);sim=blankSim();saveSim();location.assign('/')},
 clearRecords(){localStorage.removeItem(LOCAL);location.reload()}
};
if(query.get('demobar')!=='0'&&!STATES[preset])addEventListener('DOMContentLoaded',()=>{
 const bar=document.createElement('div');bar.id='hmi-demo-bar';bar.dataset.noTranslate='true';
 bar.innerHTML='<b>DEMO</b><span>CARLA 없이 모의 데이터로 동작</span><select aria-label="재생 속도"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><button data-k="skip" type="button">상황 발생으로</button><button data-k="reset" type="button">처음으로</button><button data-k="hide" type="button" aria-label="데모 표시 숨기기">×</button>';
 const css=document.createElement('style');css.textContent='#hmi-demo-bar{position:fixed;left:50%;top:7px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:999px;background:rgba(23,33,45,.86);color:#fff;font:12px/1.2 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);backdrop-filter:blur(8px)}#hmi-demo-bar b{color:#9fc0ff;letter-spacing:.08em}#hmi-demo-bar span{opacity:.7}#hmi-demo-bar select,#hmi-demo-bar button{font:inherit;color:#fff;background:rgba(255,255,255,.12);border:0;border-radius:999px;padding:5px 10px;cursor:pointer}#hmi-demo-bar select option{color:#000}@media(max-width:700px){#hmi-demo-bar span{display:none}}';
 document.head.append(css);document.body.append(bar);
 const sel=bar.querySelector('select');sel.value=String(speedFactor);sel.onchange=()=>HMIDemo.setSpeed(Number(sel.value));
 bar.onclick=e=>{const k=e.target.dataset?.k;if(k==='skip')HMIDemo.skipToEvent();if(k==='reset')HMIDemo.reset();if(k==='hide')bar.remove()};
 bar.querySelector('[data-k="skip"]').hidden=!/^\/navigation/.test(location.pathname);
});
})();
