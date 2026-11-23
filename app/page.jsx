'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {monthBounds,monthlySummary,filterHistory,rowKind} from '../lib/transactions.mjs';

const currencies={AED:'الدرهم الإماراتي',EGP:'الجنيه المصري'};
const kinds={expense:'مصروف',income:'دخل',debt:'دين / التزام'};
const categories=['راتب','طعام','إيجار','مواصلات','فواتير','أسرة مصر','تحويل','سفر','كريدت كارد','مدخرات','تسوق','أخرى'];
const dateToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Dubai'});
const freshForm=(month)=>({kind:'expense',amount:'',currency:'AED',category:'طعام',note:'',occurred_on:dateToday().startsWith(month)?dateToday():month+'-01'});
const money=(n,c)=>new Intl.NumberFormat('ar-AE',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);
const dateLabel=(day)=>day?new Intl.DateTimeFormat('ar-AE',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')):'—';
const monthLabel=(month)=>new Intl.DateTimeFormat('ar-AE',{year:'numeric',month:'long',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
const filterDefaults={currency:'',kind:'',category:'',date:''};
function Figure({label,value,currency,tone}){
 return <div className="figure"><span>{label}</span><strong className={tone}><bdi>{money(value,currency)}</bdi></strong></div>;
}
function CurrencySummary({currency,summary}){
 return <section className="panel currency-card"><div className="currency-heading"><h2><span className="signal-dot" aria-hidden="true"/>{currencies[currency]}</h2><bdi className="tag">{currency}</bdi></div>
 <div className="balance"><Figure label="الصافي (الدخل − المصروفات)" value={summary.income-summary.expense} currency={currency} tone={summary.income>=summary.expense?'tone-good':'tone-out'}/></div>
 <div className="figures"><Figure label="الدخل" value={summary.income} currency={currency}/><Figure label="المصروفات" value={summary.expense} currency={currency}/><Figure label="الديون المسجلة" value={summary.debt} currency={currency}/></div></section>;
}

export default function Home(){
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[authMode,setAuthMode]=useState('login'),[authNotice,setAuthNotice]=useState(null);
 const [month,setMonth]=useState(()=>dateToday().slice(0,7)),[tab,setTab]=useState('overview'),[saving,setSaving]=useState(false),[operation,setOperation]=useState(null),[revision,reload]=useState(0);
 const [form,setForm]=useState(()=>freshForm(dateToday().slice(0,7)));
 const [filters,setFilters]=useState(filterDefaults);
 const [snapshot,setSnapshot]=useState(null);
 const userId=session?.user?.id;
 const requestKey=userId?userId+'/'+month+'/'+revision:null;
 const active=requestKey && snapshot?.key===requestKey?snapshot:null;
 const items=active?.status==='ready'?active.rows:[];
 useEffect(()=>{
  if(!supabase){setLoading(false);return}
  let alive=true, eventSeen=false;
  supabase.auth.getSession().then(({data,error})=>{
   if(!alive||eventSeen)return;
   setSession(data?.session??null);
   if(error)setAuthNotice({error:true,text:error.message});
   setLoading(false);
  }).catch(()=>{if(alive&&!eventSeen){setAuthNotice({error:true,text:'تعذّر التحقق من تسجيل الدخول.'});setLoading(false)}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{
   eventSeen=true;
   setSession(s);
   setLoading(false);
   if(s)setAuthNotice(null);
  });
  return()=>{alive=false;subscription.unsubscribe()};
 },[]);
 useEffect(()=>{
  if(!userId)return;
  let alive=true;
  const abort=new AbortController();
  (async()=>{
   try{
    const {start,end}=monthBounds(month);
    const result=[];
    const pageSize=250;
    for(let offset=0;;offset+=pageSize){
     const {data,error}=await supabase.from('transactions').select('*')
      .eq('user_id',userId).gte('occurred_on',start).lt('occurred_on',end)
      .order('occurred_on',{ascending:false}).order('id',{ascending:false})
      .range(offset,offset+pageSize-1).abortSignal(abort.signal);
     if(!alive)return;
     if(error)throw error;
     result.push(...(data??[]));
     if(!data||data.length<pageSize)break;
    }
    setSnapshot({key:requestKey,status:'ready',rows:result});
   }catch{
    if(alive)setSnapshot({key:requestKey,status:'error'});
   }
  })();
  return()=>{alive=false;abort.abort()};
 },[requestKey,userId,month]);
 const totals=useMemo(()=>monthlySummary(items),[items]);
 const visible=useMemo(()=>filterHistory(items,filters),[items,filters]);
 const choices=useMemo(()=>Array.from(new Set(items.map(x=>x.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar')),[items]);
 const categoriesByCurrency=useMemo(()=>Object.fromEntries(Object.keys(currencies).map(currency=>{
  const sums=new Map();
  items.filter(x=>x.currency===currency&&rowKind(x)==='expense').forEach(x=>sums.set(x.category,(sums.get(x.category)||0)+Number(x.amount)));
  return [currency,Array.from(sums).sort((a,b)=>b[1]-a[1])];
 })),[items]);
 const selectedCount=Object.values(filters).filter(Boolean).length;
 const updateFilter=(key,value)=>setFilters(q=>({...q,[key]:value}));
 const navigate=(next)=>{setTab(next);setOperation(null)};
 const [pendingAuth,setPendingAuth]=useState(false);
 const removePending=useRef(new Set());
 const savePending=useRef(false);
 const refresh=useCallback(()=>reload(x=>x+1),[]);
 function chooseMonth(value){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return;
  setMonth(value);setFilters(filterDefaults);setOperation(null);
 }
 function startForm(){setForm(freshForm(month));navigate('add')}
 async function auth(event){
  event.preventDefault();if(pendingAuth)return;
  setPendingAuth(true);setAuthNotice(null);
  try{
   const {data,error}=authMode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
   if(error)setAuthNotice({error:true,text:error.message});
   else if(authMode==='signup'&&!data?.session)setAuthNotice({text:'راجع بريدك الإلكتروني لتأكيد الحساب.'});
  }catch{setAuthNotice({error:true,text:'تعذّر الاتصال. حاول مرة أخرى.'})}
  finally{setPendingAuth(false)}
 }
 async function add(event){
  event.preventDefault();if(!session||savePending.current)return;
  savePending.current=true;setSaving(true);setOperation(null);
  try{
   const {error}=await supabase.from('transactions').insert({user_id:session.user.id,kind:form.kind,type:form.kind,amount:Number(form.amount),currency:form.currency,category:form.category,note:form.note,occurred_on:form.occurred_on});
   if(error){setOperation({error:true,text:'تعذّر الحفظ: '+error.message});return}
   const savedMonth=form.occurred_on.slice(0,7);
   chooseMonth(savedMonth);setForm(freshForm(savedMonth));refresh();setTab('history');setOperation({text:'تم حفظ العملية.'});
  }catch{setOperation({error:true,text:'تعذّر التحقق من الحفظ. راجع السجل قبل المحاولة مرة أخرى.'})}
  finally{savePending.current=false;setSaving(false)}
 }
 async function remove(id){
  if(!session||removePending.current.has(id)||!confirm('حذف العملية؟'))return;
  removePending.current.add(id);setOperation(null);
  try{
   const {error}=await supabase.from('transactions').delete().eq('id',id);
   if(error)setOperation({error:true,text:'تعذّر الحذف: '+error.message});
   else refresh();
  }catch{setOperation({error:true,text:'تعذّر التحقق من الحذف. راجع السجل قبل المحاولة مرة أخرى.'})}
  finally{removePending.current.delete(id)}
 }
 async function signOut(){
  setOperation(null);setAuthNotice(null);
  const {error}=await supabase.auth.signOut().catch(()=>({error:true}));
  if(error){setOperation({error:true,text:'تعذّر تسجيل الخروج. حاول مرة أخرى.'});return}
  setSnapshot(null);setFilters(filterDefaults);setTab('overview');setPassword('');setForm(freshForm(month));setOperation(null);
 }
 if(!supabase)return <main className="auth panel"><h1>ميزانيتي</h1><p>إعدادات الاتصال بقاعدة البيانات غير متوفرة في بيئة النشر.</p></main>;
 if(loading)return <main className="auth panel" role="status">جارٍ التحقق من تسجيل الدخول…</main>;
 if(!session)return <main className="auth panel"><div className="eyebrow">الميزانية الشخصية</div><h1>ميزانيتي</h1><p className="muted">سجّل دخولك لمتابعة ميزانيتك.</p>
 <form className="auth-form" onSubmit={auth}><label>البريد الإلكتروني<input type="email" dir="ltr" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>كلمة المرور<input type="password" dir="ltr" autoComplete={authMode==='login'?'current-password':'new-password'} minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="btn" disabled={pendingAuth}>{pendingAuth?'جارٍ الاتصال…':authMode==='login'?'تسجيل الدخول':'إنشاء حساب'}</button></form>
 <button className="btn secondary" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthNotice(null)}} disabled={pendingAuth}>{authMode==='login'?'إنشاء حساب':'العودة لتسجيل الدخول'}</button>
 {authNotice&&<p className={'notice '+(authNotice.error?'notice-error':'')} role={authNotice.error?'alert':'status'}>{authNotice.text}</p>}</main>;
 const readiness=!active?<div className="panel state" role="status">جارٍ تحميل عمليات الشهر…</div>:active.status==='error'?<div className="panel state" role="alert"><p>تعذّر تحميل عمليات الشهر. الأرقام غير متاحة حاليًا.</p><button className="btn secondary" onClick={refresh}>إعادة المحاولة</button></div>:null;
 return <main className="wrap">
 <header className="masthead"><div className="brand"><span className="brand-mark" aria-hidden="true">م</span><div><strong>ميزانيتي</strong><div className="muted">الميزانية الشخصية</div></div></div><button className="btn secondary" onClick={signOut}>تسجيل الخروج</button></header>
 <section className="hero"><div><div className="eyebrow hero-kicker"><span aria-hidden="true"/> لوحة المتابعة الشهرية</div><h1>{monthLabel(month)}</h1><p className="muted">الدخل والمصروفات والديون، بكل عملة على حدة.</p></div><label className="month-label">اختر الشهر<input aria-label="اختر الشهر" type="month" value={month} onChange={e=>chooseMonth(e.target.value)}/></label></section>
 <nav className="tabs" aria-label="أقسام ميزانيتي">{[['overview','الملخص'],['history','سجل العمليات'],['add','إضافة عملية']].map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>id==='add'?startForm():navigate(id)}>{label}</button>)}</nav>
 {operation&&<div className={'notice '+(operation.error?'notice-error':'')} role={operation.error?'alert':'status'}>{operation.text}<button className="quiet" aria-label="إغلاق التنبيه" onClick={()=>setOperation(null)}>×</button></div>}
 {tab==='overview'&&(readiness||<>
 <div className="split">{Object.keys(currencies).map(c=><CurrencySummary key={c} currency={c} summary={totals[c]}/>)}</div>
 <section className="panel insight"><div className="section-heading"><div><h2>المصروفات حسب التصنيف</h2><p className="muted">توزيع مصروفات الشهر المسجلة</p></div><button className="btn secondary" onClick={()=>navigate('history')}>عرض السجل</button></div>
 <div className="split">{Object.keys(currencies).map(c=><div key={c}><h3>{currencies[c]}</h3>{categoriesByCurrency[c].length?categoriesByCurrency[c].slice(0,5).map(([name,n])=><div className="bar-line" key={name}><div><span>{name}</span><bdi>{money(n,c)}</bdi></div><progress aria-label={name} value={n} max={totals[c].expense}/></div>):<p className="muted">لا توجد مصروفات مسجلة بهذه العملة.</p>}</div>)}</div></section>
 </>)}
 {tab==='history'&&(readiness||<section className="panel"><div className="section-heading"><div><h2>سجل العمليات</h2><p className="muted">{visible.length} من {items.length} عملية في الشهر</p></div><button className="btn" onClick={startForm}>إضافة عملية</button></div>
 <div className="filters"><label>العملة<select value={filters.currency} onChange={e=>updateFilter('currency',e.target.value)}><option value="">الكل</option>{Object.entries(currencies).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <label>النوع<select value={filters.kind} onChange={e=>updateFilter('kind',e.target.value)}><option value="">الكل</option>{Object.entries(kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <label>التصنيف<select value={filters.category} onChange={e=>updateFilter('category',e.target.value)}><option value="">الكل</option>{choices.map(name=><option key={name}>{name}</option>)}</select></label>
 <label>التاريخ<input type="date" value={filters.date} min={month+'-01'} max={monthBounds(month).last} onChange={e=>updateFilter('date',e.target.value)}/></label></div>
 {selectedCount>0&&<button className="quiet reset" onClick={()=>setFilters(filterDefaults)}>مسح الفلاتر</button>}
 {!visible.length?<div className="state"><p>{items.length?'لا توجد عمليات تطابق الفلاتر.':'لا توجد عمليات مسجلة لهذا الشهر.'}</p></div>:<ul className="history">{visible.map(x=><li key={x.id}>
 <div className="history-main"><strong>{x.category||'بدون تصنيف'}</strong><div className="history-meta"><span className={'tag kind-'+rowKind(x)}>{kinds[rowKind(x)]||'غير مصنّف'}</span><time dateTime={x.occurred_on}>{dateLabel(x.occurred_on)}</time></div>{x.note&&<p className="muted">{x.note}</p>}</div>
 <strong className={'amount '+(rowKind(x)==='income'?'tone-good':rowKind(x)==='expense'?'tone-out':'')}><bdi>{money(Number(x.amount),x.currency)}</bdi></strong>
 <button className="quiet trash" aria-label={'حذف عملية '+(x.category||'بدون تصنيف')} onClick={()=>remove(x.id)}>حذف</button>
 </li>)}</ul>}</section>)}
 {tab==='add'&&<section className="panel"><div className="section-heading"><div><h2>عملية مالية جديدة</h2><p className="muted">تسجيل في الميزانية فقط، بدون تحويل أو دفع.</p></div></div>
 <form className="form" onSubmit={add}><label>نوع العملية<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{Object.entries(kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <label>المبلغ<input type="number" dir="ltr" inputMode="decimal" min="0.01" step="0.01" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
 <label>العملة<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{Object.entries(currencies).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
 <label>التصنيف<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>التاريخ<input type="date" value={form.occurred_on} onChange={e=>setForm({...form,occurred_on:e.target.value})} required/></label>
 <label>ملاحظة<input value={form.note} maxLength={300} onChange={e=>setForm({...form,note:e.target.value})} placeholder="وصف اختياري"/></label><div className="form-actions"><button className="btn" disabled={saving}>{saving?'جارٍ الحفظ…':'حفظ العملية'}</button><button className="btn secondary" type="button" disabled={saving} onClick={()=>navigate('history')}>إلغاء</button></div></form></section>}
 <footer className="muted">ميزانيتي للتخطيط والمتابعة. التطبيق لا يحرّك أي أموال.</footer>
 </main>;
}
