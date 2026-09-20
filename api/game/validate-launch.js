import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function cors(req, res) {
  const requestedHeaders = req.headers['access-control-request-headers'] || 'content-type';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return res.status(500).json({ ok: false, error: 'Server configuration is incomplete.' });

  const token = String(req.body?.token || '').trim();
  const activityId = String(req.body?.activityId || '').trim();
  if (!token || !activityId) return res.status(400).json({ ok: false, error: 'Missing launch token.' });

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: launch, error } = await admin
    .from('game_launch_tokens')
    .select('id,activity_id,expires_at')
    .eq('token_hash', hash)
    .eq('activity_id', activityId)
    .maybeSingle();

  if (error || !launch) return res.status(403).json({ ok: false, error: 'Invalid launch.' });
  if (new Date(launch.expires_at) <= new Date()) return res.status(403).json({ ok: false, error: 'Launch expired.' });

  const { data: target } = await admin
    .from('activity_targets')
    .select('enabled')
    .eq('activity_id', activityId)
    .maybeSingle();
  const { data: activity } = await admin
    .from('activities')
    .select('published')
    .eq('id', activityId)
    .maybeSingle();

  if (!target?.enabled || !activity?.published) return res.status(403).json({ ok: false, error: 'Activity is disabled.' });

  await admin.from('game_launch_tokens').update({ last_validated_at: new Date().toISOString() }).eq('id', launch.id);
  return res.status(200).json({ ok: true, expiresAt: launch.expires_at });
}
