export function ReadOnlyGradeStatus({loading,error,refresh}:{loading:boolean;error?:string;refresh:()=>Promise<void>}){
  if(!loading&&!error)return null;
  return <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground mb-3" role={error?"alert":"status"}>
    {error?`${error} — بقي العرض السابق دون تغيير`:"جارٍ تحديث الدرجات من المصدر المشترك..."}
    {error&&<button type="button" className="underline mr-2" disabled={loading} onClick={()=>void refresh()}>إعادة المحاولة</button>}
  </div>;
}
