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
  const { data, error } = await supabase.rpc('web_player_take_rate_limit', {
    p_bucket: bucket,
    p_subject_hash: subjectHash,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });
  if (error) throw new Error('WEB_RATE_LIMIT_UNAVAILABLE');
  if (data !== true) throw new Error('WEB_RATE_LIMITED');
}
