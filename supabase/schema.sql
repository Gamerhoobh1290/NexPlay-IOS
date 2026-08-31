-- NexPlay logical schema for metadata/state sync

create table if not exists profiles (
    id uuid primary key,
    email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists settings (
    user_id uuid not null,
    key text not null,
    value jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, key)
);

create table if not exists tracks_meta (
    user_id uuid not null,
    track_id text not null,
    payload jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, track_id)
);

create table if not exists playlists (
    user_id uuid not null,
    playlist_id text not null,
    name text not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, playlist_id)
);

create table if not exists playlist_items (
    user_id uuid not null,
    playlist_id text not null,
    track_id text not null,
    position int not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, playlist_id, track_id)
);

create table if not exists history_events (
    user_id uuid not null,
    event_id text not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, event_id)
);

create table if not exists lyrics_cache (
    user_id uuid not null,
    lyrics_key text not null,
    payload jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, lyrics_key)
);

create table if not exists automation_rules (
    user_id uuid not null,
    rule_id text not null,
    payload jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, rule_id)
);
