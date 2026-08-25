import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);


/* =========================================================
   CONSTANTS
   ========================================================= */

const MIN_COURTS = 1;
const MAX_COURTS = 6;
const DEFAULT_COURTS = 4;

const ELO_K = 20;

const STAR_ELO = {
  1: 800,
  2: 900,
  3: 1000,
  4: 1100,
  5: 1200,
  6: 1300
};


/* =========================================================
   RESPONSE
   ========================================================= */

function send(res, status, body) {
  return res
    .status(status)
    .json(body);
}


/* =========================================================
   HELPERS
   ========================================================= */

function normalizeName(value) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}


function displayName(value) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}


function generateId(prefix) {

  return (
    prefix +
    '-' +
    crypto.randomUUID()
      .replace(/-/g, '')
      .substring(0, 12)
      .toUpperCase()
  );
}


function eloFromStars(stars) {

  return (
    STAR_ELO[
      Number(stars)
    ] ||
    STAR_ELO[1]
  );
}


function starsFromElo(elo) {

  const rating =
    Number(elo) || 800;

  let closest = 1;
  let distance = Infinity;

  for (
    const [star, base] of
    Object.entries(STAR_ELO)
  ) {

    const d =
      Math.abs(
        rating -
        Number(base)
      );

    if (d < distance) {
      distance = d;
      closest = Number(star);
    }
  }

  return closest;
}


function serializePlayer(player) {

  const games =
    Number(
      player.games_played ??
      player.gamesPlayed ??
      0
    );

  const wins =
    Number(
      player.wins ??
      0
    );

  const elo =
    Number(
      player.elo ??
      player.elo_rating ??
      800
    );

  return {

    id: player.id,

    name: player.name,

    gender:
      player.gender || '',

    starTier:
      starsFromElo(elo),

    elo: Math.round(elo),

    status:
      player.status ||
      'Checked Out',

    gamesPlayed: games,

    wins,

    winPercentage:
      games
        ? Math.round(
            (wins / games) *
            1000
          ) / 10
        : 0,

    idleTimestamp:
      player.idle_timestamp ??
      player.idleTimestamp ??
      null
  };
}


function serializeMatch(
  match,
  playerMap
) {

  function getPlayer(id) {

    return playerMap[id]
      ? serializePlayer(
          playerMap[id]
        )
      : {
          id,
          name: 'Unknown',
          starTier: 1,
          elo: 800,
          status: 'Unknown',
          gamesPlayed: 0,
          wins: 0,
          winPercentage: 0
        };
  }

  return {

    id: match.id,

    court:
      Number(match.court),

    status:
      match.status,

    winner:
      match.score_winner ??
      match.scoreWinner ??
      '',

    timestamp:
      match.timestamp ||
      null,

    team1: [
      getPlayer(
        match.team1_player1 ??
        match.team1Player1
      ),

      getPlayer(
        match.team1_player2 ??
        match.team1Player2
      )
    ],

    team2: [
      getPlayer(
        match.team2_player1 ??
        match.team2Player1
      ),

      getPlayer(
        match.team2_player2 ??
        match.team2Player2
      )
    ]
  };
}


/* =========================================================
   DATABASE
   ========================================================= */

async function getPlayers() {

  const {
    data,
    error
  } =
    await supabase
      .from('players')
      .select('*')
      .order('name');

  if (error) {
    throw error;
  }

  return data || [];
}


