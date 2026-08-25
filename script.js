/************************************************************
 * PHQueue — PAD HABITS
 * CLEAN / OPTIMISTIC BACKEND
 ************************************************************/

const PHQ = {
  SPREADSHEET_ID:
    '12eBAQszIcaTOgR0ewSyBiv_ndQe3QC_kesicLsrENuk',

  PLAYERS_SHEET: 'Players',
  MATCHES_SHEET: 'Matches',

  MIN_COURTS: 1,
  MAX_COURTS: 6,
  DEFAULT_COURTS: 4,

  ELO_K: 20,

  ADMIN_CODE: 'Jellene',

  STATE_CACHE: 'PHQ_STATE_V3',
  CACHE_SECONDS: 5,

  SESSION_ID: 'PHQ_SESSION_ID',
  SESSION_ACTIVE: 'PHQ_SESSION_ACTIVE',
  COURT_COUNT: 'PHQ_COURT_COUNT',
  REVISION: 'PHQ_REVISION',

  UP_NEXT: 'PHQ_UP_NEXT_V3',

  LOCK_TIMEOUT: 1200,

  MATCH_POOL_SIZE: 12
};


/* =========================================================
   WEB APP
   ========================================================= */

function doGet() {

  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('PHQueue — Pad Habits')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}


/* =========================================================
   API ROUTER
   ========================================================= */

function api(action, payload) {

  payload = payload || {};

  try {

    switch (action) {

      case 'getAppState':
        return success(
          getAppState()
        );

      case 'setupDatabase':
        return setupDatabase();

      case 'registerPlayer':
        return registerPlayer(payload);

      case 'updatePlayer':
        return updatePlayer(payload);

      case 'checkInPlayer':
        return checkInPlayer(payload);

      case 'checkOutPlayer':
        return checkOutPlayer(payload);

      case 'startSession':
        return startSession();

      case 'endSession':
        return endSession();

      case 'setCourtCount':
        return setCourtCount(payload);

      case 'startMatch':
        return startMatch(payload);

      case 'completeMatch':
        return completeMatch(payload);

      case 'editMatch':
        return editMatch(payload);

      case 'toggleUpNextLock':
        return toggleUpNextLock(payload);

      case 'saveUpNextStage':
        return saveUpNextStage(payload);

      case 'recalculateUpNext':
        return recalculateUpNext();

      default:
        throw new Error(
          'Unknown action: ' + action
        );
    }

  } catch (error) {

    return {
      success: false,
      error: {
        code:
          error.code ||
          'SERVER_ERROR',
        message:
          error.message ||
          String(error)
      },
      revision:
        getRevision()
    };
  }
}


/* =========================================================
   RESPONSE
   ========================================================= */

function success(
  state,
  message
) {

  return {
    success: true,
    state: state,
    message: message || ''
  };
}


/* =========================================================
   DATABASE
   ========================================================= */

function getSpreadsheet() {

  return SpreadsheetApp.openById(
    PHQ.SPREADSHEET_ID
  );
}


function setupDatabase() {

  const ss =
    getSpreadsheet();

  ensureSheet(
    ss,
    PHQ.PLAYERS_SHEET,
    [
      'ID',
      'Name',
      'Gender',
      'Star Tier',
      'Elo Rating',
      'Status',
      'Games Played',
      'Wins',
      'Idle Timestamp'
    ]
  );

  ensureSheet(
    ss,
    PHQ.MATCHES_SHEET,
    [
      'Match ID',
      'Court',
      'Team 1 Player 1',
      'Team 1 Player 2',
      'Team 2 Player 1',
      'Team 2 Player 2',
      'Status',
      'Score/Winner',
      'Timestamp',
      'Session ID'
    ]
  );

  const props =
    PropertiesService
      .getScriptProperties();

  props.setProperty(
    'PHQ_ADMIN_CODE',
    PHQ.ADMIN_CODE
  );

  if (
    !props.getProperty(
      PHQ.COURT_COUNT
    )
  ) {

    props.setProperty(
      PHQ.COURT_COUNT,
      String(
        PHQ.DEFAULT_COURTS
      )
    );
  }

  if (
    !props.getProperty(
      PHQ.REVISION
    )
  ) {

    props.setProperty(
      PHQ.REVISION,
      '0'
    );
  }

  if (
    !props.getProperty(
      PHQ.SESSION_ID
    )
  ) {

    props.setProperty(
      PHQ.SESSION_ID,
      generateSessionId()
    );

    props.setProperty(
      PHQ.SESSION_ACTIVE,
      'false'
    );
  }

  repairStarTiers();

  invalidateCache();

  return {
    success: true,
    message:
      'Database initialized. Elo code is Jellene.'
  };
}


function ensureDatabase() {

  const ss =
    getSpreadsheet();

  ensureSheet(
    ss,
    PHQ.PLAYERS_SHEET,
    [
      'ID',
      'Name',
      'Gender',
      'Star Tier',
      'Elo Rating',
      'Status',
      'Games Played',
      'Wins',
      'Idle Timestamp'
    ]
  );

  ensureSheet(
    ss,
    PHQ.MATCHES_SHEET,
    [
      'Match ID',
      'Court',
      'Team 1 Player 1',
      'Team 1 Player 2',
      'Team 2 Player 1',
      'Team 2 Player 2',
      'Status',
      'Score/Winner',
      'Timestamp',
      'Session ID'
    ]
  );
}


function ensureSheet(
  ss,
  name,
  headers
) {

  let sheet =
    ss.getSheetByName(name);

  if (!sheet) {

    sheet =
      ss.insertSheet(name);
  }

  if (
    sheet.getLastRow() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([
        headers
      ]);

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setFontWeight(
        'bold'
      );

    sheet.setFrozenRows(1);
  }

  return sheet;
}


/* =========================================================
   ELO / STARS
   ========================================================= */

function starsFromElo(
  elo
) {

  const value =
    Number(elo);

  if (
    !Number.isFinite(value)
  ) {
    return 1;
  }

  if (value < 1000) return 1;
  if (value < 1200) return 2;
  if (value < 1400) return 3;
  if (value < 1600) return 4;
  if (value < 1800) return 5;

  return 6;
}


function eloFromStars(
  stars
) {

  return ({
    1: 800,
    2: 1000,
    3: 1200,
    4: 1400,
    5: 1600,
    6: 1800
  })[
    Number(stars)
  ] || 800;
}


function repairStarTiers() {

  const sheet =
    getSpreadsheet()
      .getSheetByName(
        PHQ.PLAYERS_SHEET
      );

  if (!sheet) return;

  const rows =
    sheet.getLastRow();

  if (rows <= 1) return;

  const data =
    sheet
      .getRange(
        2,
        1,
        rows - 1,
        9
      )
      .getValues();

  const output =
    data.map(
      function(row) {

        return [
          starsFromElo(
            Number(row[4])
          )
        ];
      }
    );

  sheet
    .getRange(
      2,
      4,
      output.length,
      1
    )
    .setValues(
      output
    );
}


/* =========================================================
   SESSION
   ========================================================= */

function getSessionInfo() {

  const props =
    PropertiesService
      .getScriptProperties();

  return {

    id:
      props.getProperty(
        PHQ.SESSION_ID
      ),

    active:
      props.getProperty(
        PHQ.SESSION_ACTIVE
      ) === 'true',

    courtCount:
      clamp(
        Number(
          props.getProperty(
            PHQ.COURT_COUNT
          ) ||
          PHQ.DEFAULT_COURTS
        ),
        PHQ.MIN_COURTS,
        PHQ.MAX_COURTS
      ),

    revision:
      getRevision()
  };
}


