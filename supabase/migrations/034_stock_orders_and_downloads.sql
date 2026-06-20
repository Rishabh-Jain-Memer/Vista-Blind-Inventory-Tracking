-- Stock orders convert Add Stock into a supplier order workflow.
-- Inventory is only inserted when the stock order is received.

create table if not exists public.stock_orders (
  id uuid primary key default gen_random_uuid(),
  stock_order_uid text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text not null,
  status text not null default 'pending' check (status in ('pending', 'received', 'cancelled')),
  bill_no text,
  bill_date date,
  notes text,
  order_form_data jsonb not null default '{}'::jsonb,
  total_amount numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.stock_order_items (
  id uuid primary key default gen_random_uuid(),
  stock_order_id uuid not null references public.stock_orders(id) on delete cascade,
  line_no integer not null,
  item_type text not null default 'Fabric',
  category_id uuid references public.inv_categories(id) on delete set null,
  category_name text,
  variant_id uuid references public.inv_variants(id) on delete set null,
  variant_name text not null,
  batch_code text,
  quantity numeric(14,3) not null default 0,
  unit text not null default 'm',
  rate numeric(14,2) not null default 0,
  width_m numeric(14,3),
  line_total numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_order_downloads (
  id uuid primary key default gen_random_uuid(),
  stock_order_id uuid not null references public.stock_orders(id) on delete cascade,
  document_type text not null default 'stock_order',
  form_data jsonb not null default '{}'::jsonb,
  html text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_orders_created_at on public.stock_orders(created_at desc);
create index if not exists idx_stock_orders_status on public.stock_orders(status);
create index if not exists idx_stock_order_items_order on public.stock_order_items(stock_order_id, line_no);
create index if not exists idx_stock_order_downloads_order on public.stock_order_downloads(stock_order_id, created_at desc);

drop trigger if exists trg_stock_orders_updated_at on public.stock_orders;
create or replace function public.stock_orders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_stock_orders_updated_at
before update on public.stock_orders
for each row execute function public.stock_orders_set_updated_at();

alter table public.stock_orders enable row level security;
alter table public.stock_order_items enable row level security;
alter table public.stock_order_downloads enable row level security;

drop policy if exists "Admins can manage stock orders" on public.stock_orders;
create policy "Admins can manage stock orders" on public.stock_orders
  for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists "Admins can manage stock order items" on public.stock_order_items;
create policy "Admins can manage stock order items" on public.stock_order_items
  for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists "Admins can manage stock order downloads" on public.stock_order_downloads;
create policy "Admins can manage stock order downloads" on public.stock_order_downloads
  for all
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');
