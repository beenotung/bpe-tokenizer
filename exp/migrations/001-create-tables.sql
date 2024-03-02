-- Up
create table if not exists corpus (
  id integer primary key
, content_code text not null
, created_at text not null default CURRENT_TIMESTAMP
, updated_at text null
);
create table if not exists token (
  id integer primary key
, chars text not null
, weight integer not null
, original_weight integer not null
, code text not null
, created_at text not null default CURRENT_TIMESTAMP
, updated_at text null
);
create table if not exists char_token (
  id integer primary key
, created_at text not null default CURRENT_TIMESTAMP
, updated_at text null
);
create table if not exists merge (
  id integer primary key
, a_id integer not null references token(id)
, b_id integer not null references token(id)
, c_id integer not null references token(id)
, created_at text not null default CURRENT_TIMESTAMP
, updated_at text null
);

-- Down
drop table if exists merge;
drop table if exists char_token;
drop table if exists token;
drop table if exists corpus;
