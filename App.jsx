import {useEffect,useState,createContext,useContext,useMemo} from 'react'
import {Routes,Route,Link,useParams,useNavigate,useSearchParams,Navigate} from 'react-router-dom'
import {sb,CONFIGURED,PLACEHOLDER} from './supabase'
import Admin from './Admin.jsx'

export const Ctx=createContext({})
export const useApp=()=>useContext(Ctx)
const img=p=>(p.product_media||[]).filter(m=>m.type==='image').sort((a,b)=>a.sort_order-b.sort_order)[0]?.url||PLACEHOLDER
const title=(t,d)=>{document.title=t;const m=document.querySelector('meta[name=description]');if(m&&d)m.content=d}

export default function App(){
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[settings,setSettings]=useState({}),[cats,setCats]=useState([]),[opts,setOpts]=useState([]),[ready,setReady]=useState(false)
  const loadPublic=async()=>{
    const [s,c,o]=await Promise.all([sb.from('store_settings').select('*'),sb.from('categories').select('*').order('sort_order'),sb.from('filter_options').select('*').order('name')])
    setSettings(Object.fromEntries((s.data||[]).map(r=>[r.key,r.value])));setCats(c.data||[]);setOpts(o.data||[])
  }
  const loadProfile=async u=>{if(!u){setProfile(null);return};const {data}=await sb.from('profiles').select('*').eq('id',u.id).maybeSingle();setProfile(data)}
  useEffect(()=>{
    if(!CONFIGURED){setReady(true);return}
    loadPublic().finally(()=>setReady(true))
    sb.auth.getSession().then(({data})=>{setSession(data.session);loadProfile(data.session?.user)})
    const {data:l}=sb.auth.onAuthStateChange((_e,s)=>{setSession(s);setTimeout(()=>loadProfile(s?.user),0)})
    return ()=>l.subscription.unsubscribe()
  },[])
  if(!CONFIGURED)return <div className="form"><h2>Setup needed</h2><p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).</p></div>
  if(!ready)return <p className="wrap sec">Loading…</p>
  return <Ctx.Provider value={{session,profile,settings,cats,opts,reload:loadPublic,reloadProfile:()=>loadProfile(session?.user)}}>
    <Nav/>
    <Routes>
      <Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/>
      <Route path="/p/:pid" element={<Product/>}/><Route path="/about" element={<About/>}/>
      <Route path="/contact" element={<Contact/>}/><Route path="/login" element={<Auth mode="login"/>}/>
      <Route path="/register" element={<Auth mode="register"/>}/><Route path="/account" element={<Account/>}/>
      <Route path="/refer" element={<Refer/>}/><Route path="/page/:k" element={<TextPage/>}/>
      <Route path="/admin" element={<Admin/>}/><Route path="*" element={<div className="wrap sec"><h2>Page not found</h2><Link className="btn" to="/">Go home</Link></div>}/>
    </Routes>
    <Footer/>
  </Ctx.Provider>
}

function Nav(){
  const {cats,profile,session,settings}=useApp(),[open,setOpen]=useState(false),[q,setQ]=useState(''),nav=useNavigate()
  const tops=cats.filter(c=>!c.parent_id)
  const go=()=>setOpen(false)
  return <>{settings.announcement&&<div className="bar">{settings.announcement}</div>}
  <header className={'nav'+(open?' open':'')}><div className="wrap row">
    <Link to="/" onClick={go}><img className="logo" src="/logo.jpg" alt="Garg Boot House logo"/></Link>
    <button className="burger" aria-label="Menu" onClick={()=>setOpen(!open)}>{open?'✕':'☰'}</button>
    <nav aria-label="Main">
      <div><Link className="top" to="/" onClick={go}>Home</Link></div>
      {tops.map(t=><div key={t.id}><Link className="top" to={`/shop?cat=${t.slug}`} onClick={go}>{t.name}</Link>
        <div className="drop">{cats.filter(c=>c.parent_id===t.id).map(s=><Link key={s.id} to={`/shop?cat=${t.slug}&sub=${s.slug}`} onClick={go}>{s.name}</Link>)}</div></div>)}
      <div><Link className="top" to="/shop?new=1" onClick={go}>New Arrivals</Link></div>
      <div><Link className="top" to="/about" onClick={go}>About Us</Link></div>
      <div><Link className="top" to="/contact" onClick={go}>Contact</Link></div>
    </nav>
    <div className="right">
      <form onSubmit={e=>{e.preventDefault();nav('/shop?q='+encodeURIComponent(q));go()}} role="search"><input aria-label="Search" placeholder="Search name or ID, e.g. GBH-W-024" value={q} onChange={e=>setQ(e.target.value)}/></form>
      <Link to="/refer" onClick={go}>Refer &amp; Earn</Link>
      {profile?.role==='admin'&&<Link to="/admin" onClick={go}>Admin</Link>}
      {session?<Link to="/account" onClick={go}>Account</Link>:<Link to="/login" onClick={go}>Login</Link>}
    </div></div></header></>
}

