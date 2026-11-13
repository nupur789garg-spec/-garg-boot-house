# Garg Boot House website

## 1. Supabase (free)
1. supabase.com > New project (save the database password).
2. SQL Editor > New query. First run: `insert into admin_emails values ('YOUR-ADMIN-EMAIL');` (replace it).
3. New query > paste all of `supabase/schema.sql` > Run.
4. Authentication > Providers > Email on. For testing, turn OFF "Confirm email" (or keep on and confirm via email).
5. Project Settings > API: copy the Project URL and the `anon public` key.
6. Register on your site with the admin email. That account becomes admin automatically.

## 2. Run locally (install Node.js LTS first)
```
copy .env.example to .env  and paste the two values
npm install
npm run dev
```

## 3. Deploy
1. Create a GitHub repo and upload this folder (`.env` is excluded).
2. Netlify > Add new site > Import from GitHub. Build command `npm run build`, publish directory `dist`.
3. Site settings > Environment variables: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Redeploy.
4. Supabase > Authentication > URL Configuration: set Site URL to your Netlify address.