function startSession() {

  return withLock(
    function() {

      const props =
        PropertiesService
          .getScriptProperties();

      const current =
        getSessionInfo();

      if (
        current.active
      ) {

        return success(
          getAppState(),
          'Session is already active.'
        );
      }

      props.setProperty(
        PHQ.SESSION_ID,
        generateSessionId()
      );

      props.setProperty(
        PHQ.SESSION_ACTIVE,
        'true'
      );

      /*
       * Do NOT recalculate Up Next here.
       * Players may already have checked in before
       * the session starts.
       */

      bumpRevision();

      /*
       * We intentionally avoid another expensive
       * sheet read here.
       */
      const state =
        getAppState();

      return success(
        state,
        'Session started.'
      );
    }
  );
}


/*
 * END SESSION:
 *
 * EVERY PLAYER is checked out.
 */
function endSession() {

  return withLock(
    function() {

      const session =
        getSessionInfo();

      const players =
        readPlayers();

      const matches =
        readMatches();

      /*
       * Cancel all active games.
       */
      matches.forEach(
        function(match) {

          if (
            match.sessionId ===
              session.id &&
            match.status ===
              'Active'
          ) {

            match.status =
              'Completed';

            match.scoreWinner =
              'CANCELLED';

            updateMatchRow(
              match
            );
          }
        }
      );

      /*
       * CHECK OUT EVERYONE.
       */
      players.forEach(
        function(player) {

          player.status =
            'Checked Out';

          player.idleTimestamp =
            null;
        }
      );

      savePlayers(
        players
      );

      PropertiesService
        .getScriptProperties()
        .setProperty(
          PHQ.SESSION_ACTIVE,
          'false'
        );

      clearUpNext();

      bumpRevision();

      invalidateCache();

      return success(
        buildAppState(
          players,
          matches,
          getSessionInfo()
        ),
        'Session ended. All players were checked out.'
      );
    }
  );
}


/* =========================================================
   COURTS
   ========================================================= */

function setCourtCount(
  payload
) {

  return withLock(
    function() {

      const count =
        Number(
          payload.courtCount
        );

      if (
        !Number.isInteger(count) ||
        count < PHQ.MIN_COURTS ||
        count > PHQ.MAX_COURTS
      ) {

        throw new Error(
          'Court count must be between 1 and 6.'
        );
      }

      const session =
        getSessionInfo();

      const matches =
        readMatches();

      const conflict =
        matches.some(
          function(match) {

            return (
              match.sessionId ===
                session.id &&
              match.status ===
                'Active' &&
              Number(match.court) >
                count
            );
          }
        );

      if (conflict) {

        throw new Error(
          'Finish or cancel the higher-numbered active court first.'
        );
      }

      PropertiesService
        .getScriptProperties()
        .setProperty(
          PHQ.COURT_COUNT,
          String(count)
        );

      bumpRevision();

      invalidateCache();

      return success(
        buildAppState(
          readPlayers(),
          matches,
          getSessionInfo()
        ),
        'Court count updated.'
      );
    }
  );
}


/* =========================================================
   REGISTRATION
   ========================================================= */

function registerPlayer(
  payload
) {

  return withLock(
    function() {

      const name =
        normalizeDisplayName(
          payload.name
        );

      const stars =
        Number(
          payload.starTier
        );

      const gender =
        String(
          payload.gender || ''
        ).trim();

      const duplicateMode =
        String(
          payload.duplicateMode || ''
        );

      if (!name) {
        throw new Error(
          'Player name is required.'
        );
      }

      const players =
        readPlayers();

      const existing =
        players.find(
          function(player) {

            return (
              normalizeName(
                player.name
              ) ===
              normalizeName(
                name
              )
            );
          }
        );

      if (
        existing &&
        !duplicateMode
      ) {

        return {

          success: true,

          duplicate: true,

          existing:
            serializePlayer(
              existing
            )
        };
      }

      if (
        existing &&
        duplicateMode ===
          'update'
      ) {

        existing.gender =
          gender;

        if (
          existing.gamesPlayed ===
          0
        ) {

          existing.elo =
            eloFromStars(
              stars
            );
        }

        existing.starTier =
          starsFromElo(
            existing.elo
          );

        savePlayers(
          players
        );

        bumpRevision();
        invalidateCache();

        return success(
          buildAppState(
            players,
            readMatches(),
            getSessionInfo()
          ),
          existing.name +
            ' updated.'
        );
      }

      let finalName =
        name;

      if (
        existing &&
        duplicateMode ===
          'suffix'
      ) {

        finalName =
          uniqueName(
            name,
            players
          );
      }

      const elo =
        eloFromStars(
          stars
        );

      const player = {

        id:
          generatePlayerId(),

        name:
          finalName,

        gender:
          gender,

        starTier:
          starsFromElo(
            elo
          ),

        elo:
          elo,

        status:
          'Checked Out',

        gamesPlayed:
          0,

        wins:
          0,

        idleTimestamp:
          null
      };

      const sheet =
        getSpreadsheet()
          .getSheetByName(
            PHQ.PLAYERS_SHEET
          );

      sheet.appendRow([
        player.id,
        player.name,
        player.gender,
        player.starTier,
        player.elo,
        player.status,
        player.gamesPlayed,
        player.wins,
        ''
      ]);

      players.push(
        player
      );

      bumpRevision();
      invalidateCache();

      return success(
        buildAppState(
          players,
          readMatches(),
          getSessionInfo()
        ),
        finalName +
          ' registered.'
      );
    }
  );
}


/* =========================================================
   EDIT PLAYER
   ========================================================= */

function updatePlayer(
  payload
) {

  return withLock(
    function() {

      const players =
        readPlayers();

      const player =
        findPlayer(
          players,
          payload.playerId
        );

      if (!player) {

        throw new Error(
          'Player not found.'
        );
      }

      const newName =
        normalizeDisplayName(
          payload.name
        );

      const newGender =
        String(
          payload.gender || ''
        ).trim();

      const newStars =
        Number(
          payload.starTier
        );

      const newElo =
        Number(
          payload.elo
        );

      const accessCode =
        String(
          payload.accessCode || ''
        );

      if (!newName) {

        throw new Error(
          'Player name cannot be empty.'
        );
      }

      if (
        !Number.isInteger(newStars) ||
        newStars < 1 ||
        newStars > 6
      ) {

        throw new Error(
          'Star level must be between 1 and 6.'
        );
      }

      if (
        !Number.isFinite(newElo) ||
        newElo < 0 ||
        newElo > 4000
      ) {

        throw new Error(
          'Elo must be between 0 and 4000.'
        );
      }

      /*
       * Duplicate names are blocked.
       */
      const duplicate =
        players.find(
          function(other) {

            return (
              other.id !== player.id &&
              normalizeName(
                other.name
              ) ===
              normalizeName(
                newName
              )
            );
          }
        );

      if (duplicate) {

        throw new Error(
          'Another player already has that name.'
        );
      }

      const eloChanged =
        Math.round(newElo) !==
        Math.round(player.elo);

      /*
       * Elo changes require Jellene.
       */
      if (
        eloChanged &&
        accessCode !==
          PHQ.ADMIN_CODE
      ) {

        throw new Error(
          'Elo changes require the admin code.'
        );
      }

      player.name =
        newName;

      player.gender =
        newGender;

      player.elo =
        Math.round(
          newElo
        );

      player.starTier =
        starsFromElo(
          player.elo
        );

      savePlayers(
        players
      );

      bumpRevision();

      invalidateCache();

      return success(
        buildAppState(
          players,
          readMatches(),
          getSessionInfo()
        ),
        player.name +
          ' updated.'
      );
    }
  );
}