export function Enquire({p,close}){
  const {settings}=useApp()
  const num=(settings.whatsapp||'').replace(/\D/g,'')
  const msg=`Hello Garg Boot House! I'm interested in ${p.name} (${p.public_id}). I'd like to know its price and availability.`
  const go=()=>{window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'_blank','noopener');close()}
  return <div className="modal" role="dialog" aria-modal="true" onClick={close}><div onClick={e=>e.stopPropagation()}>
    <h3>Interested in this product?</h3><p>Would you like to enquire about its price and availability?</p>
    <p className="pid">{p.name} ({p.public_id})</p>
    {!num&&<div className="msg err">The store's WhatsApp number has not been added yet.</div>}
    <p className="muted">WhatsApp will open with a message ready. Press Send there to contact us.</p>
    <div className="acts"><button className="btn gold" disabled={!num} onClick={go}>Yes, I'm Interested</button><button className="btn ghost" onClick={close}>Maybe Later</button></div></div></div>
}

export function Card({p}){
  const {cats}=useApp(),[ask,setAsk]=useState(false)
  const sub=cats.find(c=>c.id===p.subcategory_id)?.name
  return <article className="card"><Link to={`/p/${p.public_id}`}><img loading="lazy" src={img(p)} alt={`${p.name} footwear`}/></Link>
    <div className="b"><h3><Link to={`/p/${p.public_id}`}>{p.name}</Link></h3><span className="pid">{p.public_id}</span>
      <span className="muted">{[sub,p.style].filter(Boolean).join(' · ')}</span>
      <div><span className={'badge '+(p.in_stock?'in':'out')}>{p.in_stock?'In Stock':'Out of Stock'}</span></div>
      <button className="btn sm" style={{marginTop:'auto'}} onClick={()=>setAsk(true)}>Enquire on WhatsApp</button></div>
    {ask&&<Enquire p={p} close={()=>setAsk(false)}/>}</article>
}

const PQ='*, product_media(url,type,sort_order)'
function useProducts(){
  const [list,setList]=useState(null),[err,setErr]=useState('')
  useEffect(()=>{sb.from('products').select(PQ).eq('status','active').order('created_at',{ascending:false}).then(({data,error})=>{error?setErr(error.message):setList(data)})},[])
  return {list,err}
}

