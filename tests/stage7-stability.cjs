const assert=require('node:assert/strict');
const {load,storage,hooks,jsx,find,text,flush}=require('./independent-test-support.cjs');
global.localStorage=storage();global.sessionStorage=storage();
global.window={location:{pathname:'/tenant-a/manager',search:'?tab=tasks&h=42',hash:'#inbox'},addEventListener(){},removeEventListener(){}};
const href=load('src/lib/navigation-href.ts',{});
assert.equal(href.patchSearchHref({tab:'reports',section:'a & b'}),'/tenant-a/manager?tab=reports&h=42&section=a+%26+b#inbox');
assert.equal(href.patchSearchHref({h:undefined}),'/tenant-a/manager?tab=tasks#inbox');
const session=load('src/lib/auth-session.ts',{});
session.setToken('persistent-test-token');assert.equal(sessionStorage.getItem('qs_token'),null);
let middleware;
load('src/lib/attach-api-auth.ts',{'@tanstack/react-start':{createMiddleware:()=>({client(fn){middleware=fn;return fn;}})},'@/lib/auth-session':session});
let nextOptions;middleware({next:opts=>{nextOptions=opts;}});assert.equal(nextOptions.headers.Authorization,'Bearer persistent-test-token');
const ledger=load('src/lib/financial-ledger.ts',{'@/lib/auth-session':{hasAuthToken:()=>false},'@/lib/tenant':{getActiveComplexId:()=>1}});
assert.deepEqual(ledger.parseFinancialLedgerRaw({entries:[],deletedIds:['delete-1',123,null]}).deletedIds,['delete-1']);
const mock=load('src/lib/mock-data.ts',{'@/lib/auth-session':{hasAuthToken:()=>false}});
const transfer={studentId:'fixture',halaqaId:1,week:2,reason:'fixture',fromName:'fixture',actions:[{at:'1',role:'teacher',text:'sent'}]};
const merged=mock.mergeNotifications([{id:'T',transferData:transfer,transferStatus:'pending'}],[{id:'T',transferStatus:'closed',read:true}]);
assert.equal(merged[0].transferData.studentId,'fixture');assert.equal(merged[0].read,true);assert.equal(merged[0].transferData.actions.length,1);
const portal=load('src/lib/student-portal-data.ts',{'@/lib/academic-context':{},'@/lib/mock-data':{loadAttendanceArchive:()=>[{studentId:'S',type:'absent',date:'2025-03-02',dayKey:'sun'}]},'@/lib/semester-grading':{getElapsedSemesterDays:()=>[]},'@/lib/student-profile-data':{},'@/lib/plan-daily-faces':{}});
const archive=portal.collectPortalAbsenceRows('S',{},{});assert.equal(archive[0].date,'2025-03-02');assert.equal(archive[0].week,undefined);
const weekly=load('src/lib/weekly-tests.ts',{'@/lib/auth-session':{hasAuthToken:()=>false}});
async function weeklyTable(rabtSlots,murajaSlots){
 const h=hooks(),settings={...weekly.DEFAULT_WEEKLY_TESTS_SETTINGS,muraja_slots:murajaSlots,rabt_slots:rabtSlots};
 const store={S:{1:{muraja:['pass'],rabt:['pass','fail','']}}};
 const component=load('src/components/WeeklyTestsOverviewPanel.tsx',{
 'react':h.react,'react/jsx-runtime':jsx,'@/lib/mock-data':{loadHalaqat:()=>[{id:1,name:'fixture'}],loadStudents:()=>[{id:'S',name:'fixture',halaqaId:1}]},
 '@/lib/academic-context':{fetchActiveCalendar:async()=>({currentWeekNumber:1,semester:{name:'fixture'}})},
 '@/lib/weekly-tests':{...weekly,loadWeeklyTests:()=>store,loadWeeklyTestsSettings:()=>settings,rankHalaqatByWeeklyTests:()=>[{halaqaId:1,halaqaName:'fixture',weekPercent:0,cumulativePercent:0}]},
 '@/lib/arabic-numbers':{weekLabel:n=>'week '+n},'lucide-react':{},'@/lib/utils':{cn:()=>''}}).WeeklyTestsOverviewPanel;
 let tree=h.render(()=>component({}));h.effects();await flush();tree=h.render(()=>component({}));
 find(tree,n=>n.type==='button')[0].props.onClick();tree=h.render(()=>component({}));
 const th=find(tree,n=>n.type==='th'),td=find(tree,n=>n.type==='td');
 assert.equal(th.length,1+murajaSlots+rabtSlots+2);assert.equal(td.length,th.length);
 if(rabtSlots===2){assert.match(text(td[1+murajaSlots]),/ناجح/);assert.match(text(td[2+murajaSlots]),/راسب/);}
}
(async()=>{
 await weeklyTable(2,4);await weeklyTable(0,1);
 const {createRouter,createRootRoute,createRoute,createMemoryHistory}=require('@tanstack/react-router');
 const root=createRootRoute(),manager=createRoute({getParentRoute:()=>root,path:'/$tenantSlug/manager',validateSearch:search=>search});
 const history=createMemoryHistory({initialEntries:['/tenant-a/manager?tab=tasks&h=42#inbox']});
 const router=createRouter({routeTree:root.addChildren([manager]),history,isServer:true});await router.load();
 await router.navigate({href:href.patchSearchHref({tab:'reports'})});
 assert.equal(history.location.pathname,'/tenant-a/manager');assert.equal(router.state.location.search.tab,'reports');assert.equal(router.state.location.search.h,42);assert.equal(history.location.hash,'#inbox');
 console.log('PASS: real router retains tenant/query/hash, persistent-session API auth, multi-slot weekly table/zero slots, transfer identity, ledger tombstones and historical absence date without invented week');
})().catch(e=>{console.error(e);process.exitCode=1;});

