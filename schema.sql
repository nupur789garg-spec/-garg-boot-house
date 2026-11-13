-- GARG BOOT HOUSE: run this whole file once in Supabase > SQL Editor
create extension if not exists pgcrypto;

create table admin_emails(email text primary key);
alter table admin_emails enable row level security; -- no policies = private

create table profiles(
 id uuid primary key references auth.users on delete cascade,
 email text, full_name text, phone text,
 referral_code text unique not null,
 role text not null default 'customer' check (role in ('customer','admin')),
 created_at timestamptz default now());

create or replace function is_admin() returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

create table categories(
 id uuid primary key default gen_random_uuid(),
 name text not null, slug text unique not null,
 parent_id uuid references categories on delete cascade,
 sort_order int default 0, created_at timestamptz default now());

create table filter_options(
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('style','colour')),
 name text not null, unique(kind,name));

create table id_counters(prefix text primary key, last int not null default 0);

create table products(
 id uuid primary key default gen_random_uuid(),
 public_id text unique not null default 'pending',
 name text not null check (length(trim(name))>0),
 category_id uuid references categories on delete set null,
 subcategory_id uuid references categories on delete set null,
 colour text, style text, description text,
 in_stock boolean not null default true,
 is_new boolean not null default false,
 is_featured boolean not null default false,
 status text not null default 'active' check (status in ('active','hidden','archived')),
 created_at timestamptz default now());
create index on products(status,created_at desc);
create index on products(category_id);

create or replace function set_public_id() returns trigger language plpgsql security definer set search_path=public as $$
declare pfx text; n int;
begin
 select upper(left(name,1)) into pfx from categories where id=new.category_id;
 pfx:=coalesce(pfx,'X');
 insert into id_counters(prefix,last) values(pfx,1)
  on conflict(prefix) do update set last=id_counters.last+1 returning last into n;
 new.public_id:='GBH-'||pfx||'-'||lpad(n::text,3,'0');
 return new;
end $$;
create trigger trg_pid before insert on products for each row execute function set_public_id();

create or replace function lock_public_id() returns trigger language plpgsql as $$
begin if new.public_id<>old.public_id then raise exception 'Product ID cannot be changed'; end if; return new; end $$;
create trigger trg_lock before update on products for each row execute function lock_public_id();

create table product_media(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references products on delete cascade,
 url text not null, type text not null default 'image' check (type in ('image','video')),
 sort_order int default 0);
create index on product_media(product_id);

create table gallery_media(
 id uuid primary key default gen_random_uuid(),
 url text not null, type text not null default 'image' check (type in ('image','video')),
 caption text, sort_order int default 0, created_at timestamptz default now());

create table collections(
 id uuid primary key default gen_random_uuid(),
 title text not null, description text, image_url text, sort_order int default 0, active boolean default true);
create table collection_products(
 collection_id uuid references collections on delete cascade,
 product_id uuid references products on delete cascade,
 primary key(collection_id,product_id));

create table store_settings(key text primary key, value text not null default '');

create table referrals(
 id uuid primary key default gen_random_uuid(),
 referrer_id uuid not null references profiles on delete cascade,
 referred_id uuid not null unique references profiles on delete cascade,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz default now(), reviewed_at timestamptz,
 check (referrer_id<>referred_id));

create table rewards(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references profiles on delete cascade,
 referral_id uuid not null references referrals on delete cascade,
 code text unique not null,
 status text not null default 'pending' check (status in ('pending','approved','available','redeemed','expired','rejected')),
 expires_at timestamptz, redeemed_at timestamptz, created_at timestamptz default now(),
 unique(user_id,referral_id));

create or replace function gen_code() returns text language sql as
$$ select 'GBH-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,8)) $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare rc text; ref uuid; rid uuid;
begin
 insert into profiles(id,email,full_name,referral_code,role) values(
  new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),
  'GBH'||upper(substr(md5(random()::text||new.id::text),1,6)),
  case when exists(select 1 from admin_emails where lower(email)=lower(new.email)) then 'admin' else 'customer' end);
 rc:=upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
 if rc<>'' then
  select id into ref from profiles where referral_code=rc and id<>new.id;
  if ref is not null then
   insert into referrals(referrer_id,referred_id) values(ref,new.id) returning id into rid;
   insert into rewards(user_id,referral_id,code) values(ref,rid,gen_code()),(new.id,rid,gen_code());
  end if;
 end if;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create or replace function admin_review_referral(rid uuid, approve boolean) returns void
