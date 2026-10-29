import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth-session";
import { getActiveComplexId } from "@/lib/tenant";
import { secureListAppState } from "@/lib/secure-data.functions";
import type { GradesStore } from "@/lib/mock-data";

type Snapshot={value:GradesStore;semester:string|null};
let inFlight: {token:string; cid:ReturnType<typeof getActiveComplexId>; promise:Promise<Snapshot>}|null=null;
async function readGrades():Promise<Snapshot>{
  const token=getToken(),cid=getActiveComplexId();if(!token)throw new Error("الجلسة غير متاحة لتحديث الدرجات");
  if(inFlight?.token===token&&inFlight.cid===cid)return inFlight.promise;
  const request=async()=>{
    const rows=await secureListAppState({data:{token,key:"grades"}});
    if(token!==getToken()||cid!==getActiveComplexId())throw new Error("تغيّرت جلسة البيانات؛ أعد فتح الصفحة");
    const row=rows.find(value=>value.key==="grades");if(!row)throw new Error("لم يؤكد الخادم مصدر الدرجات؛ أعد المحاولة");
    if(!("context_complex_id" in row)||row.context_complex_id!==cid)throw new Error("لم يؤكد الخادم سياق المجمع الحالي للدرجات");
    const calendar="calendar_context" in row?row.calendar_context as {known?:boolean;active_semester_id?:unknown}:null;
    if(calendar?.known!==true||!(calendar.active_semester_id===null||typeof calendar.active_semester_id==="string"))throw new Error("تعذّر تأكيد فترة العرض من الخادم");
    if(Array.isArray(row.value)&&!row.value.length)return {value:{},semester:calendar.active_semester_id};
    if(!row.value||typeof row.value!=="object"||Array.isArray(row.value))throw new Error("تعذّر تأكيد بيانات الدرجات من الخادم");
    return {value:row.value as GradesStore,semester:calendar.active_semester_id};
  };
  const promise=request().finally(()=>{if(inFlight?.promise===promise)inFlight=null;});inFlight={token,cid,promise};return promise;
}

/** Read-only view state. Never modifies shared/local grade stores or invokes roster/plan APIs. */
export function useReadOnlyGrades(onValue:(value:GradesStore)=>void,enabled=true,expectedSemester?:string|null){
  const callback=useRef(onValue);callback.current=onValue;
  const refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const [loading,setLoading]=useState(false),[error,setError]=useState<string>();
  const latest=useRef<string|null>(null);
  const period=useRef<{token:string|null;cid:ReturnType<typeof getActiveComplexId>;semester:string|null}|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    if(expectedSemester!==undefined){period.current=null;latest.current=null;}
    let cancelled=false,generation=0;
    const run=async(force=false)=>{
      if(cancelled||!getToken()||document.hidden)return;
      const request=++generation,token=getToken(),cid=getActiveComplexId();
      setLoading(true);
      try{
        const snapshot=await readGrades();
        if(cancelled||request!==generation||token!==getToken()||cid!==getActiveComplexId())return;
        if((expectedSemester!==undefined&&snapshot.semester!==expectedSemester)||(period.current?.token===token&&period.current.cid===cid&&period.current.semester!==snapshot.semester))throw new Error("تغيّر الفصل الدراسي؛ أعد فتح الصفحة لتحديث فترة العرض");
        period.current={token,cid,semester:snapshot.semester};
        const value=snapshot.value;
        const serialized=JSON.stringify(value);
        if(force||serialized!==latest.current){latest.current=serialized;callback.current(structuredClone(value));}
        setError(undefined);
      }catch(reason){if(!cancelled&&request===generation)setError(reason instanceof Error?reason.message:"تعذّر تحديث الدرجات");}
      finally{if(!cancelled&&request===generation)setLoading(false);}
    };
    refreshRef.current=()=>run(true);void run();
    const tick=()=>{void run();};const timer=setInterval(tick,10000);
    window.addEventListener("focus",tick);document.addEventListener("visibilitychange",tick);
    return()=>{cancelled=true;generation++;clearInterval(timer);window.removeEventListener("focus",tick);document.removeEventListener("visibilitychange",tick);refreshRef.current=async()=>{};};
  },[enabled,expectedSemester]);
  const refresh=useCallback(()=>refreshRef.current(),[]);
  return {loading,error,refresh};
}
