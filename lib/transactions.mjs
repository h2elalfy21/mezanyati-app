export function monthBounds(month){
 const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
 if(!match)throw new Error('invalid month');
 const y=Number(match[1]),m=Number(match[2]);
 const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
 const next=m===12?String(y+1).padStart(4,'0')+'-01':match[1]+'-'+String(m+1).padStart(2,'0');
 return {start:month+'-01',end:next+'-01',last:month+'-'+days};
}
export const rowKind=(row)=>row.kind||row.type||'';
export function monthlySummary(rows){
 const sums={AED:{income:0,expense:0,debt:0},EGP:{income:0,expense:0,debt:0}};
 for(const row of rows){
  const kind=rowKind(row),bucket=sums[row.currency],amount=Number(row.amount);
  if(bucket&&Object.hasOwn(bucket,kind)&&Number.isFinite(amount))bucket[kind]+=Math.round(amount*100);
 }
 for(const bucket of Object.values(sums))for(const kind in bucket)bucket[kind]/=100;
 return sums;
}
export function filterHistory(rows,filters){
 return rows.filter(r=>(!filters.currency||r.currency===filters.currency)&&(!filters.kind||rowKind(r)===filters.kind)&&(!filters.category||r.category===filters.category)&&(!filters.date||r.occurred_on===filters.date));
}

const transferCategories=new Set(['تحويل','تحويل داخلي','transfer','internal transfer','internal_transfer']);
export function monthlyAnalytics(rows,month){
 const {start,last}=monthBounds(month);
 const lastDay=Number(last.slice(-2));
 const makeBucket=()=>({
  income:0,expense:0,active:false,
  weeks:Array.from({length:Math.ceil(lastDay/7)},(_,i)=>({start:i*7+1,end:Math.min(i*7+7,lastDay),income:0,expense:0})),
  categories:new Map()
 });
 const analytics={AED:makeBucket(),EGP:makeBucket()};
 for(const row of rows){
  const day=row.occurred_on,kind=rowKind(row);
  if(!Object.hasOwn(analytics,row.currency)||(kind!=='income'&&kind!=='expense')||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<start||day>last)continue;
  const category=String(row.category??'').trim();
  if(transferCategories.has(category.toLowerCase()))continue;
  const amount=Math.round(Number(row.amount)*100);
  if(!Number.isSafeInteger(amount)||amount<=0)continue;
  const bucket=analytics[row.currency],week=bucket.weeks[Math.floor((Number(day.slice(-2))-1)/7)];
  bucket.active=true;
  bucket[kind]+=amount;
  week[kind]+=amount;
  if(kind==='expense'){
   const label=category||'بدون تصنيف';
   bucket.categories.set(label,(bucket.categories.get(label)??0)+amount);
  }
 }
 for(const bucket of Object.values(analytics)){
  bucket.spendingRatio=bucket.income>0?bucket.expense/bucket.income:null;
  bucket.maxWeek=Math.max(0,...bucket.weeks.flatMap(w=>[w.income,w.expense]))/100;
  bucket.categories=[...bucket.categories.entries()]
   .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ar'))
   .map(([name,amount])=>({name,amount:amount/100,share:amount/bucket.expense}));
  bucket.income/=100;
  bucket.expense/=100;
  bucket.weeks=bucket.weeks.map(week=>({...week,income:week.income/100,expense:week.expense/100}));
 }
 return analytics;
}

const dubaiDateTime=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
export function recordedTime(row){
 // A timestamp is the recording time, not the occurrence time of a backdated entry.
 if(typeof row.created_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(row.created_at))return null;
 const when=Date.parse(row.created_at);
 if(!Number.isFinite(when))return null;
 const {year,month,day,hour,minute}=Object.fromEntries(dubaiDateTime.formatToParts(when).map(p=>[p.type,p.value]));
 return row.occurred_on===year+'-'+month+'-'+day?{when,label:hour+':'+minute}:null;
}
export function chronologicalHistory(rows){
 return rows.map(row=>({row,when:recordedTime(row)?.when??-Infinity}))
  .sort((a,b)=>{
   const aDay=a.row.occurred_on??'',bDay=b.row.occurred_on??'';
   if(aDay!==bDay)return aDay>bDay?-1:1;
   if(a.when!==b.when)return a.when>b.when?-1:1;
   const aId=String(a.row.id??''),bId=String(b.row.id??'');
   return aId===bId?0:aId>bId?-1:1;
  }).map(entry=>entry.row);
}
export function groupHistory(sortedRows){
 const groups=[];
 for(const row of sortedRows){
  const day=row.occurred_on??'';
  if(!groups.length||groups[groups.length-1].day!==day)groups.push({day,rows:[]});
  groups[groups.length-1].rows.push(row);
 }
 return groups;
}
