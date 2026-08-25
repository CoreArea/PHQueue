import { supabase } from '../lib/supabase.js';

function response(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  // Simple health check
  if (req.method === 'GET') {
    return response(res, 200, {
      success: true,
      message: 'PHQueue API is running.'
    });
  }

  if (req.method !== 'POST') {
    return response(res, 405, {
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.'
      }
    });
  }

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});

    const action = body.action;
    const payload = body.payload || {};

    // ---------------------------------------------------------
    // TEST / INITIAL STATE
    // ---------------------------------------------------------

    if (action === 'getAppState') {
      const [
        playersResult,
        matchesResult,
        sessionsResult,
        settingsResult
      ] = await Promise.all([
        supabase
          .from('players')
          .select('*')
          .order('name'),

        supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: true }),

        supabase
          .from('sessions')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('app_settings')
          .select('*')
      ]);

      if (playersResult.error) {
        throw playersResult.error;
      }

      if (matchesResult.error) {
        throw matchesResult.error;
      }

      if (sessionsResult.error) {
        throw sessionsResult.error;
      }

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      const players = playersResult.data || [];
      const matches = matchesResult.data || [];
      const sessions = sessionsResult.data || [];
      const settings = settingsResult.data || [];

      return response(res, 200, {
        success: true,

        state: {
          players,
          matches,
          sessions,
          settings,

          session: {
            id: null,
            active: false,
            courtCount: 4,
            revision: 0
          },

          leaderboards: {
            session: [],
            allTime: []
          },

          upNext: []
        },

        message: ''
      });
    }

    // ---------------------------------------------------------
    // DATABASE CONNECTION TEST
    // ---------------------------------------------------------

    if (action === 'testDatabase') {
      const { data, error } = await supabase
        .from('players')
        .select('id')
        .limit(1);

      if (error) {
        throw error;
      }

      return response(res, 200, {
        success: true,
        message: 'Supabase connection is working.',
        playerCountTest: data?.length || 0
      });
    }

    return response(res, 400, {
      success: false,
      error: {
        code: 'UNKNOWN_ACTION',
        message: `Unknown action: ${action}`
      }
    });

  } catch (error) {
    console.error('PHQueue API error:', error);

    return response(res, 500, {
      success: false,
      error: {
        code: error.code || 'SERVER_ERROR',
        message: error.message || String(error),
        details: error.details || null,
        hint: error.hint || null
      }
    });
  }
}
