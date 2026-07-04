// Shared shapes for the community gallery client. Mirrors the API's CreationItem (see
// functions/api/_lib.ts) — keep the two in sync.

export type GallerySort = 'new' | 'top' | 'name'

export type CreationItem = {
  id: string
  name: string
  message: string
  tilingId: string
  imageUrl: string
  width: number
  height: number
  upvotes: number
  createdAt: number
}

export type ListResponse = { items: CreationItem[]; nextCursor: string | null }