async function getMatches() {

  const {
    data,
    error
  } =
    await supabase
      .from('matches')
      .select('*')
      .order(
        'timestamp',
        {
          ascending: true
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


async function getSessions() {

  const {
    data,
    error
  } =
    await supabase
      .from('sessions')
      .select('*')
      .order(
        'created_at',
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


async function getSettings() {

  const {
    data,
    error
  } =
    await supabase
      .from('app_settings')
      .select('*');

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   SESSION
   ========================================================= */

async function getCurrentSession() {

  const sessions =
    await getSessions();

  const active =
    sessions.find(
      session =>
        session.active === true
    );

  if (!active) {

    return {
      id: null,
      active: false,
      courtCount:
        DEFAULT_COURTS,
      revision: 0
    };
  }

  return {

    id: active.id,

    active: true,

    courtCount:
      Number(
        active.court_count ||
        DEFAULT_COURTS
      ),

    revision:
      Number(
        active.revision ||
        0
      )
  };
}


/* =========================================================
   APP STATE
   ========================================================= */

async function buildState() {

  const [
    players,
    matches,
    sessions,
    settings
  ] =
    await Promise.all([
      getPlayers(),
      getMatches(),
      getSessions(),
      getSettings()
    ]);

  const session =
    await getCurrentSession();

  const playerMap = {};

  players.forEach(
    player => {
      playerMap[player.id] =
        player;
    }
  );

  return {

    players:
      players.map(
        serializePlayer
      ),

    matches:
      matches.map(
        match =>
          serializeMatch(
            match,
            playerMap
          )
      ),

    sessions,

    settings,

    session,

    leaderboards:
      buildLeaderboards(
        players,
        matches,
        session.id
      ),

    upNext:
      buildUpNext(
        players
      )
  };
}


/* =========================================================
   LEADERBOARDS
   ========================================================= */

function buildLeaderboards(
  players,
  matches,
  sessionId
) {

  const allTime =
    players
      .map(
        player =>
          serializePlayer(
            player
          )
      )
      .sort(
        (a, b) =>
          b.elo -
          a.elo
      );

  const sessionStats = {};

  players.forEach(
    player => {

      sessionStats[player.id] = {

        playerId:
          player.id,

        name:
          player.name,

        elo:
          Number(
            player.elo || 800
          ),

        games: 0,

        wins: 0
      };
    }
  );

  matches
    .filter(
      match =>
        match.session_id ===
          sessionId &&

        match.status ===
          'Completed' &&

        (
          match.score_winner ===
            'Team 1' ||

          match.score_winner ===
            'Team 2'
        )
    )
    .forEach(
      match => {

        const team1 = [
          match.team1_player1,
          match.team1_player2
        ];

        const team2 = [
          match.team2_player1,
          match.team2_player2
        ];

        [
          ...team1,
          ...team2
        ].forEach(
          id => {

            if (
              sessionStats[id]
            ) {
              sessionStats[id]
                .games++;
            }
          }
        );

        const winners =
          match.score_winner ===
          'Team 1'
            ? team1
            : team2;

        winners.forEach(
          id => {

            if (
              sessionStats[id]
            ) {
              sessionStats[id]
                .wins++;
            }
          }
        );
      }
    );

  const session =
    Object.values(
      sessionStats
    )
    .map(
      row => ({

        playerId:
          row.playerId,

        name:
          row.name,

        elo:
          row.elo,

        games:
          row.games,

        wins:
          row.wins,

        winPercentage:
          row.games
            ? Math.round(
                (
                  row.wins /
                  row.games
                ) * 1000
              ) / 10
            : 0
      })
    )
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.elo - a.elo
    );

  return {
    allTime,
    session
  };
}


/* =========================================================
   UP NEXT
   ========================================================= */

function buildUpNext(
  players
) {

  return players

    .filter(
      player =>
        player.status ===
        'Waiting'
    )

    .sort(
      (a, b) => {

        const at =
          a.idle_timestamp
            ? new Date(
                a.idle_timestamp
              ).getTime()
            : Date.now();

        const bt =
          b.idle_timestamp
            ? new Date(
                b.idle_timestamp
              ).getTime()
            : Date.now();

        return at - bt;
      }
    )

    .map(
      (player, index) => ({

        queuePosition:
          index + 1,

        player:
          serializePlayer(
            player
          )
      })
    );
}


/* =========================================================
   REGISTER
   ========================================================= */

async function registerPlayer(
  payload
) {

  const name =
    displayName(
      payload.name
    );

  const gender =
    String(
      payload.gender || ''
    ).trim();

  const starTier =
    Number(
      payload.starTier
    );

  if (!name) {
    throw new Error(
      'Player name is required.'
    );
  }

  if (
    !Number.isInteger(
      starTier
    ) ||
    starTier < 1 ||
    starTier > 6
  ) {
    throw new Error(
      'Star level must be between 1 and 6.'
    );
  }

  const players =
    await getPlayers();

  const existing =
    players.find(
      player =>
        normalizeName(
          player.name
        ) ===
        normalizeName(
          name
        )
    );

  if (existing) {

    return {
      duplicate: true,

      existing:
        serializePlayer(
          existing
        )
    };
  }

  const elo =
    eloFromStars(
      starTier
    );

  const player = {

    id:
      generateId('P'),

    name,

    gender,

    star_tier:
      starTier,

    elo,

    status:
      'Checked Out',

    games_played: 0,

    wins: 0,

    idle_timestamp: null
  };

  const {
    error
  } =
    await supabase
      .from('players')
      .insert(
        player
      );

  if (error) {
    throw error;
  }

  return {

    state:
      await buildState(),

    message:
      `${name} registered.`
  };
}


/* =========================================================
   CHECK IN
   ========================================================= */

async function checkInPlayer(
  payload
) {

  const playerId =
    String(
      payload.playerId
    );

  const {
    data: player,
    error
  } =
    await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

  if (error) {
    throw error;
  }

  if (
    player.status ===
    'Playing'
  ) {
    throw new Error(
      `${player.name} is already playing.`
    );
  }

  const {
    error: updateError
  } =
    await supabase
      .from('players')
      .update({

        status:
          'Waiting',

        idle_timestamp:
          new Date().toISOString()
      })
      .eq(
        'id',
        playerId
      );

  if (updateError) {
    throw updateError;
  }

  return {

    state:
      await buildState(),

    message:
      `${player.name} checked in.`
  };
}


/* =========================================================
   CHECK OUT
   ========================================================= */

async function checkOutPlayer(
  payload
) {

  const playerId =
    String(
      payload.playerId
    );

  const {
    data: player,
    error
  } =
    await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

  if (error) {
    throw error;
  }

  if (
    player.status ===
    'Playing'
  ) {
    throw new Error(
      `${player.name} is currently playing.`
    );
  }

  const {
    error: updateError
  } =
    await supabase
      .from('players')
      .update({

        status:
          'Checked Out',

        idle_timestamp:
          null
      })
      .eq(
        'id',
        playerId
      );

  if (updateError) {
    throw updateError;
  }

  return {

    state:
      await buildState(),

    message:
      `${player.name} checked out.`
  };
}


/* =========================================================
   START SESSION
   ========================================================= */

async function startSession() {

  const current =
    await getCurrentSession();

  if (current.active) {

    return {
      state:
        await buildState(),

      message:
        'Session is already active.'
    };
  }

  const session = {

    id:
      generateId('SES'),

    active:
      true,

    court_count:
      DEFAULT_COURTS,

    revision:
      1
  };

  const {
    error
  } =
    await supabase
      .from('sessions')
      .insert(
        session
      );

  if (error) {
    throw error;
  }

  return {

    state:
      await buildState(),

    message:
      'Session started.'
  };
}


/* =========================================================
   END SESSION
   ========================================================= */

async function endSession() {

  const current =
    await getCurrentSession();

  if (!current.active) {

    return {
      state:
        await buildState(),

      message:
        'No active session.'
    };
  }

  /*
   * Cancel active matches.
   */

  const {
    error:
      matchError
  } =
    await supabase
      .from('matches')
      .update({

        status:
          'Completed',

        score_winner:
          'CANCELLED'
      })
      .eq(
        'session_id',
        current.id
      )
      .eq(
        'status',
        'Active'
      );

  if (matchError) {
    throw matchError;
  }


  /*
   * Check everyone out.
   */

  const {
    error:
      playerError
  } =
    await supabase
      .from('players')
      .update({

        status:
          'Checked Out',

        idle_timestamp:
          null
      })
      .neq(
        'id',
        ''
      );

  if (playerError) {
    throw playerError;
  }


  /*
   * End session.
   */

  const {
    error:
      sessionError
  } =
    await supabase
      .from('sessions')
      .update({
        active: false
      })
      .eq(
        'id',
        current.id
      );

  if (sessionError) {
    throw sessionError;
  }

  return {

    state:
      await buildState(),

    message:
      'Session ended. All players were checked out.'
  };
}


/* =========================================================
   COURTS
   ========================================================= */

async function setCourtCount(
  payload
) {

  const courtCount =
    Number(
      payload.courtCount
    );

  if (
    !Number.isInteger(
      courtCount
    ) ||
    courtCount < MIN_COURTS ||
    courtCount > MAX_COURTS
  ) {
    throw new Error(
      'Court count must be between 1 and 6.'
    );
  }

  const session =
    await getCurrentSession();

  if (!session.active) {
    throw new Error(
      'Start a session first.'
    );
  }

  const matches =
    await getMatches();

  const conflict =
    matches.some(
      match =>
        match.session_id ===
          session.id &&

        match.status ===
          'Active' &&

        Number(match.court) >
          courtCount
    );

  if (conflict) {
    throw new Error(
      'Finish or cancel the higher-numbered active court first.'
    );
  }

  const {
    error
  } =
    await supabase
      .from('sessions')
      .update({

        court_count:
          courtCount,

        revision:
          Number(
            session.revision
          ) + 1
      })
      .eq(
        'id',
        session.id
      );

  if (error) {
    throw error;
  }

  return {

    state:
      await buildState(),

    message:
      'Court count updated.'
  };
}


/* =========================================================
   START MATCH
   ========================================================= */

async function startMatch(
  payload
) {

  const session =
    await getCurrentSession();

  if (!session.active) {
    throw new Error(
      'Start a session first.'
    );
  }

  const team1 =
    (payload.team1 || [])
      .map(String);

  const team2 =
    (payload.team2 || [])
      .map(String);

  if (
    team1.length !== 2 ||
    team2.length !== 2
  ) {
    throw new Error(
      'A match needs four players.'
    );
  }

  const ids =
    team1.concat(team2);

  if (
    new Set(ids).size !== 4
  ) {
    throw new Error(
      'A match needs four unique players.'
    );
  }

  const court =
    Number(
      payload.court
    );

  if (
    !Number.isInteger(court) ||
    court < 1 ||
    court > session.courtCount
  ) {
    throw new Error(
      'Invalid court.'
    );
  }

  const players =
    await getPlayers();

  ids.forEach(
    id => {

      const player =
        players.find(
          item =>
            item.id === id
        );

      if (!player) {
        throw new Error(
          'Player not found.'
        );
      }

      if (
        player.status !==
        'Waiting'
      ) {
        throw new Error(
          `${player.name} is not waiting.`
        );
      }
    }
  );


  /*
   * Make sure court is free.
   */

  const matches =
    await getMatches();

  const occupied =
    matches.some(
      match =>
        match.session_id ===
          session.id &&

        match.status ===
          'Active' &&

        Number(match.court) ===
          court
    );

  if (occupied) {
    throw new Error(
      `Court ${court} is already active.`
    );
  }


  /*
   * Create match.
   */

  const match = {

    id:
      generateId('M'),

    court,

    team1_player1:
      team1[0],

    team1_player2:
      team1[1],

    team2_player1:
      team2[0],

    team2_player2:
      team2[1],

    status:
      'Active',

    score_winner:
      '',

    timestamp:
      new Date().toISOString(),

    session_id:
      session.id
  };

  const {
    error:
      matchError
  } =
    await supabase
      .from('matches')
      .insert(
        match
      );

  if (matchError) {
    throw matchError;
  }


  /*
   * Players become Playing.
   */

  const {
    error:
      playerError
  } =
    await supabase
      .from('players')
      .update({

        status:
          'Playing',

        idle_timestamp:
          null
      })
      .in(
        'id',
        ids
      );

  if (playerError) {
    throw playerError;
  }

  return {

    state:
      await buildState(),

    message:
      `Match started on Court ${court}.`
  };
}


/* =========================================================
   COMPLETE MATCH
   ========================================================= */

async function completeMatch(
  payload
) {

  const matchId =
    String(
      payload.matchId
    );

  const winner =
    String(
      payload.winner
    );

  if (
    winner !== 'Team 1' &&
    winner !== 'Team 2'
  ) {
    throw new Error(
      'Invalid winner.'
    );
  }

  const {
    data: match,
    error:
      matchError
  } =
    await supabase
      .from('matches')
      .select('*')
      .eq(
        'id',
        matchId
      )
      .single();

  if (matchError) {
    throw matchError;
  }

  if (
    match.status !==
    'Active'
  ) {
    throw new Error(
      'That match is already completed.'
    );
  }


  const ids1 = [
    match.team1_player1,
    match.team1_player2
  ];

  const ids2 = [
    match.team2_player1,
    match.team2_player2
  ];


  const players =
    await getPlayers();

  const team1 =
    ids1.map(
      id =>
        players.find(
          player =>
            player.id === id
        )
    );

  const team2 =
    ids2.map(
      id =>
        players.find(
          player =>
            player.id === id
        )
    );


  if (
    team1.some(
      player => !player
    ) ||
    team2.some(
      player => !player
    )
  ) {
    throw new Error(
      'One or more match players no longer exist.'
    );
  }


  /*
   * Elo calculation.
   */

  const elo1 =
    team1.reduce(
      (sum, player) =>
        sum +
        Number(
          player.elo || 800
        ),
      0
    ) / 2;

  const elo2 =
    team2.reduce(
      (sum, player) =>
        sum +
        Number(
          player.elo || 800
        ),
      0
    ) / 2;


  const expected1 =
    1 /
    (
      1 +
      Math.pow(
        10,
        (elo2 - elo1) / 400
      )
    );

  const expected2 =
    1 -
    expected1;


  const actual1 =
    winner === 'Team 1'
      ? 1
      : 0;

  const actual2 =
    winner === 'Team 2'
      ? 1
      : 0;


  const change1 =
    ELO_K *
    (
      actual1 -
      expected1
    );

  const change2 =
    ELO_K *
    (
      actual2 -
      expected2
    );


  /*
   * Update players.
   */

  for (
    const player of team1
  ) {

    const newElo =
      Math.round(
        Number(player.elo || 800) +
        change1
      );

    const newGames =
      Number(
        player.games_played || 0
      ) + 1;

    const newWins =
      Number(
        player.wins || 0
      ) +
      (
        winner === 'Team 1'
          ? 1
          : 0
      );

    const {
      error
    } =
      await supabase
        .from('players')
        .update({

          elo:
            newElo,

          star_tier:
            starsFromElo(
              newElo
            ),

          games_played:
            newGames,

          wins:
            newWins,

          status:
            'Waiting',

          idle_timestamp:
            new Date().toISOString()
        })
        .eq(
          'id',
          player.id
        );

    if (error) {
      throw error;
    }
  }


  for (
    const player of team2
  ) {

    const newElo =
      Math.round(
        Number(player.elo || 800) +
        change2
      );

    const newGames =
      Number(
        player.games_played || 0
      ) + 1;

    const newWins =
      Number(
        player.wins || 0
      ) +
      (
        winner === 'Team 2'
          ? 1
          : 0
      );

    const {
      error
    } =
      await supabase
        .from('players')
        .update({

          elo:
            newElo,

          star_tier:
            starsFromElo(
              newElo
            ),

          games_played:
            newGames,

          wins:
            newWins,

          status:
            'Waiting',

          idle_timestamp:
            new Date().toISOString()
        })
        .eq(
          'id',
          player.id
        );

    if (error) {
      throw error;
    }
  }


  /*
   * Complete match.
   */

  const {
    error:
      updateError
  } =
    await supabase
      .from('matches')
      .update({

        status:
          'Completed',

        score_winner:
          winner
      })
      .eq(
        'id',
        matchId
      );

  if (updateError) {
    throw updateError;
  }

  return {

    state:
      await buildState(),

    message:
      `${winner} wins on Court ${match.court}.`
  };
}


/* =========================================================
   EDIT / CANCEL MATCH
   ========================================================= */

async function editMatch(
  payload
) {

  const matchId =
    String(
      payload.matchId
    );

  if (
    payload.mode !==
    'cancel'
  ) {
    throw new Error(
      'Only match cancellation is available in this version.'
    );
  }

  const {
    data: match,
    error:
      matchError
  } =
    await supabase
      .from('matches')
      .select('*')
      .eq(
        'id',
        matchId
      )
      .single();

  if (matchError) {
    throw matchError;
  }

  if (
    match.status !==
    'Active'
  ) {
    throw new Error(
      'That match is no longer active.'
    );
  }

  const ids = [
    match.team1_player1,
    match.team1_player2,
    match.team2_player1,
    match.team2_player2
  ];

  const {
    error:
      playerError
  } =
    await supabase
      .from('players')
      .update({

        status:
          'Waiting',

        idle_timestamp:
          new Date().toISOString()
      })
      .in(
        'id',
        ids
      );

  if (playerError) {
    throw playerError;
  }

  const {
    error:
      updateError
  } =
    await supabase
      .from('matches')
      .update({

        status:
          'Completed',

        score_winner:
          'CANCELLED'
      })
      .eq(
        'id',
        matchId
      );

  if (updateError) {
    throw updateError;
  }

  return {

    state:
      await buildState(),

    message:
      'Game cancelled.'
  };
}


/* =========================================================
   API ROUTER
   ========================================================= */

export default async function handler(
  req,
  res
) {

  /*
   * GET = health check
   */

  if (
    req.method ===
    'GET'
  ) {

    return send(
      res,
      200,
      {
        success: true,
        message:
          'PHQueue API is running.'
      }
    );
  }


  if (
    req.method !==
    'POST'
  ) {

    return send(
      res,
      405,
      {
        success: false,
        error: {
          code:
            'METHOD_NOT_ALLOWED',

          message:
            'POST required.'
        }
      }
    );
  }


  try {

    const body =
      typeof req.body ===
      'string'

        ? JSON.parse(
            req.body ||
            '{}'
          )

        : (
            req.body ||
            {}
          );


    const action =
      body.action;

    const payload =
      body.payload ||
      {};


    switch(action) {

      case 'getAppState':

        return send(
          res,
          200,
          {
            success: true,

            state:
              await buildState(),

            message: ''
          }
        );


      case 'registerPlayer':

        return send(
          res,
          200,
          {
            success: true,
            ...(await registerPlayer(
              payload
            ))
          }
        );


      case 'checkInPlayer':

        return send(
          res,
          200,
          {
            success: true,
            ...(await checkInPlayer(
              payload
            ))
          }
        );


      case 'checkOutPlayer':

        return send(
          res,
          200,
          {
            success: true,
            ...(await checkOutPlayer(
              payload
            ))
          }
        );


      case 'startSession':

        return send(
          res,
          200,
          {
            success: true,
            ...(await startSession())
          }
        );


      case 'endSession':

        return send(
          res,
          200,
          {
            success: true,
            ...(await endSession())
          }
        );


      case 'setCourtCount':

        return send(
          res,
          200,
          {
            success: true,
            ...(await setCourtCount(
              payload
            ))
          }
        );


      case 'startMatch':

        return send(
          res,
          200,
          {
            success: true,
            ...(await startMatch(
              payload
            ))
          }
        );


      case 'completeMatch':

        return send(
          res,
          200,
          {
            success: true,
            ...(await completeMatch(
              payload
            ))
          }
        );


      case 'editMatch':

        return send(
          res,
          200,
          {
            success: true,
            ...(await editMatch(
              payload
            ))
          }
        );


      default:

        return send(
          res,
          400,
          {
            success: false,

            error: {
              code:
                'UNKNOWN_ACTION',

              message:
                `Unknown action: ${action}`
            }
          }
        );
    }

  } catch(error) {

    console.error(
      'PHQueue API error:',
      error
    );

    return send(
      res,
      500,
      {
        success: false,

        error: {
          code:
            error.code ||
            'SERVER_ERROR',

          message:
            error.message ||
            String(error),

          details:
            error.details ||
            null,

          hint:
            error.hint ||
            null
        }
      }
    );
  }
}