/* =========================================================
   CHECK IN
   ========================================================= */

function checkInPlayer(
  payload
) {

  return withLock(
    function() {

      const players =
        readPlayers();

      const player =
        findPlayer(
          players,
          payload.playerId
        );

      if (!player) {

        throw new Error(
          'Player not found.'
        );
      }

      if (
        player.status ===
        'Playing'
      ) {

        throw new Error(
          player.name +
            ' is already playing.'
        );
      }

      if (
        player.status ===
        'Waiting'
      ) {

        return success(
          getAppState(),
          player.name +
            ' is already checked in.'
        );
      }

      player.status =
        'Waiting';

      player.idleTimestamp =
        new Date();

      savePlayers(
        players
      );

      /*
       * ONLY CHECK-IN / GAME FINISH / MANUAL
       * RECALCULATE.
       */
      rebuildUpNext();

      bumpRevision();

      invalidateCache();

      return success(
        buildAppState(
          players,
          readMatches(),
          getSessionInfo()
        ),
        player.name +
          ' checked in.'
      );
    }
  );
}


/* =========================================================
   CHECK OUT
   ========================================================= */

function checkOutPlayer(
  payload
) {

  return withLock(
    function() {

      const players =
        readPlayers();

      const player =
        findPlayer(
          players,
          payload.playerId
        );

      if (!player) {

        throw new Error(
          'Player not found.'
        );
      }

      if (
        player.status ===
        'Playing'
      ) {

        throw new Error(
          'Use Edit Game to remove a player from a live match.'
        );
      }

      player.status =
        'Checked Out';

      player.idleTimestamp =
        null;

      removePlayerFromUpNext(
        player.id
      );

      savePlayers(
        players
      );

      bumpRevision();

      invalidateCache();

      return success(
        buildAppState(
          players,
          readMatches(),
          getSessionInfo()
        ),
        player.name +
          ' checked out.'
      );
    }
  );
}


/* =========================================================
   UP NEXT
   ========================================================= */

function getUpNextPlan() {

  const raw =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PHQ.UP_NEXT
      );

  if (!raw) {
    return null;
  }

  try {

    return JSON.parse(
      raw
    );

  } catch (error) {

    return null;
  }
}


function saveUpNextPlan(
  plan
) {

  PropertiesService
    .getScriptProperties()
    .setProperty(
      PHQ.UP_NEXT,
      JSON.stringify(
        plan
      )
    );
}


function clearUpNext() {

  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      PHQ.UP_NEXT
    );
}


function removePlayerFromUpNext(
  playerId
) {

  const plan =
    getUpNextPlan();

  if (!plan) {
    return;
  }

  plan.stages =
    plan.stages.filter(
      function(stage) {

        const ids =
          stage.team1.concat(
            stage.team2
          );

        return (
          ids.indexOf(
            playerId
          ) === -1
        );
      }
    );

  saveUpNextPlan(
    plan
  );
}


/* =========================================================
   MATCHMAKING
   =========================================================

   RULES:

   Normal:
   1. Balance teams
   2. Avoid repeat partners
   3. Respect waiting time
   4. Avoid repeat opponents
   5. Avoid teammate Elo >400
   6. Minimize teammate Elo gap

   Waiting adjustment:
   < 6 min:
     Waiting time ignored.

   > 6 min:
     Waiting time moves to priority 4.

   > 10 min:
     Waiting time moves to priority 3.

   > 12 min:
     Waiting time moves to priority 2.
   ========================================================= */

function rebuildUpNext() {

  const session =
    getSessionInfo();

  const players =
    readPlayers();

  const matches =
    readMatches();

  const waiting =
    players
      .filter(
        function(player) {

          return (
            player.status ===
            'Waiting'
          );
        }
      )
      .sort(
        compareWait
      );

  const history =
    getSessionHistory(
      matches,
      session.id
    );

  let plan =
    getUpNextPlan();

  /*
   * First plan.
   */
  if (
    !plan ||
    plan.sessionId !==
      session.id
  ) {

    const stages =
      generateStages(
        waiting,
        history
      );

    plan = {

      sessionId:
        session.id,

      stages:
        stages
    };

    saveUpNextPlan(
      plan
    );

    return plan;
  }


  /*
   * Preserve #1 only if it is locked.
   *
   * This means #1 CAN now be unlocked.
   */
  const preserved =
    [];

  const reserved =
    new Set();

  plan.stages.forEach(
    function(stage) {

      const ids =
        stage.team1.concat(
          stage.team2
        );

      const valid =
        ids.length === 4 &&
        new Set(ids).size === 4 &&
        ids.every(
          function(id) {

            return waiting.some(
              function(player) {

                return (
                  player.id === id
                );
              }
            );
          }
        );

      if (!valid) {
        return;
      }

      if (
        !stage.locked
      ) {

        return;
      }

      const overlap =
        ids.some(
          function(id) {

            return reserved.has(
              id
            );
          }
        );

      if (overlap) {
        return;
      }

      preserved.push({

        stageId:
          stage.stageId,

        team1:
          stage.team1.slice(),

        team2:
          stage.team2.slice(),

        locked:
          true,

        custom:
          stage.custom === true
      });

      ids.forEach(
        function(id) {

          reserved.add(
            id
          );
        }
      );
    }
  );


  const remaining =
    waiting.filter(
      function(player) {

        return !reserved.has(
          player.id
        );
      }
    );


  const generated =
    generateStages(
      remaining,
      history
    );


  plan.stages =
    preserved.concat(
      generated
    );

  saveUpNextPlan(
    plan
  );

  return plan;
}


function generateStages(
  players,
  history
) {

  const stages =
    [];

  let remaining =
    players
      .slice()
      .sort(
        compareWait
      );

  while (
    remaining.length >= 4
  ) {

    const candidate =
      findBestMatch(
        remaining,
        history
      );

    if (!candidate) {
      break;
    }

    const ids =
      candidate.team1
        .concat(
          candidate.team2
        )
        .map(
          function(player) {

            return player.id;
          }
        );

    stages.push({

      stageId:
        makeStageId(
          ids
        ),

      team1:
        candidate.team1.map(
          function(player) {

            return player.id;
          }
        ),

      team2:
        candidate.team2.map(
          function(player) {

            return player.id;
          }
        ),

      locked:
        false,

      custom:
        false
    });

    const used =
      new Set(ids);

    remaining =
      remaining.filter(
        function(player) {

          return !used.has(
            player.id
          );
        }
      );
  }

  return stages;
}


/*
 * IMPORTANT:
 *
 * Waiting priority is determined from the
 * longest waiting player still in the matchmaking
 * pool.
 */
function getWaitingPriority(
  players
) {

  if (!players.length) {
    return null;
  }

  const longest =
    players
      .slice()
      .sort(
        compareWait
      )[0];

  const minutes =
    waitMinutes(
      longest
    );

  if (
    minutes > 12
  ) {

    return 2;
  }

  if (
    minutes > 10
  ) {

    return 3;
  }

  if (
    minutes > 6
  ) {

    return 4;
  }

  /*
   * Ignore waiting time.
   */
  return null;
}