function Home(){
  const {cats,settings}=useApp(),{list,err}=useProducts(),[gal,setGal]=useState([]),[cols,setCols]=useState([])
  useEffect(()=>{title('Garg Boot House | Step Into Your Style.',settings.store_intro)
    sb.from('gallery_media').select('*').order('sort_order').then(r=>setGal(r.data||[]))
    sb.from('collections').select('*').eq('active',true).order('sort_order').then(r=>setCols(r.data||[]))},[])
  const tops=cats.filter(c=>!c.parent_id),neu=(list||[]).filter(p=>p.is_new).slice(0,8),feat=(list||[]).filter(p=>p.is_featured).slice(0,4)
  const mosaic=(list||[]).slice(0,3)
  return <>
  <section className="hero"><div className="wrap"><div>
    <p className="tag serif" style={{fontSize:'1.3rem'}}>Garg Boot House</p><h1>Step Into Your Style.</h1>
    <p>Heels, sneakers, sandals, formal and everyday footwear for men, women and kids, all in one store at Shastri Market, Kaithal.</p>
    <Link className="btn gold" to="/shop">Explore Collection</Link></div>
    <div className="mosaic">{[0,1,2].map(i=><div key={i} style={{backgroundImage:`url("${mosaic[i]?img(mosaic[i]):PLACEHOLDER}")`}}><span>{mosaic[i]?.name}</span></div>)}</div></div></section>
  <section className="sec wrap"><h2>Shop by Category</h2><div className="cats">{tops.map(t=><Link key={t.id} className="cat" to={`/shop?cat=${t.slug}`} style={{backgroundImage:`linear-gradient(#0000,#000a),url("${PLACEHOLDER}")`}}><h3>{t.name}</h3></Link>)}</div></section>
  <section className="sec wrap"><h2>New Arrivals</h2>{err&&<div className="msg err">{err}</div>}{!list?<p>Loading…</p>:neu.length?<div className="grid">{neu.map(p=><Card key={p.id} p={p}/>)}</div>:<p className="muted">New arrivals will appear here soon.</p>}</section>
  {feat.length>0&&<section className="sec wrap"><h2>Featured</h2><div className="grid">{feat.map(p=><Card key={p.id} p={p}/>)}</div></section>}
  {cols.length>0&&<section className="sec wrap"><h2>Explore Collections</h2><div className="cats">{cols.map(c=><Link key={c.id} className="cat" to="/shop" style={{backgroundImage:`linear-gradient(#0000,#000a),url("${c.image_url||PLACEHOLDER}")`}}><div><h3>{c.title}</h3><span>{c.description}</span></div></Link>)}</div></section>}
  {gal.length>0&&<section className="sec wrap"><h2>Store Gallery</h2><div className="gal">{gal.map(g=>g.type==='video'?<video key={g.id} src={g.url} controls preload="metadata"/>:<img key={g.id} loading="lazy" src={g.url} alt={g.caption||'Garg Boot House store'}/>)}</div></section>}
  <Visit/></>
}

function Visit(){
  const {settings:s}=useApp(),T='To be announced'
  return <section className="visit sec"><div className="wrap"><h2>Visit Us</h2><p>Come try on your next pair in person.</p>
    <p><b>Garg Boot House</b><br/>{s.address||'Shastri Market, Kaithal, Haryana'}<br/>Hours: {s.hours||T}<br/>Phone: {s.phone||T}</p>
    {s.maps_url&&<a className="btn" href={s.maps_url} target="_blank" rel="noopener noreferrer">Get Directions</a>}</div></section>
}

