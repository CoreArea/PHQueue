import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('players')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vercel is connected to Supabase.',
      playersTableAccessible: true,
      rowsFound: data.length
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