function findBestMatch(
  players,
  history
) {

  if (
    players.length < 4
  ) {
    return null;
  }

  const pool =
    players
      .slice()
      .sort(
        compareWait
      )
      .slice(
        0,
        PHQ.MATCH_POOL_SIZE
      );

  const waitPriority =
    getWaitingPriority(
      pool
    );

  const groups =
    combinations4(
      pool
    );

  const candidates =
    [];

  groups.forEach(
    function(group) {

      partitions4(
        group
      ).forEach(
        function(partition) {

          candidates.push(
            evaluateCandidate(
              partition.team1,
              partition.team2,
              history
            )
          );
        }
      );
    }
  );

  if (!candidates.length) {
    return null;
  }

  candidates.sort(
    function(a, b) {

      return compareCandidates(
        a,
        b,
        waitPriority
      );
    }
  );

  return candidates[0];
}


function partitions4(
  players
) {

  const a = players[0];
  const b = players[1];
  const c = players[2];
  const d = players[3];

  return [

    {
      team1: [a, b],
      team2: [c, d]
    },

    {
      team1: [a, c],
      team2: [b, d]
    },

    {
      team1: [a, d],
      team2: [b, c]
    }

  ];
}


function evaluateCandidate(
  team1,
  team2,
  history
) {

  return {

    team1:
      team1,

    team2:
      team2,

    warnings:
      getWarnings(
        team1,
        team2,
        history
      ),

    metrics: {

      balance:
        Math.round(
          Math.abs(
            averageElo(
              team1
            ) -
            averageElo(
              team2
            )
          )
        ),

      repeatPartners:
        repeatPartnerCount(
          team1,
          team2,
          history
        ),

      oldestWait:
        waitStats(
          team1.concat(
            team2
          )
        ).oldest,

      totalWait:
        waitStats(
          team1.concat(
            team2
          )
        ).total,

      repeatOpponents:
        repeatOpponentCount(
          team1,
          team2,
          history
        ),

      over400:
        teammateOver400(
          team1,
          team2
        ),

      teammateGap:
        teammateGapTotal(
          team1,
          team2
        )
    }
  };
}


function compareCandidates(
  a,
  b,
  waitPriority
) {

  /*
   * 1. Balance
   */
  if (
    a.metrics.balance !==
    b.metrics.balance
  ) {

    return (
      a.metrics.balance -
      b.metrics.balance
    );
  }


  /*
   * If waiting time is active,
   * place it at the requested priority.
   */
  const rules = [

    'repeatPartners',
    'repeatOpponents',
    'over400',
    'teammateGap'
  ];


  if (
    waitPriority === 2
  ) {

    rules.splice(
      0,
      0,
      'wait'
    );

  } else if (
    waitPriority === 3
  ) {

    rules.splice(
      1,
      0,
      'wait'
    );

  } else if (
    waitPriority === 4
  ) {

    rules.splice(
      2,
      0,
      'wait'
    );
  }


  for (
    let i = 0;
    i < rules.length;
    i++
  ) {

    const key =
      rules[i];

    let av;
    let bv;

    if (
      key ===
      'wait'
    ) {

      /*
       * Longer wait is better.
       */
      av =
        -a.metrics.oldestWait;

      bv =
        -b.metrics.oldestWait;

    } else {

      av =
        a.metrics[key];

      bv =
        b.metrics[key];
    }

    if (
      av !== bv
    ) {

      return av - bv;
    }
  }

  return 0;
}


/* =========================================================
   MATCHMAKING HELPERS
   ========================================================= */

function waitMinutes(
  player
) {

  if (
    !player.idleTimestamp
  ) {
    return 0;
  }

  const timestamp =
    new Date(
      player.idleTimestamp
    ).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return 0;
  }

  return (
    Date.now() -
    timestamp
  ) /
  60000;
}


function waitStats(
  players
) {

  const values =
    players.map(
      function(player) {

        return Math.max(
          0,
          (
            Date.now() -
            (
              player.idleTimestamp
                ? new Date(
                    player.idleTimestamp
                  ).getTime()
                : Date.now()
            )
          )
        );
      }
    );

  return {

    oldest:
      Math.max.apply(
        null,
        values.length
          ? values
          : [0]
      ),

    total:
      values.reduce(
        function(sum, value) {
          return sum + value;
        },
        0
      ),

    average:
      values.length
        ? values.reduce(
            function(sum, value) {
              return sum + value;
            },
            0
          ) / values.length
        : 0
  };
}


function teammateOver400(
  team1,
  team2
) {

  let count = 0;

  if (
    Math.abs(
      team1[0].elo -
      team1[1].elo
    ) > 400
  ) {
    count++;
  }

  if (
    Math.abs(
      team2[0].elo -
      team2[1].elo
    ) > 400
  ) {
    count++;
  }

  return count;
}


function teammateGapTotal(
  team1,
  team2
) {

  return (
    Math.abs(
      team1[0].elo -
      team1[1].elo
    ) +
    Math.abs(
      team2[0].elo -
      team2[1].elo
    )
  );
}


/* =========================================================
   WARNINGS
   ========================================================= */

function getWarnings(
  team1,
  team2,
  history
) {

  const details = [];

  if (
    werePartnersBefore(
      team1[0].id,
      team1[1].id,
      history
    )
  ) {

    details.push({

      type:
        'partner',

      title:
        'Repeat Partner',

      text:
        team1[0].name +
        ' and ' +
        team1[1].name +
        ' have already been partners this session.'
    });
  }


  if (
    werePartnersBefore(
      team2[0].id,
      team2[1].id,
      history
    )
  ) {

    details.push({

      type:
        'partner',

      title:
        'Repeat Partner',

      text:
        team2[0].name +
        ' and ' +
        team2[1].name +
        ' have already been partners this session.'
    });
  }


  team1.forEach(
    function(a) {

      team2.forEach(
        function(b) {

          if (
            wereOpponentsBefore(
              a.id,
              b.id,
              history
            )
          ) {

            details.push({

              type:
                'opponent',

              title:
                'Repeat Opponent',

              text:
                a.name +
                ' and ' +
                b.name +
                ' have already played against each other this session.'
            });
          }
        }
      );
    }
  );


  [
    [
      team1[0],
      team1[1]
    ],
    [
      team2[0],
      team2[1]
    ]
  ].forEach(
    function(pair) {

      const gap =
        Math.abs(
          pair[0].elo -
          pair[1].elo
        );

      if (
        gap > 400
      ) {

        details.push({

          type:
            'elo',

          title:
            'Wide Teammate Elo Gap',

          text:
            pair[0].name +
            ' and ' +
            pair[1].name +
            ' are more than 400 Elo apart.'
        });
      }
    }
  );


  return {

    labels:
      details.map(
        function(item) {
          return item.title;
        }
      ),

    details:
      details
  };
}


/* =========================================================
   UP NEXT ACTIONS
   ========================================================= */

