/**
 * Parser per HTML di Diretta.it / FlashScore
 * Estrae partite live e programmate
 */

const cheerio = require('cheerio');

class DirettaParser {
  /**
   * Parse HTML da Diretta.it e estrae le partite
   * @param {string} html - HTML della pagina
   * @returns {Object} - Dati strutturati delle partite
   */
  static parseMatches(html) {
    const $ = cheerio.load(html);
    const matches = [];
    let currentLeague = null;
    let currentCountry = null;

    // Itera su tutti gli elementi
    $('.sportName.soccer').each((_, sportSection) => {
      $(sportSection).find('.headerLeague__wrapper, .eventmatch').each((_, element) => {
        const $el = $(element);

        // Se è un header di campionato
        if ($el.hasClass('headerLeague__wrapper')) {
          currentLeague = $el.find('.headerLeague__title-text').text().trim();
          currentCountry = $el.find('.headerLeague__category-text').text().trim();
        }
        // Se è una partita
        else if ($el.hasClass('eventmatch')) {
          const match = this.parseMatch($, $el, currentLeague, currentCountry);
          if (match) {
            matches.push(match);
          }
        }
      });
    });

    return {
      timestamp: new Date().toISOString(),
      total: matches.length,
      matches
    };
  }

  /**
   * Parse singola partita
   */
  static parseMatch($, $match, league, country) {
    try {
      // Estrai squadre
      const $home = $match.find('.eventhomeParticipant .wcl-name_jjfMf');
      const $away = $match.find('.eventawayParticipant .wcl-name_jjfMf');
      
      if (!$home.length || !$away.length) return null;

      // Estrai score
      const $homeScore = $match.find('.eventscore--home');
      const $awayScore = $match.find('.eventscore--away');

      // Estrai orario
      const time = $match.find('.eventtime').text().trim();

      // Determina status
      let status = 'scheduled';
      if ($match.hasClass('eventmatch--live')) status = 'live';
      else if ($homeScore.attr('data-state') === 'final') status = 'finished';

      return {
        league: league || 'Unknown',
        country: country || 'Unknown',
        homeTeam: $home.text().trim(),
        awayTeam: $away.text().trim(),
        homeScore: $homeScore.text().trim() || null,
        awayScore: $awayScore.text().trim() || null,
        time: time || null,
        status,
        link: $match.find('.eventRowLink').attr('href') || null
      };
    } catch (error) {
      console.error('Error parsing match:', error);
      return null;
    }
  }

  /**
   * Filtra partite per campionato
   */
  static filterByLeague(matches, leagueName) {
    return matches.filter(m => 
      m.league.toLowerCase().includes(leagueName.toLowerCase())
    );
  }

  /**
   * Filtra partite per status
   */
  static filterByStatus(matches, status) {
    return matches.filter(m => m.status === status);
  }
}

module.exports = DirettaParser;
