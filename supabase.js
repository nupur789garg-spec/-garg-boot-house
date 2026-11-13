import {createClient} from '@supabase/supabase-js'
export const sb=createClient(import.meta.env.VITE_SUPABASE_URL||'http://localhost',import.meta.env.VITE_SUPABASE_ANON_KEY||'missing')
export const CONFIGURED=!!import.meta.env.VITE_SUPABASE_URL
export const PLACEHOLDER=`data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#E9E2D3"/><path d="M150 380c40-10 60-60 80-110l40 30c30 20 80 20 130 40 20 8 30 20 30 40H150z" fill="none" stroke="#C5A46D" stroke-width="8"/><text x="300" y="470" font-size="26" fill="#111" text-anchor="middle" font-family="sans-serif">Photo coming soon</text></svg>')}`
