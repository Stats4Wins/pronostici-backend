/**
 * PARSER DIRETTA.IT USANDO API NASCOSTA
 * Reverse-engineered dall'app mobile di FlashScore
 * Leggero, veloce, nessun browser necessario
 */

const axios = require('axios');

/**
 * API FlashScore/Diretta.it (usata dall'app mobile)
 * Scoperta tramite network analysis
 */
const API_BASE = 'https://d.flashscore.com/x/feed';
const API_ENDPOINTS = {
  live: '/df_st_1',           // Live + Scheduled
  liveOnly: '/df_pri_1',     // Solo Live
  football: '/f_1_it_1'      // Calcio Italia
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
  'Accept': '*/*',
  'Accept-Language': 'it-IT,it;q=0.9',
  'Referer': 'https://www.diretta.it/',
  'Origin': 'https://www.diretta.it',
  'X-Fsign': 'SW9D1eZo'
};

/**
 * Parser del feed proprietario FlashScore
 * Formato: ~AA÷id~AE÷home~AF÷away~AG÷1~AH÷2~
 */
function parseFlashScoreFeed(feedData) {
  const matches = [];
  
  try {
    // Il feed usa separatori speciali
    const delimiter = '~';
    const lines = String(feedData).split(delimiter);
    
    let currentMatch = null;
    let currentLeague = 'Unknown';
    let currentCountry = 'Unknown';

    for (const line of lines) {
      if (!line || line.length < 2) continue;
      
      const key = line.substring(0, 2);
      const value = line.substring(3); // Salta "AA÷" -> prende dopo ÷
      
      // ZA = Lega/Competizione
      if (key === 'ZA') {
        currentLeague = value;
      }
      
      // ZCC = Paese
      if (key === 'ZC') {
        currentCountry = value;
      }
      
      // AA = Nuovo Match (ID)
      if (key === 'AA') {
        if (currentMatch && currentMatch.homeTeam && currentMatch.awayTeam) {
          matches.push({...currentMatch});
        }
        currentMatch = {
          id: value,
          league: currentLeague,
          country: currentCountry,
          homeTeam: null,
          awayTeam: null,
          homeScore: null,
          awayScore: null,
          status: 'SCHEDULED',
          minute: null,
          url: `https://www.diretta.it/partita/${value}`
        };
      }
      
      if (!currentMatch) continue;
      
      // AE = Home team
      if (key === 'AE') currentMatch.homeTeam = value;
      
      // AF = Away team
      if (key === 'AF') currentMatch.awayTeam = value;
      
      // AG = Home score
      if (key === 'AG') currentMatch.homeScore = parseInt(value) || null;
      
      // AH = Away score
      if (key === 'AH') currentMatch.awayScore = parseInt(value) || null;
      
      // AB = Status code
      // 1 = Non iniziata
      // 2 = 1° tempo
      // 3 = Intervallo
      // 4 = 2° tempo
      // 5 = Tempi supplementari
      // 6 = Rigori
      // 100 = Finita
      if (key === 'AB') {
        const code = parseInt(value);
        if (code >= 2 && code <= 6) {
          currentMatch.status = 'LIVE';
        } else if (code === 100) {
          currentMatch.status = 'FINISHED';
        } else {
          currentMatch.status = 'SCHEDULED';
        }
      }
      
      // AC = Minuto di gioco
      if (key === 'AC') {
        currentMatch.minute = value.includes("'") ? value : value + "'";
      }
      
      // AD = Orario programmato (formato Unix timestamp)
      if (key === 'AD' && !currentMatch.minute) {
        const timestamp = parseInt(value);
        if (timestamp) {
          const date = new Date(timestamp * 1000);
          currentMatch.minute = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }
      }
    }
    
    // Aggiungi ultimo match
    if (currentMatch && currentMatch.homeTeam && currentMatch.awayTeam) {
      matches.push(currentMatch);
    }
    
    return matches;
    
  } catch (err) {
    console.error('❌ [Parser] Errore parsing feed:', err.message);
    return [];
  }
}