function Shop(){
  const {cats,opts}=useApp(),[sp,setSp]=useSearchParams(),{list,err}=useProducts()
  const q=(sp.get('q')||'').trim(),cat=sp.get('cat')||'',sub=sp.get('sub')||'',colour=sp.get('colour')||'',style=sp.get('style')||'',stock=sp.get('stock')||'',isNew=sp.get('new')==='1'
  const set=(k,v)=>{const n=new URLSearchParams(sp);v?n.set(k,v):n.delete(k);if(k==='cat')n.delete('sub');setSp(n)}
  const top=cats.find(c=>c.slug===cat&&!c.parent_id),subs=top?cats.filter(c=>c.parent_id===top.id):[],subC=subs.find(c=>c.slug===sub)
  useEffect(()=>title(`${top?.name||'All Footwear'} | Garg Boot House`),[top])
  const res=useMemo(()=>{
    if(!list)return []
    const nm=id=>cats.find(c=>c.id===id)?.name||''
    let r=list.filter(p=>(!top||p.category_id===top.id)&&(!subC||p.subcategory_id===subC.id)&&(!colour||p.colour===colour)&&(!style||p.style===style)&&(!stock||(stock==='in')===p.in_stock)&&(!isNew||p.is_new))
    if(q){const L=q.toLowerCase()
      const sc=p=>p.public_id.toLowerCase()===L?100:p.public_id.toLowerCase().includes(L)?50:p.name.toLowerCase().includes(L)?30:[nm(p.category_id),nm(p.subcategory_id),p.colour,p.style,p.description].join(' ').toLowerCase().includes(L)?10:0
      r=r.map(p=>[sc(p),p]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).map(x=>x[1])}
    return r},[list,cats,top,subC,colour,style,stock,isNew,q])
  const Sel=({k,v,label,items})=><div><label>{label}</label><select value={v} onChange={e=>set(k,e.target.value)}><option value="">All</option>{items.map(i=><option key={i.v} value={i.v}>{i.t}</option>)}</select></div>
  return <div className="wrap sec"><h2>{isNew?'New Arrivals':top?.name||(q?`Results for "${q}"`:'All Footwear')}</h2>
    <div className="filters">
      <div><label>Search</label><input defaultValue={q} key={q} onKeyDown={e=>e.key==='Enter'&&set('q',e.target.value.trim())} placeholder="Name, ID, colour…"/></div>
      <Sel k="cat" v={cat} label="Men / Women / Kids" items={cats.filter(c=>!c.parent_id).map(c=>({v:c.slug,t:c.name}))}/>
      {subs.length>0&&<Sel k="sub" v={sub} label="Subcategory" items={subs.map(c=>({v:c.slug,t:c.name}))}/>}
      <Sel k="colour" v={colour} label="Colour" items={opts.filter(o=>o.kind==='colour').map(o=>({v:o.name,t:o.name}))}/>
      <Sel k="style" v={style} label="Style" items={opts.filter(o=>o.kind==='style').map(o=>({v:o.name,t:o.name}))}/>
      <Sel k="stock" v={stock} label="Availability" items={[{v:'in',t:'In Stock'},{v:'out',t:'Out of Stock'}]}/>
      <div style={{alignSelf:'end'}}><button className="btn ghost sm" onClick={()=>setSp({})}>Clear all</button></div></div>
    {err&&<div className="msg err">{err}</div>}
    {!list?<p>Loading…</p>:res.length?<><p className="muted">{res.length} product{res.length>1?'s':''}</p><div className="grid">{res.map(p=><Card key={p.id} p={p}/>)}</div></>
      :<div className="msg">No products match. Try removing a filter or searching a different word.</div>}</div>
}

function Product(){
  const {pid}=useParams(),{cats}=useApp(),[p,setP]=useState(undefined),[rel,setRel]=useState([]),[i,setI]=useState(0),[ask,setAsk]=useState(false)
  useEffect(()=>{setP(undefined);setI(0);sb.from('products').select(PQ).ilike('public_id',pid).eq('status','active').maybeSingle().then(async({data})=>{setP(data);if(data){
    title(`${data.name} (${data.public_id}) | Garg Boot House`,data.description?.slice(0,150))
    const {data:r}=await sb.from('products').select(PQ).eq('status','active').eq('category_id',data.category_id).neq('id',data.id).limit(4);setRel(r||[])}})},[pid])
  if(p===undefined)return <p className="wrap sec">Loading…</p>
  if(!p)return <div className="wrap sec"><h2>Product not found</h2><Link className="btn" to="/shop">Browse all footwear</Link></div>
  const media=[...(p.product_media||[])].sort((a,b)=>a.sort_order-b.sort_order),cur=media[i]
  const n=id=>cats.find(c=>c.id===id)?.name
  return <div className="wrap sec"><div className="pd"><div>
    {cur?.type==='video'?<video className="main" src={cur.url} controls/>:<img className="main" src={cur?.url||PLACEHOLDER} alt={p.name}/>}
    {media.length>1&&<div className="thumbs">{media.map((m,k)=><img key={m.id} className={k===i?'on':''} src={m.type==='video'?PLACEHOLDER:m.url} alt={`View ${k+1}`} onClick={()=>setI(k)}/>)}</div>}</div>
    <div><h1 style={{fontSize:'2.6rem'}}>{p.name}</h1><p className="pid">Product ID: {p.public_id}</p>
      <span className={'badge '+(p.in_stock?'in':'out')}>{p.in_stock?'In Stock':'Out of Stock'}</span>
      <p style={{marginTop:16}}>{[n(p.category_id),n(p.subcategory_id)].filter(Boolean).join(' › ')}</p>
      <table className="tbl"><tbody>{p.colour&&<tr><td>Colour</td><td>{p.colour}</td></tr>}{p.style&&<tr><td>Style</td><td>{p.style}</td></tr>}</tbody></table>
      <p>{p.description}</p><button className="btn gold" onClick={()=>setAsk(true)}>Enquire on WhatsApp</button>
      <p className="muted">Prices are shared on enquiry. Visit the store to purchase.</p></div></div>
    {rel.length>0&&<><h2 style={{marginTop:50}}>You may also like</h2><div className="grid">{rel.map(r=><Card key={r.id} p={r}/>)}</div></>}
    {ask&&<Enquire p={p} close={()=>setAsk(false)}/>}</div>
}

