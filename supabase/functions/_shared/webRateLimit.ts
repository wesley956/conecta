import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { webRateSubject } from './webPlayerSecurity.ts';

export type WebRateBucket = 'refresh' | 'catalog' | 'playback' | 'diagnostic' | 'panel';

const POLICY: Record<WebRateBucket, { limit: number; windowSeconds: number }> = {
  refresh: { limit: 20, windowSeconds: 60 },
  catalog: { limit: 40, windowSeconds: 60 },
  playback: { limit: 60, windowSeconds: 60 },
  diagnostic: { limit: 40, windowSeconds: 60 },
  panel: { limit: 40, windowSeconds: 60 },
};

export async function enforceWebRateLimit(
  supabase: SupabaseClient,
  bucket: WebRateBucket,
  subject: string,
) {
  const policy = POLICY[bucket];
  const subjectHash = await webRateSubject(subject);
  const since = new Date(Date.now() - policy.windowSeconds * 1000).toISOString();
  const { count, error } = await supabase.from('web_player_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .eq('subject_hash', subjectHash)
    .gte('occurred_at', since);
  if (error) throw new Error('WEB_RATE_LIMIT_UNAVAILABLE');
  if (Number(count || 0) >= policy.limit) throw new Error('WEB_RATE_LIMITED');
  const { error: insertError } = await supabase.from('web_player_rate_events').insert({
    subject_hash: subjectHash,
    bucket,
  });
  if (insertError) throw new Error('WEB_RATE_LIMIT_UNAVAILABLE');
}
