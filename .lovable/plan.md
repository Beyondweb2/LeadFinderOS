## Create `barber-site-images` storage bucket + policies

The previous attempt failed because this workspace blocks public buckets. Two options:

### Option A (recommended): Enable public buckets, then create
1. You enable public buckets in **Lovable Cloud → Settings → Privacy & Security** (owner/admin only).
2. I create `barber-site-images` as a public bucket (5 MB cap, image MIME types).
3. I apply a migration on `storage.objects` adding:
   - Public read (anyone) for `bucket_id = 'barber-site-images'`
   - Admin-only INSERT / UPDATE / DELETE via `public.has_role(auth.uid(), 'admin')`

### Option B: Keep bucket private, serve via signed URLs
1. I create `barber-site-images` as a private bucket.
2. Same admin-only write policies; reads happen through signed URLs generated server-side (edge function or signed URL on render).
3. Requires changes to the barber site rendering code to request signed URLs instead of using public URLs.

Which do you want — A (enable public buckets) or B (private + signed URLs)?