function toggleUpNextLock(
  payload
) {

  return withLock(
    function() {

      const plan =
        getUpNextPlan();

      if (!plan) {
        throw new Error(
          'No Up Next plan exists.'
        );
      }

      const stage =
        plan.stages.find(
          function(item) {

            return (
              item.stageId ===
              payload.stageId
            );
          }
        );

      if (!stage) {

        throw new Error(
          'Up Next matchup not found.'
        );
      }

      stage.locked =
        !stage.locked;

      saveUpNextPlan(
        plan
      );

      bumpRevision();
      invalidateCache();

      return success(
        getAppState(),
        stage.locked
          ? 'Match locked.'
          : 'Match unlocked.'
      );
    }
  );
}


function saveUpNextStage(
  payload
) {

  return withLock(
    function() {

      const plan =
        getUpNextPlan();

      if (!plan) {
        throw new Error(
          'No Up Next plan exists.'
        );
      }

      const stage =
        plan.stages.find(
          function(item) {

            return (
              item.stageId ===
              payload.stageId
            );
          }
        );

      if (!stage) {

        throw new Error(
          'Up Next matchup not found.'
        );
      }

      const team1 =
        (
          payload.team1 ||
          []
        ).map(String);

      const team2 =
        (
          payload.team2 ||
          []
        ).map(String);

      const ids =
        team1.concat(team2);

      if (
        team1.length !== 2 ||
        team2.length !== 2 ||
        new Set(ids).size !== 4
      ) {

        throw new Error(
          'A doubles matchup needs four unique players.'
        );
      }

      const players =
        readPlayers();

      ids.forEach(
        function(id) {

          const player =
            findPlayer(
              players,
              id
            );

          if (
            !player ||
            player.status !==
              'Waiting'
          ) {

            throw new Error(
              'Every selected player must currently be waiting.'
            );
          }
        }
      );

      plan.stages.forEach(
        function(other) {

          if (
            other.stageId ===
            stage.stageId
          ) {
            return;
          }

          const otherIds =
            other.team1.concat(
              other.team2
            );

          if (
            ids.some(
              function(id) {

                return (
                  otherIds.indexOf(
                    id
                  ) >= 0
                );
              }
            )
          ) {

            throw new Error(
              'A player is already reserved in another Up Next matchup.'
            );
          }
        }
      );

      stage.team1 =
        team1;

      stage.team2 =
        team2;

      /*
       * Custom matchup automatically locks.
       */
      stage.locked =
        true;

      stage.custom =
        true;

      saveUpNextPlan(
        plan
      );

      bumpRevision();
      invalidateCache();

      return success(
        getAppState(),
        'Custom matchup saved and locked.'
      );
    }
  );
}


function recalculateUpNext() {

  return withLock(
    function() {

      rebuildUpNext();

      bumpRevision();
      invalidateCache();

      return success(
        getAppState(),
        'Up Next recalculated.'
      );
    }
  );
}


/* =========================================================
   START MATCH
   ========================================================= */

function startMatch(
  payload
) {

  return withLock(
    function() {

      const session =
        getSessionInfo();

      if (
        !session.active
      ) {

        throw new Error(
          'Start the session first.'
        );
      }

      const court =
        Number(
          payload.court
        );

      const players =
        readPlayers();

      const matches =
        readMatches();

      const occupied =
        matches.some(
          function(match) {

            return (
              match.sessionId ===
                session.id &&
              match.status ===
                'Active' &&
              Number(match.court) ===
                court
            );
          }
        );

      if (occupied) {

        throw new Error(
          'That court already has a live game.'
        );
      }

      const team1 =
        (
          payload.team1 ||
          []
        ).map(String);

      const team2 =
        (
          payload.team2 ||
          []
        ).map(String);

      const ids =
        team1.concat(team2);

      if (
        team1.length !== 2 ||
        team2.length !== 2 ||
        new Set(ids).size !== 4
      ) {

        throw new Error(
          'Four unique players are required.'
        );
      }

      const selected =
        ids.map(
          function(id) {

            return findPlayer(
              players,
              id
            );
          }
        );

      if (
        selected.some(
          function(player) {

            return (
              !player ||
              player.status !==
                'Waiting'
            );
          }
        )
      ) {

        throw new Error(
          'One or more players are no longer waiting.'
        );
      }

      selected.forEach(
        function(player) {

          player.status =
            'Playing';

          player.idleTimestamp =
            null;
        }
      );

      savePlayers(
        players
      );

      const match = {

        id:
          generateMatchId(),

        court:
          court,

        team1Player1:
          team1[0],

        team1Player2:
          team1[1],

        team2Player1:
          team2[0],

        team2Player2:
          team2[1],

        status:
          'Active',

        scoreWinner:
          '',

        timestamp:
          new Date(),

        sessionId:
          session.id
      };

      const sheet =
        getSpreadsheet()
          .getSheetByName(
            PHQ.MATCHES_SHEET
          );

      sheet.appendRow([
        match.id,
        match.court,
        match.team1Player1,
        match.team1Player2,
        match.team2Player1,
        match.team2Player2,
        match.status,
        '',
        match.timestamp,
        match.sessionId
      ]);

      match._row =
        sheet.getLastRow();

      /*
       * Remove staged matchup.
       */
      const plan =
        getUpNextPlan();

      if (plan) {

        plan.stages =
          plan.stages.filter(
            function(stage) {

              return (
                stage.stageId !==
                payload.stageId
              );
            }
          );

        saveUpNextPlan(
          plan
        );
      }

      bumpRevision();
      invalidateCache();

      return success(
        buildAppState(
          players,
          matches.concat([
            match
          ]),
          getSessionInfo()
        ),
        'Match started on Court ' +
          court +
          '.'
      );
    }
  );
}


/* =========================================================
   COMPLETE MATCH
   ========================================================= */

function completeMatch(
  payload
) {

  return withLock(
    function() {

      const players =
        readPlayers();

      const matches =
        readMatches();

      const match =
        matches.find(
          function(item) {

            return (
              item.id ===
              payload.matchId
            );
          }
        );

      if (!match) {

        throw new Error(
          'Match not found.'
        );
      }

      if (
        match.status !==
          'Active'
      ) {

        throw new Error(
          'That match is already completed.'
        );
      }

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

      const team1 = [

        findPlayer(
          players,
          match.team1Player1
        ),

        findPlayer(
          players,
          match.team1Player2
        )

      ];

      const team2 = [

        findPlayer(
          players,
          match.team2Player1
        ),

        findPlayer(
          players,
          match.team2Player2
        )

      ];

      const elo1 =
        averageElo(team1);

      const elo2 =
        averageElo(team2);

      const expected1 =
        expectedScore(
          elo1,
          elo2
        );

      const expected2 =
        expectedScore(
          elo2,
          elo1
        );

      const actual1 =
        winner === 'Team 1'
          ? 1
          : 0;

      const actual2 =
        winner === 'Team 2'
          ? 1
          : 0;

      const change1 =
        PHQ.ELO_K *
        (
          actual1 -
          expected1
        );

      const change2 =
        PHQ.ELO_K *
        (
          actual2 -
          expected2
        );

      team1.forEach(
        function(player) {

          player.elo =
            Math.round(
              player.elo +
              change1
            );

          player.starTier =
            starsFromElo(
              player.elo
            );

          player.gamesPlayed++;

          if (
            winner === 'Team 1'
          ) {

            player.wins++;
          }

          player.status =
            'Waiting';

          player.idleTimestamp =
            new Date();
        }
      );

      team2.forEach(
        function(player) {

          player.elo =
            Math.round(
              player.elo +
              change2
            );

          player.starTier =
            starsFromElo(
              player.elo
            );

          player.gamesPlayed++;

          if (
            winner === 'Team 2'
          ) {

            player.wins++;
          }

          player.status =
            'Waiting';

          player.idleTimestamp =
            new Date();
        }
      );

      savePlayers(
        players
      );

      match.status =
        'Completed';

      match.scoreWinner =
        winner;

      updateMatchRow(
        match
      );

      /*
       * GAME FINISHED:
       *
       * Recalculate.
       * Current #2 becomes #1.
       */
      rebuildUpNext();

      bumpRevision();
      invalidateCache();

      return success(
        buildAppState(
          players,
          matches,
          getSessionInfo()
        ),
        winner +
          ' wins on Court ' +
          match.court +
          '.'
      );
    }
  );
}