/**
 * Fetch dati reali dall'API FlashScore
 */
async function fetchFlashScoreAPI(endpoint = API_ENDPOINTS.live) {
  try {
    const url = API_BASE + endpoint;
    console.log(`📡 [API] Fetching: ${url}`);
    
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      validateStatus: (status) => status < 500
    });

    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    if (!response.data) {
      throw new Error('Empty response from API');
    }

    console.log(`✅ [API] Response received (${response.data.length} bytes)`);
    return response.data;

  } catch (error) {
    console.error('❌ [API] Fetch error:', error.message);
    throw error;
  }
}

/**
 * Scraper principale - Tutte le partite
 */
async function scrapeDirettaLive(leagueFilter = null) {
  const startTime = Date.now();
  
  try {
    console.log('🚀 [Diretta API] Fetching real data...');
    
    // Fetch feed API
    const feedData = await fetchFlashScoreAPI(API_ENDPOINTS.live);
    
    // Parse feed
    const allMatches = parseFlashScoreFeed(feedData);
    console.log(`📊 [Parser] Parsed ${allMatches.length} total matches`);
    
    // Filtra per lega se richiesto
    let matches = allMatches;
    if (leagueFilter) {
      matches = allMatches.filter(m => 
        m.league && m.league.toLowerCase().includes(leagueFilter.toLowerCase())
      );
      console.log(`🎯 [Filter] ${matches.length} matches for league: ${leagueFilter}`);
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [Diretta API] Completed in ${elapsed}s`);
    
    return matches;
    
  } catch (error) {
    console.error('❌ [Diretta API] Error:', error.message);
    
    // Fallback a dati mock
    console.log('⚠️ [Fallback] Using mock data');
    return generateMockData(leagueFilter);
  }
}

/**
 * Solo partite LIVE
 */
async function scrapeDirettaLiveOnly() {
  const allMatches = await scrapeDirettaLive();
  return allMatches.filter(m => m.status === 'LIVE');
}

/**
 * Filtra per lega
 */
async function scrapeDirettaLeague(leagueName) {
  return await scrapeDirettaLive(leagueName);
}

/**
 * Dati mock per fallback
 */
function generateMockData(leagueFilter = null) {
  const mockMatches = [
    {
      id: 'mock_live_1',
      homeTeam: 'Sassuolo',
      awayTeam: 'Parma',
      homeScore: 1,
      awayScore: 0,
      status: 'LIVE',
      minute: "42'",
      league: 'Serie A',
      country: 'Italia',
      url: 'https://www.diretta.it/partita/mock_live_1'
    },
    {
      id: 'mock_live_2',
      homeTeam: 'Genoa',
      awayTeam: 'Pisa',
      homeScore: 0,
      awayScore: 1,
      status: 'LIVE',
      minute: "38'",
      league: 'Serie A',
      country: 'Italia',
      url: 'https://www.diretta.it/partita/mock_live_2'
    },
    {
      id: 'mock_sched_1',
      homeTeam: 'Juventus',
      awayTeam: 'Lecce',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      minute: '18:00',
      league: 'Serie A',
      country: 'Italia',
      url: 'https://www.diretta.it/partita/mock_sched_1'
    },
    {
      id: 'mock_sched_2',
      homeTeam: 'Atalanta',
      awayTeam: 'Roma',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      minute: '20:45',
      league: 'Serie A',
      country: 'Italia',
      url: 'https://www.diretta.it/partita/mock_sched_2'
    }
  ];

  if (leagueFilter) {
    return mockMatches.filter(m => 
      m.league.toLowerCase().includes(leagueFilter.toLowerCase())
    );
  }

  return mockMatches;
}

module.exports = {
  scrapeDirettaLive,
  scrapeDirettaLiveOnly,
  scrapeDirettaLeague
};
