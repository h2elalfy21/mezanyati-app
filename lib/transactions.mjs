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
