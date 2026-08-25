import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error('Supabase environment variables are missing.');
  }

  return createClient(
    url,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

function starsFromElo(elo) {
  const value = Number(elo);

  if (!Number.isFinite(value)) return 1;
  if (value < 1000) return 1;
  if (value < 1200) return 2;
  if (value < 1400) return 3;
  if (value < 1600) return 4;
  if (value < 1800) return 5;

  return 6;
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();

    if (req.method === 'GET') {

      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name', {
          ascending: true
        });

      if (error) {
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      return res.status(200).json({
        success: true,
        players: data || []
      });
    }

    if (req.method === 'POST') {

      const body =
        typeof req.body === 'string'
          ? JSON.parse(req.body)
          : (req.body || {});

      const name = String(
        body.name || ''
      ).trim();

      const gender = String(
        body.gender || ''
      ).trim();

      const starTier = Number(
        body.starTier || 1
      );

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Player name is required.'
        });
      }

      if (
        !Number.isInteger(starTier) ||
        starTier < 1 ||
        starTier > 6
      ) {
        return res.status(400).json({
          success: false,
          error: 'Star tier must be between 1 and 6.'
        });
      }

      const elo =
        ({
          1: 800,
          2: 1000,
          3: 1200,
          4: 1400,
          5: 1600,
          6: 1800
        })[starTier];

      const id =
        'P-' +
        crypto.randomUUID()
          .replace(/-/g, '')
          .substring(0, 12)
          .toUpperCase();

      const { data, error } = await supabase
        .from('players')
        .insert({
          id,
          name,
          gender,
          star_tier: starsFromElo(elo),
          elo,
          status: 'Checked Out',
          games_played: 0,
          wins: 0
        })
        .select()
        .single();

      if (error) {

        if (
          error.code === '23505'
        ) {
          return res.status(409).json({
            success: false,
            error: 'A player with that name already exists.'
          });
        }

        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      return res.status(201).json({
        success: true,
        player: data
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed.'
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
