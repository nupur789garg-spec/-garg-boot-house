import {useEffect,useState} from 'react'
import {Navigate} from 'react-router-dom'
import {sb} from './supabase'
import {useApp} from './App.jsx'

const slug=s=>s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
const upload=async file=>{
  const path=`${Date.now()}-${Math.random().toString(36).slice(2,7)}-${file.name.replace(/[^\w.]+/g,'_')}`
  const {error}=await sb.storage.from('media').upload(path,file,{cacheControl:'31536000'})
  if(error)throw error
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl
}
const kind=f=>f.type.startsWith('video')?'video':'image'

export default function Admin(){
  const {profile,session}=useApp(),[tab,setTab]=useState('Overview')
  if(!session)return <Navigate to="/login"/>
  if(!profile)return <p className="wrap sec">Loading…</p>
  if(profile.role!=='admin')return <div className="wrap sec"><h2>Not allowed</h2><p>This area is for store administrators only.</p></div>
  const T={Overview,Products,Categories,Options,Gallery,Referrals,Settings:SettingsTab}, C=T[tab]
  return <div className="wrap admin"><div className="side">{Object.keys(T).map(t=><button key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</div><div><C/></div></div>
}

function Overview(){
  const [s,setS]=useState(null)
  useEffect(()=>{(async()=>{
    const c=(q)=>q.then(r=>r.count||0),h={count:'exact',head:true}
    const P=()=>sb.from('products').select('*',h),R=()=>sb.from('rewards').select('*',h)
    setS({'Total products':await c(P().neq('status','archived')),'In stock':await c(P().eq('status','active').eq('in_stock',true)),'Out of stock':await c(P().eq('status','active').eq('in_stock',false)),
      'New arrivals':await c(P().eq('is_new',true)),'Customers':await c(sb.from('profiles').select('*',h).eq('role','customer')),
      'Pending referrals':await c(sb.from('referrals').select('*',h).eq('status','pending')),'Available discounts':await c(R().eq('status','available')),'Redeemed discounts':await c(R().eq('status','redeemed'))})})()},[])
  return <><h2>Overview</h2>{!s?<p>Loading…</p>:<div className="stats">{Object.entries(s).map(([k,v])=><div className="stat" key={k}><b>{v}</b>{k}</div>)}</div>}</>
}

function Products(){
  const {cats,opts}=useApp(),[list,setList]=useState([]),[edit,setEdit]=useState(null),[q,setQ]=useState(''),[msg,setMsg]=useState('')
  const load=()=>sb.from('products').select('*, product_media(*)').order('created_at',{ascending:false}).then(r=>setList(r.data||[]))
  useEffect(()=>{load()},[])
  const quick=async(p,patch)=>{const {error}=await sb.from('products').update(patch).eq('id',p.id);setMsg(error?error.message:'Saved.');load()}
  const del=async p=>{if(!confirm(`Permanently delete ${p.name} (${p.public_id})? Its ID will never be reused. Consider Archive instead.`))return
    const {error}=await sb.from('products').delete().eq('id',p.id);setMsg(error?error.message:'Deleted.');load()}
  const f=list.filter(p=>!q||(p.name+p.public_id).toLowerCase().includes(q.toLowerCase()))
  if(edit)return <ProductForm p={edit} done={m=>{setEdit(null);if(m)setMsg(m);load()}}/>
  return <><h2>Products</h2>{msg&&<div className="msg">{msg}</div>}
    <p style={{display:'flex',gap:10}}><button className="btn" onClick={()=>setEdit({})}>Add product</button><input placeholder="Search name or ID" value={q} onChange={e=>setQ(e.target.value)}/></p>
    {!f.length&&<p className="muted">No products yet. Add your first one.</p>}
    <div className="scroll"><table className="tbl"><tbody>{f.map(p=><tr key={p.id}>
      <td><img src={p.product_media?.[0]?.url||''} alt="" width="44" height="44" style={{objectFit:'cover',background:'#ddd'}}/></td>
      <td><b>{p.name}</b><br/><span className="pid">{p.public_id}</span></td><td>{p.status}</td>
      <td><button className="btn sm ghost" onClick={()=>quick(p,{in_stock:!p.in_stock})}>{p.in_stock?'In stock':'Out of stock'}</button></td>
      <td><button className="btn sm" onClick={()=>setEdit(p)}>Edit</button> <button className="btn sm ghost" onClick={()=>quick(p,{status:p.status==='archived'?'active':'archived'})}>{p.status==='archived'?'Restore':'Archive'}</button> <button className="btn sm ghost danger" onClick={()=>del(p)}>Delete</button></td></tr>)}</tbody></table></div></>
}

function ProductForm({p,done}){
  const {cats,opts}=useApp(),isNew=!p.id
  const [f,setF]=useState({name:'',category_id:'',subcategory_id:'',colour:'',style:'',description:'',in_stock:true,is_new:false,is_featured:false,status:'active',...p}),[files,setFiles]=useState([]),[media,setMedia]=useState(p.product_media||[]),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF(x=>({...x,[k]:v}))
  const save=async e=>{e.preventDefault();setErr('');setBusy(true)
    try{
      const row={name:f.name.trim(),category_id:f.category_id||null,subcategory_id:f.subcategory_id||null,colour:f.colour||null,style:f.style||null,description:f.description||null,in_stock:f.in_stock,is_new:f.is_new,is_featured:f.is_featured,status:f.status}
      let id=p.id
      if(isNew){const r=await sb.from('products').insert(row).select('id').single();if(r.error)throw r.error;id=r.data.id}
      else{const r=await sb.from('products').update(row).eq('id',id);if(r.error)throw r.error}
      let order=media.length,failed=0
      for(const file of files){try{const url=await upload(file);const r=await sb.from('product_media').insert({product_id:id,url,type:kind(file),sort_order:order++});if(r.error)throw r.error}catch{failed++}}
      done(failed?`Saved, but ${failed} file(s) failed to upload. Edit the product to retry.`:'Product saved.')
    }catch(x){setErr(x.message);setBusy(false)}}
  const rm=async m=>{await sb.from('product_media').delete().eq('id',m.id);setMedia(media.filter(x=>x.id!==m.id))}
  return <form onSubmit={save}><h2>{isNew?'Add product':`Edit ${p.public_id}`}</h2>
    {!isNew&&<p className="pid">Product ID {p.public_id} is permanent.</p>}
    <label>Name</label><input required value={f.name} onChange={e=>set('name',e.target.value)}/>
    <div className="row2"><div><label>Category (Men / Women / Kids)</label><select required value={f.category_id||''} onChange={e=>{set('category_id',e.target.value);set('subcategory_id','')}}><option value="">Select…</option>{cats.filter(c=>!c.parent_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <div><label>Subcategory</label><select value={f.subcategory_id||''} onChange={e=>set('subcategory_id',e.target.value)}><option value="">None</option>{cats.filter(c=>c.parent_id&&c.parent_id===f.category_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
    {isNew&&<p className="muted">The product ID prefix comes from the category's first letter (e.g. Women → GBH-W-001).</p>}
    <div className="row2"><div><label>Colour</label><select value={f.colour||''} onChange={e=>set('colour',e.target.value)}><option value="">None</option>{opts.filter(o=>o.kind==='colour').map(o=><option key={o.id}>{o.name}</option>)}</select></div>
    <div><label>Style</label><select value={f.style||''} onChange={e=>set('style',e.target.value)}><option value="">None</option>{opts.filter(o=>o.kind==='style').map(o=><option key={o.id}>{o.name}</option>)}</select></div></div>
    <label>Description</label><textarea rows="4" value={f.description||''} onChange={e=>set('description',e.target.value)}/>
    <div className="chk">{[['in_stock','In stock'],['is_new','New arrival'],['is_featured','Featured']].map(([k,l])=><label key={k}><input type="checkbox" checked={f[k]} onChange={e=>set(k,e.target.checked)}/>{l}</label>)}
    <label>Status <select value={f.status} onChange={e=>set('status',e.target.value)}><option value="active">Visible</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label></div>
    <label>Photos and short video (first image is the main one)</label>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{media.map(m=><div key={m.id}>{m.type==='video'?<video src={m.url} width="80"/>:<img src={m.url} width="80" height="80" style={{objectFit:'cover'}} alt=""/>}<br/><button type="button" className="btn sm ghost danger" onClick={()=>rm(m)}>Remove</button></div>)}</div>
    <input type="file" multiple accept="image/*,video/mp4,video/webm" onChange={e=>setFiles([...e.target.files])}/>
    <p className="muted">Keep photos under 1 MB and videos short (free storage is 1 GB).</p>
    {err&&<div className="msg err">{err}</div>}
    <p><button className="btn" disabled={busy}>{busy?'Saving…':'Save product'}</button> <button type="button" className="btn ghost" onClick={()=>done()}>Cancel</button></p></form>
}

function Categories(){
  const {cats,reload}=useApp(),[name,setName]=useState(''),[parent,setParent]=useState(''),[msg,setMsg]=useState('')
  const run=async(p)=>{const {error}=await p;setMsg(error?error.message:'Saved.');reload()}
  const add=e=>{e.preventDefault();if(!name.trim())return;run(sb.from('categories').insert({name:name.trim(),slug:slug(name)+(parent?'-'+slug(cats.find(c=>c.id===parent).name):''),parent_id:parent||null,sort_order:cats.length+1}));setName('')}
  const rename=c=>{const n=prompt('New name',c.name);if(n&&n.trim())run(sb.from('categories').update({name:n.trim()}).eq('id',c.id))}
  const move=(c,d)=>{const sib=cats.filter(x=>x.parent_id===c.parent_id).sort((a,b)=>a.sort_order-b.sort_order),i=sib.findIndex(x=>x.id===c.id),o=sib[i+d];if(!o)return
    run(Promise.all([sb.from('categories').update({sort_order:o.sort_order}).eq('id',c.id),sb.from('categories').update({sort_order:c.sort_order}).eq('id',o.id)]).then(r=>r[0]))}
  const del=async c=>{const {count}=await sb.from('products').select('*',{count:'exact',head:true}).or(`category_id.eq.${c.id},subcategory_id.eq.${c.id}`)
    const kids=cats.filter(x=>x.parent_id===c.id).length
    if(confirm(`Delete "${c.name}"?${kids?`\nIts ${kids} subcategories will also be deleted.`:''}\n${count} product(s) use it. They will NOT be deleted, but will lose this category.`))run(sb.from('categories').delete().eq('id',c.id))}
  const Row=({c,ind})=><tr><td style={{paddingLeft:ind?30:8}}>{c.name}</td><td><button className="btn sm ghost" onClick={()=>move(c,-1)}>↑</button> <button className="btn sm ghost" onClick={()=>move(c,1)}>↓</button> <button className="btn sm ghost" onClick={()=>rename(c)}>Rename</button> <button className="btn sm ghost danger" onClick={()=>del(c)}>Delete</button></td></tr>
  const tops=cats.filter(c=>!c.parent_id).sort((a,b)=>a.sort_order-b.sort_order)
  return <><h2>Categories</h2>{msg&&<div className="msg">{msg}</div>}
    <form className="row2" onSubmit={add}><input placeholder="New category or subcategory name" value={name} onChange={e=>setName(e.target.value)}/><select value={parent} onChange={e=>setParent(e.target.value)}><option value="">Top level (like Men)</option>{tops.map(t=><option key={t.id} value={t.id}>Subcategory of {t.name}</option>)}</select><button className="btn">Add</button></form>
    <table className="tbl"><tbody>{tops.map(t=><><Row key={t.id} c={t}/>{cats.filter(c=>c.parent_id===t.id).sort((a,b)=>a.sort_order-b.sort_order).map(s=><Row key={s.id} c={s} ind/>)}</>)}</tbody></table></>
}

function Options(){
  const {opts,reload}=useApp(),[v,setV]=useState({style:'',colour:''}),[msg,setMsg]=useState('')
  const add=async(k)=>{if(!v[k].trim())return;const {error}=await sb.from('filter_options').insert({kind:k,name:v[k].trim()});setMsg(error?error.message:'Added.');setV({...v,[k]:''});reload()}
  const del=async o=>{if(!confirm(`Remove "${o.name}" from the filter list? Existing products keep their value.`))return;await sb.from('filter_options').delete().eq('id',o.id);reload()}
  return <><h2>Styles and colours</h2>{msg&&<div className="msg">{msg}</div>}{['style','colour'].map(k=><div key={k}><h3 style={{textTransform:'capitalize'}}>{k}s</h3>
    <p style={{display:'flex',gap:8}}><input value={v[k]} onChange={e=>setV({...v,[k]:e.target.value})} placeholder={`New ${k}`}/><button className="btn" onClick={()=>add(k)}>Add</button></p>
    <p>{opts.filter(o=>o.kind===k).map(o=><span key={o.id} className="badge" style={{marginRight:6}}>{o.name} <a href="#" onClick={e=>{e.preventDefault();del(o)}} aria-label={`Remove ${o.name}`}>✕</a></span>)}</p></div>)}</>
}

function Gallery(){
  const [list,setList]=useState([]),[cap,setCap]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
  const load=()=>sb.from('gallery_media').select('*').order('sort_order').then(r=>setList(r.data||[]));useEffect(()=>{load()},[])
  const add=async e=>{const fs=[...e.target.files];setBusy(true);let bad=0
    for(const file of fs){try{const url=await upload(file);const r=await sb.from('gallery_media').insert({url,type:kind(file),caption:cap||null,sort_order:list.length+1});if(r.error)throw r.error}catch{bad++}}
    setBusy(false);setMsg(bad?`${bad} upload(s) failed.`:'Uploaded.');load()}
  const rm=async g=>{if(confirm('Remove this item?')){await sb.from('gallery_media').delete().eq('id',g.id);load()}}
  const editCap=async g=>{const c=prompt('Caption',g.caption||'');if(c!==null){await sb.from('gallery_media').update({caption:c}).eq('id',g.id);load()}}
  const move=async(g,d)=>{const i=list.findIndex(x=>x.id===g.id),o=list[i+d];if(!o)return;await Promise.all([sb.from('gallery_media').update({sort_order:o.sort_order}).eq('id',g.id),sb.from('gallery_media').update({sort_order:g.sort_order}).eq('id',o.id)]);load()}
  return <><h2>Store gallery</h2>{msg&&<div className="msg">{msg}</div>}<label>Caption for new uploads</label><input value={cap} onChange={e=>setCap(e.target.value)}/>
    <input type="file" multiple accept="image/*,video/mp4,video/webm" disabled={busy} onChange={add}/>{busy&&<p>Uploading…</p>}
    <div className="gal" style={{marginTop:16}}>{list.map(g=><div key={g.id}>{g.type==='video'?<video src={g.url}/>:<img src={g.url} alt={g.caption||''}/>}<p className="muted">{g.caption}</p>
      <button className="btn sm ghost" onClick={()=>move(g,-1)}>←</button> <button className="btn sm ghost" onClick={()=>move(g,1)}>→</button> <button className="btn sm ghost" onClick={()=>editCap(g)}>Caption</button> <button className="btn sm ghost danger" onClick={()=>rm(g)}>Remove</button></div>)}</div></>
}

function Referrals(){
  const [rf,setRf]=useState([]),[rw,setRw]=useState([]),[code,setCode]=useState(''),[msg,setMsg]=useState('')
  const load=async()=>{const a=await sb.from('referrals').select('*, referrer:referrer_id(full_name,email), referred:referred_id(full_name,email)').order('created_at',{ascending:false});setRf(a.data||[])
    const b=await sb.from('rewards').select('*, owner:user_id(full_name,email)').order('created_at',{ascending:false});setRw(b.data||[])}
  useEffect(()=>{load()},[])
  const review=async(r,ok)=>{if(!confirm(ok?'Confirm the referred customer made a qualifying purchase in store? Both rewards become available.':'Reject this referral?'))return
    const {error}=await sb.rpc('admin_review_referral',{rid:r.id,approve:ok});setMsg(error?error.message:'Done.');load()}
  const redeem=async c=>{const {error}=await sb.rpc('admin_redeem_reward',{rcode:c});setMsg(error?error.message:`Reward ${c} marked as redeemed.`);setCode('');load()}
  const nm=x=>x?`${x.full_name||'Customer'} (${x.email})`:'—'
  return <><h2>Referrals and rewards</h2>{msg&&<div className="msg">{msg}</div>}
    <h3>Redeem a reward</h3><p style={{display:'flex',gap:8}}><input placeholder="Reward code shown by customer" value={code} onChange={e=>setCode(e.target.value)}/><button className="btn" onClick={()=>redeem(code)}>Mark redeemed</button></p>
    <h3>Referrals</h3><div className="scroll"><table className="tbl"><thead><tr><th>Referrer</th><th>New customer</th><th>Status</th><th></th></tr></thead><tbody>{rf.map(r=><tr key={r.id}><td>{nm(r.referrer)}</td><td>{nm(r.referred)}</td><td>{r.status}</td>
      <td>{r.status==='pending'&&<><button className="btn sm" onClick={()=>review(r,true)}>Approve</button> <button className="btn sm ghost danger" onClick={()=>review(r,false)}>Reject</button></>}</td></tr>)}</tbody></table></div>
    {!rf.length&&<p className="muted">No referrals yet.</p>}
    <h3>Rewards history</h3><div className="scroll"><table className="tbl"><thead><tr><th>Customer</th><th>Code</th><th>Status</th><th>Redeemed</th></tr></thead><tbody>{rw.map(r=><tr key={r.id}><td>{nm(r.owner)}</td><td className="pid">{r.code}</td><td>{r.status}</td><td>{r.redeemed_at?new Date(r.redeemed_at).toLocaleString():''}</td></tr>)}</tbody></table></div></>
}

const FIELDS=[['store_intro','Store introduction',1],['address','Address',1],['phone','Phone number'],['whatsapp','WhatsApp number (digits with country code, e.g. 91XXXXXXXXXX)'],['hours','Opening hours',1],['maps_url','Google Maps link'],['instagram','Instagram link'],['facebook','Facebook link'],['announcement','Website announcement (top bar)'],
 ['referral_percent','Referral discount %'],['referral_min_purchase','Minimum qualifying purchase (₹, optional)'],['referral_expiry_days','Reward expiry in days (0 = never)'],['referral_terms','Referral terms',1],['privacy','Privacy Policy text',1],['terms','Terms and Conditions text',1]]
function SettingsTab(){
  const {settings,reload}=useApp(),[f,setF]=useState(settings),[msg,setMsg]=useState('')
  const save=async e=>{e.preventDefault();const {error}=await sb.from('store_settings').upsert(FIELDS.map(([k])=>({key:k,value:f[k]||''})));setMsg(error?error.message:'Settings saved.');reload()}
  return <form onSubmit={save}><h2>Store settings</h2>{msg&&<div className="msg">{msg}</div>}
    {FIELDS.map(([k,l,big])=><div key={k}><label>{l}</label>{big?<textarea rows="3" value={f[k]||''} onChange={e=>setF({...f,[k]:e.target.value})}/>:<input value={f[k]||''} onChange={e=>setF({...f,[k]:e.target.value})}/>}</div>)}
    <p><button className="btn">Save settings</button></p></form>
}
