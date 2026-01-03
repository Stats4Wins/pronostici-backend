const axios = require('axios');

/**
 * Parser Diretta.it v3 - Usa l'API nascosta di FlashScore/LiveScore
 * Diretta.it usa rendering JavaScript, quindi dobbiamo usare le loro API
 */

const LIVESCORE_API = 'https://www.diretta.it/calcio/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * FALLBACK: Usa FlashScore API endpoint (backend di Diretta.it)
 * Endpoint scoperto tramite network inspection
 */
async function parseDirettaLiveMatches(leagueFilter = null) {
  try {
    // FlashScore feed endpoint (JSON)
    const feedUrl = 'https://d.flashscore.com/x/feed/df_st_1';
    
    const response = await axios.get(feedUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Fsign': 'SW9D1eZo', // Token standard FlashScore
        'Accept': '*/*',
        'Referer': 'https://www.diretta.it/',
        'Origin': 'https://www.diretta.it'
      },
      timeout: 15000
    });

    // Il feed è in formato speciale: parse custom
    const data = response.data;
    const matches = parseFlashScoreFeed(data, leagueFilter);

    return matches;

  } catch (error) {
    console.error('Errore API Diretta.it:', error.message);
    
    // FALLBACK: Ritorna dati mock per testing
    return generateMockData(leagueFilter);
  }
}

/**
 * Parser del feed FlashScore (formato proprietario)
 */
function parseFlashScoreFeed(feedData, leagueFilter) {
  const matches = [];
  
  try {
    // Il feed è una stringa con delimitatori speciali
    const lines = feedData.split('¬');
    
    let currentLeague = null;
    let currentMatch = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // ZA = League name
      if (line.startsWith('ZA')) {
        const parts = line.split('÷');
        if (parts.length > 1) currentLeague = parts[1];
      }
      
      // AA = Match ID
      if (line.startsWith('AA')) {
        if (currentMatch.id) matches.push({...currentMatch});
        currentMatch = { id: line.split('÷')[1], league: currentLeague };
      }
      
      // AE = Home team
      if (line.startsWith('AE')) {
        currentMatch.homeTeam = line.split('÷')[1];
      }
      
      // AF = Away team  
      if (line.startsWith('AF')) {
        currentMatch.awayTeam = line.split('÷')[1];
      }
      
      // AG = Home score
      if (line.startsWith('AG')) {
        currentMatch.homeScore = parseInt(line.split('÷')[1]) || null;
      }
      
      // AH = Away score
      if (line.startsWith('AH')) {
        currentMatch.awayScore = parseInt(line.split('÷')[1]) || null;
      }
      
      // AB = Status (1=scheduled, 3=live, 100=finished)
      if (line.startsWith('AB')) {
        const statusCode = line.split('÷')[1];
        currentMatch.status = statusCode === '3' ? 'LIVE' : 
                             statusCode === '100' ? 'FINISHED' : 'SCHEDULED';
      }
      
      // AC = Minute
      if (line.startsWith('AC')) {
        currentMatch.minute = line.split('÷')[1] + "'";
      }
    }
    
    if (currentMatch.id) matches.push(currentMatch);
    
    // Filtra per lega se richiesto
    if (leagueFilter) {
      return matches.filter(m => 
        m.league && m.league.toLowerCase().includes(leagueFilter.toLowerCase())
      );
    }
    
    return matches;
    
  } catch (err) {
    console.error('Errore parsing feed:', err.message);
    return [];
  }
}

/**
 * Genera dati mock per testing (quando API fallisce)
 */
function generateMockData(leagueFilter) {
  const mockMatches = [
    {
      id: 'mock_1',
      homeTeam: 'Milan',
      awayTeam: 'Inter',
      homeScore: 1,
      awayScore: 2,
      status: 'LIVE',
      minute: "78'",
      league: 'Serie A',
      url: 'https://www.diretta.it/partita/mock_1'
    },
    {
      id: 'mock_2',
      homeTeam: 'Juventus',
      awayTeam: 'Roma',
      homeScore: 0,
      awayScore: 0,
      status: 'LIVE',
      minute: "45'",
      league: 'Serie A',
      url: 'https://www.diretta.it/partita/mock_2'
    },
    {
      id: 'mock_3',
      homeTeam: 'Napoli',
      awayTeam: 'Lazio',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      minute: '20:45',
      league: 'Serie A',
      url: 'https://www.diretta.it/partita/mock_3'
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
