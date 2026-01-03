const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Parser Diretta.it v2 - Usa data-testid stabili
 * Fix: sostituisce classi dinamiche con attributi stabili
 */
async function parseDirettaLiveMatches(leagueFilter = null) {
  try {
    const url = 'https://www.diretta.it/calcio/';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const matches = [];

    // Seleziona tutte le partite con data-event-row="true"
    $('[data-event-row="true"]').each((i, matchEl) => {
      try {
        const $match = $(matchEl);

        // Estrai squadre usando data-testid stabile
        const homeTeam = $match.find('[data-testid="wcl-matchRow-participant"]')
          .first()
          .find('[data-testid="wcl-scores-simple-text-01"]')
          .text()
          .trim();

        const awayTeam = $match.find('[data-testid="wcl-matchRow-participant"]')
          .last()
          .find('[data-testid="wcl-scores-simple-text-01"]')
          .text()
          .trim();

        if (!homeTeam || !awayTeam) return;

        // Punteggi
        const scores = $match.find('[data-testid="wcl-matchRowScore"]');
        let homeScore = scores.first().text().trim();
        let awayScore = scores.last().text().trim();

        // Se '-' o vuoti, metti null
        if (homeScore === '-' || homeScore === '') homeScore = null;
        if (awayScore === '-' || awayScore === '') awayScore = null;

        // Status: cerca classe eventmatch--live o data-state="live"
        const isLive = $match.hasClass('eventmatch--live') || 
                       $match.find('[data-state="live"]').length > 0;
        
        const status = isLive ? 'LIVE' : 'SCHEDULED';

        // Minuto (se live)
        let minute = null;
        if (isLive) {
          const stageText = $match.find('.eventstage--block').text().trim();
          const minMatch = stageText.match(/(\d+)/);
          if (minMatch) minute = minMatch[1] + "'";
        } else {
          // Orario programmato
          const timeText = $match.find('.eventtime').text().trim();
          if (timeText) minute = timeText;
        }

        // Lega: cerca headerLeague precedente
        let league = 'Unknown';
        let $current = $match;
        for (let j = 0; j < 50; j++) {
          $current = $current.prev();
          if (!$current.length) break;
          
          if ($current.hasClass('headerLeague')) {
            const leagueText = $current.find('[data-testid="wcl-scores-simple-text-01"]')
              .first()
              .text()
              .trim();
            if (leagueText) {
              league = leagueText;
              break;
            }
          }
        }

        // Filtro lega se richiesto
        if (leagueFilter && !league.toLowerCase().includes(leagueFilter.toLowerCase())) {
          return;
        }

        // URL partita
        const matchUrl = $match.find('a.eventRowLink').attr('href');
        const fullUrl = matchUrl ? `https://www.diretta.it${matchUrl}` : null;

        matches.push({
          id: matchUrl ? matchUrl.split('?mid=')[1] : null,
          homeTeam,
          awayTeam,
          homeScore: homeScore ? parseInt(homeScore) : null,
          awayScore: awayScore ? parseInt(awayScore) : null,
          status,
          minute,
          league,
          url: fullUrl
        });

      } catch (err) {
        console.error('Errore parsing singola partita:', err.message);
      }
    });

    return matches;

  } catch (error) {
    console.error('Errore fetch Diretta.it:', error.message);
    throw new Error(`Parser Diretta.it fallito: ${error.message}`);
  }
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