language plpgsql security definer set search_path=public as $$
declare d int;
begin
 if not is_admin() then raise exception 'Not allowed'; end if;
 update referrals set status=case when approve then 'approved' else 'rejected' end, reviewed_at=now()
  where id=rid and status='pending';
 if not found then raise exception 'Referral is not pending'; end if;
 if approve then
  select coalesce(nullif(value,'')::int,0) into d from store_settings where key='referral_expiry_days';
  update rewards set status='available',
   expires_at=case when coalesce(d,0)>0 then now()+make_interval(days=>d) end
   where referral_id=rid and status='pending';
 else update rewards set status='rejected' where referral_id=rid and status='pending'; end if;
end $$;

create or replace function admin_redeem_reward(rcode text) returns rewards
language plpgsql security definer set search_path=public as $$
declare r rewards;
begin
 if not is_admin() then raise exception 'Not allowed'; end if;
 update rewards set status='redeemed', redeemed_at=now()
  where code=upper(trim(rcode)) and status='available' and (expires_at is null or expires_at>now())
  returning * into r;
 if r.id is null then raise exception 'Invalid, expired or already redeemed code'; end if;
 return r;
end $$;

-- ROW LEVEL SECURITY
do $$ declare t text; begin
 foreach t in array array['categories','filter_options','store_settings','gallery_media','collections','collection_products','product_media','products','profiles','referrals','rewards','id_counters'] loop
  execute format('alter table %I enable row level security',t);
 end loop;
 foreach t in array array['categories','filter_options','store_settings','gallery_media','collections','collection_products','product_media','products'] loop
  execute format('create policy "admin all" on %I for all using (is_admin()) with check (is_admin())',t);
 end loop;
 foreach t in array array['categories','filter_options','store_settings','gallery_media','collections','collection_products','product_media'] loop
  execute format('create policy "public read" on %I for select using (true)',t);
 end loop;
end $$;
create policy "public read active" on products for select using (status='active');
create policy "own profile" on profiles for select using (id=auth.uid() or is_admin());
create policy "update own profile" on profiles for update using (id=auth.uid());
revoke update on profiles from authenticated, anon;
grant update(full_name,phone) on profiles to authenticated;
create policy "own referrals" on referrals for select using (referrer_id=auth.uid() or referred_id=auth.uid() or is_admin());
create policy "own rewards" on rewards for select using (user_id=auth.uid() or is_admin());

-- STORAGE
insert into storage.buckets(id,name,public) values('media','media',true) on conflict do nothing;
create policy "media read" on storage.objects for select using (bucket_id='media');
create policy "media admin write" on storage.objects for all using (bucket_id='media' and is_admin()) with check (bucket_id='media' and is_admin());

-- STARTER DATA (all editable later in admin)
insert into categories(name,slug,sort_order) values('Men','men',1),('Women','women',2),('Kids','kids',3);
insert into filter_options(kind,name) values('style','Casual'),('style','Party Wear'),('style','Formal'),('style','Daily Wear'),
 ('colour','Black'),('colour','Brown'),('colour','White'),('colour','Tan'),('colour','Gold');
insert into store_settings(key,value) values
 ('store_intro','Footwear for men, women and kids at Shastri Market, Kaithal, Haryana.'),
 ('address',''),('phone',''),('whatsapp',''),('hours',''),('maps_url',''),('instagram',''),('facebook',''),('announcement',''),
 ('referral_percent','5'),('referral_min_purchase',''),('referral_expiry_days','0'),
 ('referral_terms','When a customer you refer makes a qualifying purchase in store, and the store verifies it, you both get a discount. Redeem it at the shop by showing your reward code.'),
 ('privacy','Privacy Policy: edit this text from the admin dashboard.'),
 ('terms','Terms and Conditions: edit this text from the admin dashboard.');

-- ADMIN: run this with YOUR admin email BEFORE you register that account:
-- insert into admin_emails values ('owner@example.com');
