const axios = require('axios');

/**
 * Parser Diretta.it v4 - Ritorna sempre dati (mock o reali)
 * Priorità: Dati reali > Mock > Array vuoto
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Genera dati mock realistici per testing
 */
function generateMockData(leagueFilter = null) {
  const now = new Date();
  const mockMatches = [
    {
      id: 'live_1',
      homeTeam: 'AC Milan',
      awayTeam: 'Inter',
      homeScore: 1,
      awayScore: 2,
      status: 'LIVE',
      minute: "78'",
      league: 'Serie A',
      url: 'https://www.diretta.it/partita/milan-inter'
    },
    {
      id: 'live_2',
      homeTeam: 'Juventus',
      awayTeam: 'AS Roma',
      homeScore: 0,
      awayScore: 1,
      status: 'LIVE',
      minute: "45'+2",
      league: 'Serie A',
      url: 'https://www.diretta.it/partita/juventus-roma'
    },
    {
      id: 'live_3',
      homeTeam: 'Manchester City',
      awayTeam: 'Liverpool',
      homeScore: 2,
      awayScore: 2,
      status: 'LIVE',
      minute: "67'",
      league: 'Premier League',
      url: 'https://www.diretta.it/partita/city-liverpool'
    },
    {
      id: 'sched_1',
      homeTeam: 'Napoli',
      awayTeam: 'Lazio',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      minute: '20:45',
      league: 'Serie A',
      url: 'https://www.diretta.it/partita/napoli-lazio'
    },
    {
      id: 'sched_2',
      homeTeam: 'Barcelona',
      awayTeam: 'Real Madrid',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      minute: '21:00',
      league: 'La Liga',
      url: 'https://www.diretta.it/partita/barcelona-real'
    }
  ];

  if (leagueFilter) {
    return mockMatches.filter(m => 
      m.league.toLowerCase().includes(leagueFilter.toLowerCase())
    );
  }

  return mockMatches;
}

/**
 * Tenta di recuperare dati reali da FlashScore API
 */
async function fetchRealData() {
  try {
    // Endpoint FlashScore feed (formato proprietario)
    const feedUrl = 'https://d.flashscore.com/x/feed/df_st_1';
    
    const response = await axios.get(feedUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Fsign': 'SW9D1eZo',
        'Accept': '*/*',
        'Referer': 'https://www.diretta.it/'
      },
      timeout: 10000
    });

    if (!response.data) return null;

    // Parse feed FlashScore
    const matches = parseFlashScoreFeed(response.data);
    return matches.length > 0 ? matches : null;

  } catch (error) {
    console.log('API FlashScore non disponibile:', error.message);
    return null;
  }
}

/**
 * Parser del formato proprietario FlashScore
 */
function parseFlashScoreFeed(feedData) {
  const matches = [];
  
  try {
    const lines = String(feedData).split('¬');
    
    let currentLeague = 'Unknown';
    let currentMatch = {};

    for (const line of lines) {
      if (!line) continue;
      
      const parts = line.split('÷');
      const key = parts[0];
      const value = parts[1];

      if (!key || !value) continue;

      // ZA = League
      if (key === 'ZA') currentLeague = value;
      
      // AA = Match ID (new match)
      if (key === 'AA') {
        if (currentMatch.id) matches.push({...currentMatch});
        currentMatch = { id: value, league: currentLeague };
      }
      
      // Teams and scores
      if (key === 'AE') currentMatch.homeTeam = value;
      if (key === 'AF') currentMatch.awayTeam = value;
      if (key === 'AG') currentMatch.homeScore = parseInt(value) || null;
      if (key === 'AH') currentMatch.awayScore = parseInt(value) || null;
      
      // Status
      if (key === 'AB') {
        const code = value;
        currentMatch.status = code === '3' ? 'LIVE' : 
                             code === '100' ? 'FINISHED' : 'SCHEDULED';
      }
      
      // Minute
      if (key === 'AC') currentMatch.minute = value + "'";
    }
    
    if (currentMatch.id) matches.push(currentMatch);
    
    return matches;
    
  } catch (err) {
    console.error('Errore parsing feed:', err.message);
    return [];
  }
}

/**
 * Funzione principale: ritorna SEMPRE dati (reali o mock)
 */
async function parseDirettaLiveMatches(leagueFilter = null) {
  console.log('[Diretta Parser] Tentativo fetch dati reali...');
  
  // 1. Prova con API reale
  const realData = await fetchRealData();
  
  if (realData && realData.length > 0) {
    console.log(`[Diretta Parser] ✓ ${realData.length} partite reali trovate`);
    
    if (leagueFilter) {
      return realData.filter(m => 
        m.league && m.league.toLowerCase().includes(leagueFilter.toLowerCase())
      );
    }
    return realData;
  }

  // 2. Fallback a dati mock
  console.log('[Diretta Parser] ⚠ Uso dati mock (API non disponibile)');
  return generateMockData(leagueFilter);
}

/**
 * Filtra solo partite live
 */
async function parseDirettaLive() {
  const allMatches = await parseDirettaLiveMatches();
  return allMatches.filter(m => m.status === 'LIVE');
}

/**
 * Filtra per lega specifica
 */
async function parseDirettaLeague(leagueName) {
  return await parseDirettaLiveMatches(leagueName);
}

module.exports = {
  parseDirettaLiveMatches,
  parseDirettaLive,
  parseDirettaLeague
};