/* =========================================================
   EDIT / CANCEL LIVE MATCH
   ========================================================= */

function editMatch(
  payload
) {

  return withLock(
    function() {

      const players =
        readPlayers();

      const matches =
        readMatches();

      const match =
        matches.find(
          function(item) {

            return (
              item.id ===
              payload.matchId
            );
          }
        );

      if (!match) {

        throw new Error(
          'Live game not found.'
        );
      }

      if (
        match.status !==
          'Active'
      ) {

        throw new Error(
          'That game is no longer active.'
        );
      }

      /*
       * CANCEL
       */
      if (
        payload.mode ===
        'cancel'
      ) {

        const currentIds = [

          match.team1Player1,
          match.team1Player2,
          match.team2Player1,
          match.team2Player2

        ];

        players.forEach(
          function(player) {

            if (
              currentIds.indexOf(
                player.id
              ) >= 0
            ) {

              player.status =
                'Waiting';

              player.idleTimestamp =
                new Date();
            }
          }
        );

        savePlayers(
          players
        );

        match.status =
          'Completed';

        match.scoreWinner =
          'CANCELLED';

        updateMatchRow(
          match
        );

        rebuildUpNext();

        bumpRevision();
        invalidateCache();

        return success(
          buildAppState(
            players,
            matches,
            getSessionInfo()
          ),
          'Game cancelled.'
        );
      }


      /*
       * REPLACE PLAYERS
       */
      const team1 =
        (
          payload.team1 ||
          []
        ).map(String);

      const team2 =
        (
          payload.team2 ||
          []
        ).map(String);

      const newIds =
        team1.concat(team2);

      if (
        team1.length !== 2 ||
        team2.length !== 2 ||
        new Set(newIds).size !== 4
      ) {

        throw new Error(
          'A live game needs four unique players.'
        );
      }

      const oldIds = [

        match.team1Player1,
        match.team1Player2,
        match.team2Player1,
        match.team2Player2

      ];

      newIds.forEach(
        function(id) {

          const player =
            findPlayer(
              players,
              id
            );

          if (!player) {

            throw new Error(
              'Player not found.'
            );
          }

          const alreadyInMatch =
            oldIds.indexOf(id) >= 0;

          /*
           * New players must be waiting.
           */
          if (
            !alreadyInMatch &&
            player.status !== 'Waiting'
          ) {

            throw new Error(
              player.name +
                ' is not waiting.'
            );
          }
        }
      );

      /*
       * Players removed via X become Waiting.
       */
      oldIds.forEach(
        function(id) {

          if (
            newIds.indexOf(id) === -1
          ) {

            const player =
              findPlayer(
                players,
                id
              );

            if (player) {

              player.status =
                'Waiting';

              player.idleTimestamp =
                new Date();
            }
          }
        }
      );

      /*
       * New players become Playing.
       */
      newIds.forEach(
        function(id) {

          const player =
            findPlayer(
              players,
              id
            );

          player.status =
            'Playing';

          player.idleTimestamp =
            null;
        }
      );

      match.team1Player1 =
        team1[0];

      match.team1Player2 =
        team1[1];

      match.team2Player1 =
        team2[0];

      match.team2Player2 =
        team2[1];

      updateMatchRow(
        match
      );

      savePlayers(
        players
      );

      bumpRevision();
      invalidateCache();

      return success(
        buildAppState(
          players,
          matches,
          getSessionInfo()
        ),
        'Live game updated.'
      );
    }
  );
}


/* =========================================================
   STATE
   ========================================================= */

function getAppState() {

  ensureDatabase();

  const cache =
    CacheService
      .getScriptCache();

  try {

    const cached =
      cache.get(
        PHQ.STATE_CACHE
      );

    if (cached) {

      return JSON.parse(
        cached
      );
    }

  } catch (error) {

    cache.remove(
      PHQ.STATE_CACHE
    );
  }

  const state =
    buildAppState(
      readPlayers(),
      readMatches(),
      getSessionInfo()
    );

  try {

    cache.put(
      PHQ.STATE_CACHE,
      JSON.stringify(
        state
      ),
      PHQ.CACHE_SECONDS
    );

  } catch (error) {}

  return state;
}


/*
 * IMPORTANT:
 *
 * This function only READS the stored Up Next.
 * It never recalculates.
 */
function buildAppState(
  players,
  matches,
  session
) {

  const sessionMatches =
    matches.filter(
      function(match) {

        return (
          match.sessionId ===
          session.id
        );
      }
    );

  const activeMatches =
    sessionMatches.filter(
      function(match) {

        return (
          match.status ===
          'Active'
        );
      }
    );

  const playerMap = {};

  players.forEach(
    function(player) {

      playerMap[player.id] =
        player;
    }
  );

  const queue =
    players
      .filter(
        function(player) {

          return (
            player.status ===
            'Waiting'
          );
        }
      )
      .sort(
        compareWait
      );

  const queueWaits =
    waitStats(queue);

  const courts = [];

  for (
    let i = 1;
    i <= session.courtCount;
    i++
  ) {

    const match =
      activeMatches.find(
        function(item) {

          return (
            Number(
              item.court
            ) === i
          );
        }
      );

    courts.push({

      number:
        i,

      status:
        match
          ? 'ACTIVE'
          : session.active
            ? 'READY'
            : 'OFFLINE',

      match:
        match
          ? serializeMatch(
              match,
              playerMap
            )
          : null
    });
  }

  const upNext =
    buildUpNextView(
      getUpNextPlan(),
      players,
      matches,
      session.id
    );

  return {

    revision:
      session.revision,

    session: {

      id:
        session.id,

      active:
        session.active,

      courtCount:
        session.courtCount
    },

    stats: {

      activeCourts:
        activeMatches.length,

      checkedInPlayers:
        players.filter(
          function(player) {

            return (
              player.status === 'Waiting' ||
              player.status === 'Playing'
            );
          }
        ).length,

      queueCount:
        queue.length,

      averageWaitMs:
        queueWaits.average
    },

    players:
      players.map(
        serializePlayer
      ),

    queue:
      queue.map(
        function(player, index) {

          const value =
            serializePlayer(
              player
            );

          value.queuePosition =
            index + 1;

          return value;
        }
      ),

    courts:
      courts,

    upNext:
      upNext,

    leaderboards: {

      session:
        buildSessionLeaderboard(
          players,
          matches,
          session.id
        ),

      allTime:
        buildAllTimeLeaderboard(
          players
        )
    }
  };
}


