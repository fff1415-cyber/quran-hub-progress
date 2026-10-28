import { replaceGradeInputSettingsFromCloud } from "@/lib/grade-input-settings";
import { replaceGradePointDraft } from "@/lib/grade-policy-preview";
import { getToken } from "@/lib/auth-session";
import { secureListAppState,secureListStudents,secureListHalaqatFull } from "@/lib/secure-data.functions";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { getDataSemester, setDataSemester, reconcileShared } from "@/lib/shared-state";
import { saveGrades, saveNotifications, saveSardHistory, saveSardQueue,saveStudents,saveHalaqat } from "@/lib/mock-data";
import { saveAcademicRecords } from "@/lib/academic-record";
import { saveScientificGradesStore } from "@/lib/scientific-grades";
import { saveWeeklyTests } from "@/lib/weekly-tests";
export const LEGACY_REVIEW_EVENT="qs-legacy-review-needed";
export const SHARED_REFRESH_EVENT="qs-shared-refreshed";
export const CLOCK_TICK_EVENT="qs-operational-clock-tick";
let inFlight: Promise<void> | null=null;
/** Read-only pulls; existing API role/complex filters remain authoritative. */
export function refreshSharedCaches(): Promise<void> {
  if(inFlight)return inFlight;
  const run=async()=>{
    const token=getToken();if(!token)return;
    const calendar=await fetchActiveCalendar(true);setDataSemester(calendar.semester?.id??null);
    const results=await Promise.allSettled([secureListAppState({data:{token}}),secureListStudents({data:{token}}),secureListHalaqatFull({data:{token}})]);
    if(getToken()!==token)return;
    if(results[0].status==='rejected')throw results[0].reason;
    const rows=results[0].value;
    const legacy=rows.some(row=>["grades","weekly_tests","scientific_grades"].includes(row.key)&&row.integrity?.legacy_available);
    window.dispatchEvent(new CustomEvent(LEGACY_REVIEW_EVENT,{detail:legacy}));
    const {rowToStudent,rowToHalaqa}=await import("./cloud-sync");
    if(results[1].status==='fulfilled'&&Array.isArray(results[1].value))saveStudents((results[1].value as Parameters<typeof rowToStudent>[0][]).map(rowToStudent));
    if(results[2].status==='fulfilled'&&Array.isArray(results[2].value))saveHalaqat((results[2].value as Parameters<typeof rowToHalaqa>[0][]).map(rowToHalaqa));
    const previous=sessionStorage.getItem("qs_syncing");sessionStorage.setItem("qs_syncing","1");
    try {
      for(const row of rows){
        if(row.integrity?.semester_id&&row.integrity.semester_id!==getDataSemester())throw new Error("تغيّر الفصل الدراسي؛ أعد تحميل الصفحة");
        switch(row.key){
          case "grades":saveGrades(reconcileShared("grades",row.value) as Parameters<typeof saveGrades>[0],{sync:false});break;
          case "weekly_tests":saveWeeklyTests(reconcileShared("weekly_tests",row.value) as Parameters<typeof saveWeeklyTests>[0],{sync:false});break;
          case "scientific_grades":saveScientificGradesStore(reconcileShared("scientific_grades",row.value) as Parameters<typeof saveScientificGradesStore>[0]);break;
          // F03: do not publish or pull notifications through the unscoped shared-state endpoint.
          case "academic_records":saveAcademicRecords(reconcileShared("academic_records",row.value) as Parameters<typeof saveAcademicRecords>[0]);break;
          case "sard_history":saveSardHistory(reconcileShared("sard_history",row.value) as Parameters<typeof saveSardHistory>[0]);break;
          case "grade_input_settings":replaceGradeInputSettingsFromCloud(reconcileShared("grade_input_settings",row.value));break;
          case "grade_point_settings":replaceGradePointDraft(reconcileShared("grade_point_settings",row.value));break;
          case "sard_queue":saveSardQueue(row.value as Parameters<typeof saveSardQueue>[0]);break;
        }
      }
    } finally {if(previous)sessionStorage.setItem("qs_syncing",previous);else sessionStorage.removeItem("qs_syncing");}
    window.dispatchEvent(new Event(SHARED_REFRESH_EVENT));window.dispatchEvent(new Event(CLOCK_TICK_EVENT));
  };
  const p=run().finally(()=>{inFlight=null;});inFlight=p;return p;
}
