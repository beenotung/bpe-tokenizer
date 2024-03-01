import { proxySchema } from 'better-sqlite3-proxy'
import { db } from './db'

export type SourceGroup = {
  id?: null | number
  slug: string
  member_count: number
}

export type SourceUser = {
  id?: null | number
  name: string
  icon: string
  ban_time: null | number
  is_tutor: null | boolean
  is_student: null | boolean
  is_center: null | boolean
  is_sport: null | boolean
  is_music: null | boolean
  is_dance: null | boolean
  is_ads: null | boolean
  is_sell: null | boolean
}

export type SourcePost = {
  id?: null | number
  source_group_id: number
  source_group?: SourceGroup
  post_at: string
  post_time: null | number
  source_user_id: number
  source_user?: SourceUser
  content: string
  update_time: number
}

export type DBProxy = {
  source_group: SourceGroup[]
  source_user: SourceUser[]
  source_post: SourcePost[]
}

export let proxy = proxySchema<DBProxy>({
  db,
  tableFields: {
    source_group: [],
    source_user: [],
    source_post: [
      /* foreign references */
      ['source_group', { field: 'source_group_id', table: 'source_group' }],
      ['source_user', { field: 'source_user_id', table: 'source_user' }],
    ],
  },
})