function buildUpNextView(
  plan,
  players,
  matches,
  sessionId
) {

  if (
    !plan ||
    plan.sessionId !==
      sessionId
  ) {

    return [];
  }

  const map = {};

  players.forEach(
    function(player) {

      map[player.id] =
        player;
    }
  );

  const waitingIds =
    new Set(
      players
        .filter(
          function(player) {

            return (
              player.status ===
              'Waiting'
            );
          }
        )
        .map(
          function(player) {

            return player.id;
          }
        )
    );

  const history =
    getSessionHistory(
      matches,
      sessionId
    );

  return plan.stages
    .filter(
      function(stage) {

        const ids =
          stage.team1.concat(
            stage.team2
          );

        return (
          ids.length === 4 &&
          ids.every(
            function(id) {

              return waitingIds.has(
                id
              );
            }
          )
        );
      }
    )
    .map(
      function(stage, index) {

        const team1 =
          stage.team1.map(
            function(id) {

              return map[id];
            }
          );

        const team2 =
          stage.team2.map(
            function(id) {

              return map[id];
            }
          );

        const evaluation =
          evaluateCandidate(
            team1,
            team2,
            history
          );

        return {

          stageId:
            stage.stageId,

          team1:
            team1.map(
              serializePlayer
            ),

          team2:
            team2.map(
              serializePlayer
            ),

          playerIds:
            stage.team1.concat(
              stage.team2
            ),

          queuePosition:
            index + 1,

          locked:
            Boolean(
              stage.locked
            ),

          custom:
            stage.custom === true,

          warnings:
            evaluation.warnings.labels,

          warningDetails:
            evaluation.warnings.details,

          metrics:
            evaluation.metrics
        };
      }
    );
}


/* =========================================================
   SHEET READ / WRITE
   ========================================================= */

function readPlayers() {

  const sheet =
    getSpreadsheet()
      .getSheetByName(
        PHQ.PLAYERS_SHEET
      );

  const rows =
    sheet.getLastRow();

  if (rows <= 1) {
    return [];
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        rows - 1,
        9
      )
      .getValues();

  return data
    .map(
      function(row, index) {

        const id =
          String(
            row[0] || ''
          ).trim();

        if (!id) {
          return null;
        }

        const elo =
          Number(
            row[4]
          );

        let idle = null;

        if (
          row[8]
        ) {

          const date =
            row[8] instanceof Date
              ? row[8]
              : new Date(
                  row[8]
                );

          if (
            !isNaN(
              date.getTime()
            )
          ) {

            idle =
              date;
          }
        }

        return {

          id:
            id,

          name:
            String(
              row[1] || ''
            ),

          gender:
            String(
              row[2] || ''
            ),

          starTier:
            starsFromElo(
              Number.isFinite(
                elo
              )
                ? elo
                : 800
            ),

          elo:
            Number.isFinite(
              elo
            )
              ? elo
              : 800,

          status:
            String(
              row[5] ||
              'Checked Out'
            ),

          gamesPlayed:
            Number(
              row[6] ||
              0
            ),

          wins:
            Number(
              row[7] ||
              0
            ),

          idleTimestamp:
            idle,

          _row:
            index + 2
        };
      }
    )
    .filter(Boolean);
}


function readMatches() {

  const sheet =
    getSpreadsheet()
      .getSheetByName(
        PHQ.MATCHES_SHEET
      );

  const rows =
    sheet.getLastRow();

  if (rows <= 1) {
    return [];
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        rows - 1,
        10
      )
      .getValues();

  return data
    .map(
      function(row, index) {

        const id =
          String(
            row[0] || ''
          ).trim();

        if (!id) {
          return null;
        }

        let timestamp = null;

        if (
          row[8]
        ) {

          const date =
            row[8] instanceof Date
              ? row[8]
              : new Date(
                  row[8]
                );

          if (
            !isNaN(
              date.getTime()
            )
          ) {

            timestamp =
              date;
          }
        }

        return {

          id:
            id,

          court:
            Number(
              row[1] ||
              0
            ),

          team1Player1:
            String(
              row[2] ||
              ''
            ),

          team1Player2:
            String(
              row[3] ||
              ''
            ),

          team2Player1:
            String(
              row[4] ||
              ''
            ),

          team2Player2:
            String(
              row[5] ||
              ''
            ),

          status:
            String(
              row[6] ||
              'Active'
            ),

          scoreWinner:
            String(
              row[7] ||
              ''
            ),

          timestamp:
            timestamp,

          sessionId:
            String(
              row[9] ||
              ''
            ),

          _row:
            index + 2
        };
      }
    )
    .filter(Boolean);
}


function savePlayers(
  players
) {

  if (!players.length) {
    return;
  }

  const sheet =
    getSpreadsheet()
      .getSheetByName(
        PHQ.PLAYERS_SHEET
      );

  const values =
    players.map(
      function(player) {

        return [

          player.id,

          player.name,

          player.gender,

          starsFromElo(
            player.elo
          ),

          player.elo,

          player.status,

          player.gamesPlayed,

          player.wins,

          player.idleTimestamp ||
            ''
        ];
      }
    );

  sheet
    .getRange(
      2,
      1,
      values.length,
      9
    )
    .setValues(
      values
    );
}


function updateMatchRow(
  match
) {

  const sheet =
    getSpreadsheet()
      .getSheetByName(
        PHQ.MATCHES_SHEET
      );

  sheet
    .getRange(
      match._row,
      1,
      1,
      10
    )
    .setValues([
      [

        match.id,

        match.court,

        match.team1Player1,

        match.team1Player2,

        match.team2Player1,

        match.team2Player2,

        match.status,

        match.scoreWinner,

        match.timestamp || '',

        match.sessionId

      ]
    ]);
}


/* =========================================================
   SERIALIZATION
   ========================================================= */

function serializePlayer(
  player
) {

  const winPct =
    player.gamesPlayed
      ? (
          player.wins /
          player.gamesPlayed
        ) * 100
      : 0;

  return {

    id:
      player.id,

    name:
      player.name,

    gender:
      player.gender,

    starTier:
      starsFromElo(
        player.elo
      ),

    elo:
      Math.round(
        player.elo
      ),

    status:
      player.status,

    gamesPlayed:
      player.gamesPlayed,

    wins:
      player.wins,

    winPercentage:
      Math.round(
        winPct * 10
      ) / 10,

    idleTimestamp:
      player.idleTimestamp
        ? new Date(
            player.idleTimestamp
          ).toISOString()
        : null
  };
}


