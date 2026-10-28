import { replaceGradeInputSettingsFromCloud } from "@/lib/grade-input-settings";
import { replaceGradePointDraft } from "@/lib/grade-policy-preview";
import { getToken } from "@/lib/auth-session";
import { secureListAppState } from "@/lib/secure-data.functions";
import { fetchActiveCalendar } from "@/lib/academic-context";
import { getDataSemester, setDataSemester, reconcileShared } from "@/lib/shared-state";
import { saveGrades, saveNotifications, saveSardHistory, saveSardQueue } from "@/lib/mock-data";
import { saveAcademicRecords } from "@/lib/academic-record";
import { saveScientificGradesStore } from "@/lib/scientific-grades";
import { saveWeeklyTests } from "@/lib/weekly-tests";
export const SHARED_REFRESH_EVENT="qs-shared-refreshed";
export const CLOCK_TICK_EVENT="qs-operational-clock-tick";
let inFlight: Promise<void> | null=null;
/** Read-only pulls; existing API role/complex filters remain authoritative. */
export function refreshSharedCaches(): Promise<void> {
  if(inFlight)return inFlight;
  const run=async()=>{
    const token=getToken();if(!token)return;
    const calendar=await fetchActiveCalendar(true);setDataSemester(calendar.semester?.id??null);
    const rows=await secureListAppState({data:{token}});if(getToken()!==token)return;
    const previous=sessionStorage.getItem("qs_syncing");sessionStorage.setItem("qs_syncing","1");
    try {
      for(const row of rows){
        if(row.integrity?.semester_id&&row.integrity.semester_id!==getDataSemester())throw new Error("تغيّر الفصل الدراسي؛ أعد تحميل الصفحة");
        switch(row.key){
          case "grades":saveGrades(reconcileShared("grades",row.value) as Parameters<typeof saveGrades>[0],{sync:false});break;
          case "weekly_tests":saveWeeklyTests(reconcileShared("weekly_tests",row.value) as Parameters<typeof saveWeeklyTests>[0],{sync:false});break;
          case "scientific_grades":saveScientificGradesStore(reconcileShared("scientific_grades",row.value) as Parameters<typeof saveScientificGradesStore>[0]);break;
          case "notifications": {
            // An unscoped old local inbox is preserved for review, never assigned to this complex by guess.
            const old=localStorage.getItem("qshatawi_notifications_v2");
            if(old&&!localStorage.getItem("qshatawi_notifications_v2:legacy-unverified"))localStorage.setItem("qshatawi_notifications_v2:legacy-unverified",old);
            saveNotifications(reconcileShared("notifications",row.value) as Parameters<typeof saveNotifications>[0]);break;
          }
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