function About(){const {settings}=useApp();useEffect(()=>title('About Us | Garg Boot House'),[])
  return <div className="wrap sec"><h2>About Garg Boot House</h2><p style={{maxWidth:640}}>{settings.store_intro}</p><Link className="btn" to="/contact">Find the store</Link></div>}
function Contact(){useEffect(()=>title('Contact | Garg Boot House'),[]);const {settings:s}=useApp()
  const wa=(s.whatsapp||'').replace(/\D/g,'')
  return <><div className="wrap sec"><h2>Contact</h2>
    <p>Phone: {s.phone||'To be announced'}<br/>Address: {s.address||'Shastri Market, Kaithal, Haryana'}<br/>Hours: {s.hours||'To be announced'}</p>
    <p style={{display:'flex',gap:10,flexWrap:'wrap'}}>{wa&&<a className="btn gold" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp us</a>}
    {s.maps_url&&<a className="btn" href={s.maps_url} target="_blank" rel="noopener noreferrer">Directions</a>}
    {s.instagram&&<a className="btn ghost" href={s.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
    {s.facebook&&<a className="btn ghost" href={s.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}</p></div><Visit/></>}
function TextPage(){const {k}=useParams(),{settings}=useApp();const ok=['privacy','terms'].includes(k)
  return <div className="wrap sec"><h2>{k==='terms'?'Terms and Conditions':'Privacy Policy'}</h2>{ok&&<p style={{whiteSpace:'pre-wrap',maxWidth:720}}>{settings[k]}</p>}</div>}

function Footer(){const {settings:s,cats}=useApp()
  return <footer><div className="wrap g"><div><img src="/logo.jpg" alt="Garg Boot House"/><p className="muted" style={{color:'#bbb'}}>{s.store_intro}</p></div>
    <div><h3>Explore</h3>{cats.filter(c=>!c.parent_id).map(c=><div key={c.id}><Link to={`/shop?cat=${c.slug}`}>{c.name}</Link></div>)}<div><Link to="/shop?new=1">New Arrivals</Link></div><div><Link to="/refer">Refer &amp; Earn</Link></div></div>
    <div><h3>Visit</h3><p>{s.address||'Shastri Market, Kaithal, Haryana'}<br/>{s.phone}<br/>{s.hours}</p>
      {s.instagram&&<div><a href={s.instagram} target="_blank" rel="noopener noreferrer">Instagram</a></div>}{s.facebook&&<div><a href={s.facebook} target="_blank" rel="noopener noreferrer">Facebook</a></div>}</div>
    <div><h3>Legal</h3><div><Link to="/page/privacy">Privacy Policy</Link></div><div><Link to="/page/terms">Terms and Conditions</Link></div></div></div>
    <div className="wrap muted" style={{color:'#888',marginTop:24}}>© {new Date().getFullYear()} Garg Boot House. Step Into Your Style.</div></footer>}

function Auth({mode}){
  const [sp]=useSearchParams(),nav=useNavigate(),{session}=useApp()
  const [f,setF]=useState({name:'',email:'',password:'',ref:sp.get('ref')||''}),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{if(session)nav('/account')},[session])
  const submit=async e=>{e.preventDefault();setMsg('');setBusy(true)
    if(f.password.length<8){setMsg('Password must be at least 8 characters.');setBusy(false);return}
    const r=mode==='login'?await sb.auth.signInWithPassword({email:f.email,password:f.password}):await sb.auth.signUp({email:f.email,password:f.password,options:{data:{full_name:f.name,referral_code:f.ref}}})
    setBusy(false);if(r.error)setMsg(r.error.message);else if(mode==='register'&&!r.data.session)setMsg('Account created. Check your email to confirm, then log in.')}
  return <form className="form" onSubmit={submit}><h2>{mode==='login'?'Log in':'Create account'}</h2>
    {mode==='register'&&<><label>Full name</label><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></>}
    <label>Email</label><input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/>
    <label>Password (8+ characters)</label><input type="password" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/>
    {mode==='register'&&<><label>Referral code (optional)</label><input value={f.ref} onChange={e=>setF({...f,ref:e.target.value.toUpperCase()})}/></>}
    {msg&&<div className="msg err">{msg}</div>}<p><button className="btn" disabled={busy}>{busy?'Please wait…':mode==='login'?'Log in':'Register'}</button></p>
    <p className="muted">{mode==='login'?<>New here? <Link to="/register"><u>Create an account</u></Link></>:<>Already registered? <Link to="/login"><u>Log in</u></Link></>}</p></form>
}

function useMine(){const {session}=useApp(),[rw,setRw]=useState([]),[rf,setRf]=useState([])
  useEffect(()=>{if(!session)return;sb.from('rewards').select('*').order('created_at',{ascending:false}).then(r=>setRw(r.data||[]));sb.from('referrals').select('*').then(r=>setRf(r.data||[]))},[session]);return {rw,rf}}

function RewardList({rw,pct}){return rw.length?<table className="tbl"><tbody>{rw.map(r=><tr key={r.id}><td className="pid">{r.status==='available'?r.code:'—'}</td><td>{pct}% off</td><td><span className="badge">{r.status}</span></td><td className="muted">{r.expires_at&&r.status==='available'?'Expires '+new Date(r.expires_at).toLocaleDateString():''}</td></tr>)}</tbody></table>:<p className="muted">No rewards yet.</p>}

function Account(){const {session,profile,settings}=useApp(),{rw,rf}=useMine(),nav=useNavigate()
  if(!session)return <Navigate to="/login"/>
  if(!profile)return <p className="wrap sec">Loading…</p>
  return <div className="wrap sec"><h2>My Account</h2><p>{profile.full_name}<br/>{profile.email}</p>
    <p><Link className="btn" to="/refer">Refer &amp; Earn</Link> <button className="btn ghost" onClick={async()=>{await sb.auth.signOut();nav('/')}}>Log out</button></p>
    <h3>My rewards</h3><RewardList rw={rw} pct={settings.referral_percent}/><p className="muted">People you referred: {rf.filter(r=>r.referrer_id===profile.id).length}</p></div>}

function Refer(){const {session,profile,settings:s}=useApp(),{rw,rf}=useMine(),[c,setC]=useState(false)
  const link=profile?`${location.origin}/register?ref=${profile.referral_code}`:'',pct=s.referral_percent||5
  const text=`Join Garg Boot House and we both get ${pct}% off! Register here: ${link}`
  return <div className="wrap sec"><h2>Refer &amp; Earn {pct}% Off</h2><div style={{maxWidth:680}}>
    <p>Refer a friend. When they register with your link and make a qualifying purchase in store, and the store verifies it, you both get {pct}% off.</p>
    {s.referral_min_purchase&&<p>Minimum purchase: ₹{s.referral_min_purchase}.</p>}<p className="muted">{s.referral_terms}</p>
    {!session?<p><Link className="btn gold" to="/register">Register to get your code</Link> <Link className="btn ghost" to="/login">Log in</Link></p>:!profile?<p>Loading…</p>:<>
      <h3>Your code: {profile.referral_code}</h3><input readOnly value={link} onFocus={e=>e.target.select()}/>
      <p className="acts" style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="btn" onClick={()=>{navigator.clipboard?.writeText(link);setC(true)}}>{c?'Copied':'Copy link'}</button>
      <a className="btn gold" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>Share on WhatsApp</a></p>
      <h3>Referral status</h3>{rf.length?<table className="tbl"><tbody>{rf.map(r=><tr key={r.id}><td>{r.referrer_id===profile.id?'You referred a friend':'You were referred'}</td><td><span className="badge">{r.status}</span></td></tr>)}</tbody></table>:<p className="muted">No referrals yet.</p>}
      <h3>My rewards</h3><RewardList rw={rw} pct={pct}/><p className="muted">Show your reward code at the store to redeem it.</p></>}</div></div>}