function serializeMatch(
  match,
  playerMap
) {

  function getPlayer(id) {

    const player =
      playerMap[id];

    return player
      ? serializePlayer(player)
      : {
          id: id,
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

    id:
      match.id,

    court:
      match.court,

    status:
      match.status,

    winner:
      match.scoreWinner || '',

    timestamp:
      match.timestamp
        ? new Date(
            match.timestamp
          ).toISOString()
        : null,

    team1: [

      getPlayer(
        match.team1Player1
      ),

      getPlayer(
        match.team1Player2
      )

    ],

    team2: [

      getPlayer(
        match.team2Player1
      ),

      getPlayer(
        match.team2Player2
      )

    ]
  };
}


/* =========================================================
   LEADERBOARDS
   ========================================================= */

function buildSessionLeaderboard(
  players,
  matches,
  sessionId
) {

  const stats = {};

  players.forEach(
    function(player) {

      stats[player.id] = {

        playerId:
          player.id,

        name:
          player.name,

        elo:
          player.elo,

        games:
          0,

        wins:
          0
      };
    }
  );

  matches
    .filter(
      function(match) {

        return (

          match.sessionId ===
            sessionId &&

          match.status ===
            'Completed' &&

          (
            match.scoreWinner ===
              'Team 1' ||
            match.scoreWinner ===
              'Team 2'
          )
        );
      }
    )
    .forEach(
      function(match) {

        const team1 = [

          match.team1Player1,
          match.team1Player2

        ];

        const team2 = [

          match.team2Player1,
          match.team2Player2

        ];

        team1
          .concat(team2)
          .forEach(
            function(id) {

              if (stats[id]) {
                stats[id].games++;
              }
            }
          );

        const winners =
          match.scoreWinner ===
          'Team 1'
            ? team1
            : team2;

        winners.forEach(
          function(id) {

            if (stats[id]) {
              stats[id].wins++;
            }
          }
        );
      }
    );

  return Object.keys(stats)
    .map(
      function(id) {

        const row =
          stats[id];

        const pct =
          row.games
            ? (
                row.wins /
                row.games
              ) * 100
            : 0;

        return {

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
            Math.round(
              pct * 10
            ) / 10
        };
      }
    )
    .filter(
      function(row) {

        return row.games > 0;
      }
    );
}


function buildAllTimeLeaderboard(
  players
) {

  return players.map(
    function(player) {

      const pct =
        player.gamesPlayed
          ? (
              player.wins /
              player.gamesPlayed
            ) * 100
          : 0;

      return {

        playerId:
          player.id,

        name:
          player.name,

        starTier:
          starsFromElo(
            player.elo
          ),

        elo:
          player.elo,

        games:
          player.gamesPlayed,

        wins:
          player.wins,

        winPercentage:
          Math.round(
            pct * 10
          ) / 10
      };
    }
  );
}


/* =========================================================
   MATCH HISTORY
   ========================================================= */

function getSessionHistory(
  matches,
  sessionId
) {

  return matches.filter(
    function(match) {

      return (

        match.sessionId ===
          sessionId &&

        match.status ===
          'Completed' &&

        (
          match.scoreWinner ===
            'Team 1' ||
          match.scoreWinner ===
            'Team 2'
        )
      );
    }
  );
}


function werePartnersBefore(
  a,
  b,
  history
) {

  return history.some(
    function(match) {

      const team1 = [

        match.team1Player1,
        match.team1Player2

      ];

      const team2 = [

        match.team2Player1,
        match.team2Player2

      ];

      return (

        (
          team1.indexOf(a) >= 0 &&
          team1.indexOf(b) >= 0
        ) ||

        (
          team2.indexOf(a) >= 0 &&
          team2.indexOf(b) >= 0
        )
      );
    }
  );
}


function wereOpponentsBefore(
  a,
  b,
  history
) {

  return history.some(
    function(match) {

      const team1 = [

        match.team1Player1,
        match.team1Player2

      ];

      const team2 = [

        match.team2Player1,
        match.team2Player2

      ];

      return (

        (
          team1.indexOf(a) >= 0 &&
          team2.indexOf(b) >= 0
        ) ||

        (
          team2.indexOf(a) >= 0 &&
          team1.indexOf(b) >= 0
        )
      );
    }
  );
}


function repeatPartnerCount(
  team1,
  team2,
  history
) {

  let count = 0;

  if (
    werePartnersBefore(
      team1[0].id,
      team1[1].id,
      history
    )
  ) {
    count++;
  }

  if (
    werePartnersBefore(
      team2[0].id,
      team2[1].id,
      history
    )
  ) {
    count++;
  }

  return count;
}


function repeatOpponentCount(
  team1,
  team2,
  history
) {

  let count = 0;

  team1.forEach(
    function(a) {

      team2.forEach(
        function(b) {

          if (
            wereOpponentsBefore(
              a.id,
              b.id,
              history
            )
          ) {

            count++;
          }
        }
      );
    }
  );

  return count;
}


/* =========================================================
   UTILITY
   ========================================================= */

function averageElo(
  team
) {

  return (
    team.reduce(
      function(sum, player) {

        return (
          sum +
          Number(
            player.elo
          )
        );
      },
      0
    ) /
    team.length
  );
}


function expectedScore(
  a,
  b
) {

  return (
    1 /
    (
      1 +
      Math.pow(
        10,
        (b - a) / 400
      )
    )
  );
}


function combinations4(
  players
) {

  const result = [];

  for (
    let i = 0;
    i < players.length - 3;
    i++
  ) {

    for (
      let j = i + 1;
      j < players.length - 2;
      j++
    ) {

      for (
        let k = j + 1;
        k < players.length - 1;
        k++
      ) {

        for (
          let l = k + 1;
          l < players.length;
          l++
        ) {

          result.push([
            players[i],
            players[j],
            players[k],
            players[l]
          ]);
        }
      }
    }
  }

  return result;
}


function findPlayer(
  players,
  id
) {

  return players.find(
    function(player) {

      return (
        String(
          player.id
        ) ===
        String(id)
      );
    }
  );
}


function compareWait(
  a,
  b
) {

  const at =
    a.idleTimestamp
      ? new Date(
          a.idleTimestamp
        ).getTime()
      : Date.now();

  const bt =
    b.idleTimestamp
      ? new Date(
          b.idleTimestamp
        ).getTime()
      : Date.now();

  return at - bt;
}


function normalizeName(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
    .toLowerCase();
}


function normalizeDisplayName(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}


function uniqueName(
  base,
  players
) {

  const names =
    new Set(
      players.map(
        function(player) {

          return normalizeName(
            player.name
          );
        }
      )
    );

  let n = 2;

  while (
    names.has(
      normalizeName(
        base +
        ' ' +
        n
      )
    )
  ) {

    n++;
  }

  return (
    base +
    ' ' +
    n
  );
}


function generatePlayerId() {

  return (
    'P-' +
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ''
      )
      .substring(
        0,
        12
      )
      .toUpperCase()
  );
}


function generateMatchId() {

  return (
    'M-' +
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ''
      )
      .substring(
        0,
        12
      )
      .toUpperCase()
  );
}


function makeStageId(
  ids
) {

  return (
    'STG-' +
    ids
      .map(String)
      .sort()
      .join('-')
  );
}


function generateSessionId() {

  const stamp =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    );

  const random =
    String(
      Math.floor(
        Math.random() *
        1000
      )
    ).padStart(
      3,
      '0'
    );

  return (
    'SES-' +
    stamp +
    '-' +
    random
  );
}


function clamp(
  value,
  min,
  max
) {

  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


/* =========================================================
   REVISION / CACHE / LOCK
   ========================================================= */

function getRevision() {

  return Number(
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PHQ.REVISION
      ) || 0
  );
}


function bumpRevision() {

  const next =
    getRevision() + 1;

  PropertiesService
    .getScriptProperties()
    .setProperty(
      PHQ.REVISION,
      String(next)
    );

  return next;
}


function invalidateCache() {

  CacheService
    .getScriptCache()
    .remove(
      PHQ.STATE_CACHE
    );
}


function withLock(
  callback
) {

  const lock =
    LockService
      .getScriptLock();

  if (
    !lock.tryLock(
      PHQ.LOCK_TIMEOUT
    )
  ) {

    const error =
      new Error(
        'PHQueue is busy processing another action.'
      );

    error.code =
      'SERVER_BUSY';

    throw error;
  }

  try {

    return callback();

  } finally {

    lock.releaseLock();
  }
}