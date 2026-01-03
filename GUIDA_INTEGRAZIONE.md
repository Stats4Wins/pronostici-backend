# 📱 Guida Integrazione API Live Scores

## 🎯 Panoramica

Integra l'API Diretta.it nella tua app per:
- ✅ Vedere partite LIVE in tempo reale
- ✅ Selezionare partite da seguire
- ✅ Ricevere notifiche per gol e risultati
- ✅ Aggiornamento automatico ogni 60 secondi

---

## 📡 Endpoint API Disponibili

### Base URL
```
https://pronostici-backend-5mkq.onrender.com
```

### Endpoint Principali (VELOCI ⚡)

#### 1. Tutte le Partite
```bash
GET /api/diretta/live
```
**Risposta:**
```json
{
  "timestamp": "2026-01-03T15:30:00Z",
  "total": 15,
  "matches": [
    {
      "id": "abc123",
      "homeTeam": "Milan",
      "awayTeam": "Inter",
      "homeScore": 1,
      "awayScore": 2,
      "status": "LIVE",
      "minute": "78'",
      "league": "Serie A",
      "country": "Italia",
      "url": "https://www.diretta.it/partita/abc123"
    }
  ],
  "cached": false,
  "source": "FlashScore Mobile API"
}
```

#### 2. Solo Serie A
```bash
GET /api/diretta/league/serie-a
```

#### 3. Solo Partite LIVE
```bash
GET /api/diretta/status/live
```

#### 4. Solo Partite Programmate
```bash
GET /api/diretta/status/scheduled
```

---

## 💻 Integrazione nel Codice React

### Step 1: Aggiungi Stati per Live Scores

Nel tuo componente principale (dopo gli altri `useState`):

```javascript
// === LIVE SCORES ===
const [partiteLive, setPartiteLive] = useState([]);
const [partiteSeguiti, setPartiteSeguiti] = useState([]); // IDs partite selezionate
const [ultimoAggiornamento, setUltimoAggiornamento] = useState(null);
const [loadingLive, setLoadingLive] = useState(false);
```

### Step 2: Funzione per Fetch Partite Live

```javascript
// Fetch partite live dall'API
async function fetchPartiteLive() {
  setLoadingLive(true);
  try {
    const response = await fetch('https://pronostici-backend-5mkq.onrender.com/api/diretta/live');
    const data = await response.json();
    
    if (data.matches) {
      setPartiteLive(data.matches);
      setUltimoAggiornamento(new Date());
      
      // Controlla notifiche per partite seguite
      controllaNotifiche(data.matches);
    }
  } catch (error) {
    console.error('Errore fetch live:', error);
    mostraToast('Errore caricamento partite live', 'error');
  } finally {
    setLoadingLive(false);
  }
}

// Fetch automatico ogni 60 secondi
useEffect(() => {
  fetchPartiteLive(); // Prima chiamata
  
  const interval = setInterval(() => {
    fetchPartiteLive();
  }, 60000); // 60 secondi
  
  return () => clearInterval(interval);
}, []);
```

### Step 3: Funzione per Selezionare Partite da Seguire

```javascript
// Toggle partita seguita
function togglePartitaSeguita(matchId) {
  setPartiteSeguiti(prev => {
    if (prev.includes(matchId)) {
      // Rimuovi
      return prev.filter(id => id !== matchId);
    } else {
      // Aggiungi
      mostraToast('Partita aggiunta ai seguiti', 'success');
      return [...prev, matchId];
    }
  });
}

// Salva in localStorage
useEffect(() => {
  localStorage.setItem('partiteSeguiti', JSON.stringify(partiteSeguiti));
}, [partiteSeguiti]);

// Carica da localStorage all'avvio
useEffect(() => {
  const saved = localStorage.getItem('partiteSeguiti');
  if (saved) {
    setPartiteSeguiti(JSON.parse(saved));
  }
}, []);
```

### Step 4: Sistema Notifiche

```javascript
// Stato precedente per confronto
const [partitePrecedenti, setPartitePrecedenti] = useState([]);

// Controlla cambiamenti e invia notifiche
function controllaNotifiche(nuovePartite) {
  if (partitePrecedenti.length === 0) {
    setPartitePrecedenti(nuovePartite);
    return;
  }
  
  // Controlla solo partite seguite
  nuovePartite.forEach(nuova => {
    if (!partiteSeguiti.includes(nuova.id)) return;
    
    const vecchia = partitePrecedenti.find(p => p.id === nuova.id);
    if (!vecchia) return;
    
    // GOL CASA
    if (nuova.homeScore > vecchia.homeScore) {
      inviaNotifica(
        `⚽ GOL ${nuova.homeTeam}!`,
        `${nuova.homeTeam} ${nuova.homeScore} - ${nuova.awayScore} ${nuova.awayTeam}`
      );
      mostraToast(`⚽ GOL! ${nuova.homeTeam} segna!`, 'success');
    }
    
    // GOL TRASFERTA
    if (nuova.awayScore > vecchia.awayScore) {
      inviaNotifica(
        `⚽ GOL ${nuova.awayTeam}!`,
        `${nuova.homeTeam} ${nuova.homeScore} - ${nuova.awayScore} ${nuova.awayTeam}`
      );
      mostraToast(`⚽ GOL! ${nuova.awayTeam} segna!`, 'success');
    }
    
    // PARTITA FINITA
    if (vecchia.status === 'LIVE' && nuova.status === 'FINISHED') {
      inviaNotifica(
        `🏁 Fischio Finale!`,
        `${nuova.homeTeam} ${nuova.homeScore} - ${nuova.awayScore} ${nuova.awayTeam}`
      );
      mostraToast(`🏁 Finita: ${nuova.homeTeam} vs ${nuova.awayTeam}`, 'info');
    }
  });
  
  setPartitePrecedenti(nuovePartite);
}

// Invia notifica browser
function inviaNotifica(titolo, messaggio) {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    new Notification(titolo, {
      body: messaggio,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200]
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(titolo, {
          body: messaggio,
          icon: '/icon-192.png'
        });
      }
    });
  }
}
```

### Step 5: UI - Sezione Partite Live

Aggiungi questa sezione nel tuo JSX (dopo le statistiche):

```jsx
{/* === PARTITE LIVE === */}
<div className="card rounded-lg shadow-lg p-6 mb-8">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
      <span className="text-2xl">⚽</span>
      Partite Live
    </h2>
    <button 
      onClick={fetchPartiteLive}
      disabled={loadingLive}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
    >
      {loadingLive ? '🔄' : '🔄'} Aggiorna
    </button>
  </div>
  
  {ultimoAggiornamento && (
    <p className="text-xs text-gray-500 mb-3">
      Ultimo aggiornamento: {ultimoAggiornamento.toLocaleTimeString('it-IT')}
    </p>
  )}
  
  {loadingLive ? (
    <div className="text-center py-8 text-gray-500">Caricamento...</div>
  ) : partiteLive.length === 0 ? (
    <div className="text-center py-8 text-gray-500">
      <p className="text-4xl mb-3">⚽</p>
      <p>Nessuna partita disponibile</p>
    </div>
  ) : (
    <div className="space-y-3">
      {/* Filtro: mostra prima le LIVE */}
      {partiteLive
        .sort((a, b) => {
          if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
          if (a.status !== 'LIVE' && b.status === 'LIVE') return 1;
          return 0;
        })
        .map(match => (
          <div 
            key={match.id}
            className={`border-2 rounded-lg p-4 ${
              match.status === 'LIVE' 
                ? 'border-red-400 bg-red-50' 
                : 'border-gray-200 bg-white'
            } ${partiteSeguiti.includes(match.id) ? 'ring-2 ring-blue-500' : ''}`}
          >
            {/* Header con Status e Checkbox */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {match.status === 'LIVE' && (
                  <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                    🔴 LIVE
                  </span>
                )}
                <span className="text-xs text-gray-600">
                  {match.league}
                </span>
              </div>
              
              {/* Checkbox per seguire */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={partiteSeguiti.includes(match.id)}
                  onChange={() => togglePartitaSeguita(match.id)}
                  className="w-5 h-5 text-blue-600"
                />
                <span className="text-xs text-gray-600">Segui</span>
              </label>
            </div>
            
            {/* Partita */}
            <div className="flex items-center justify-between">
              {/* Casa */}
              <div className="flex items-center gap-2 flex-1">
                {getStemma(match.homeTeam) && (
                  <img 
                    src={getStemma(match.homeTeam)} 
                    alt={match.homeTeam}
                    className="w-8 h-8 object-contain"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
                <span className="font-semibold text-gray-800">
                  {match.homeTeam}
                </span>
              </div>
              
              {/* Score */}
              <div className="flex items-center gap-3 px-4">
                <span className="text-2xl font-bold text-blue-600">
                  {match.homeScore ?? '-'}
                </span>
                <span className="text-gray-400">-</span>
                <span className="text-2xl font-bold text-blue-600">
                  {match.awayScore ?? '-'}
                </span>
              </div>
              
              {/* Trasferta */}
              <div className="flex items-center gap-2 flex-1 justify-end">
                <span className="font-semibold text-gray-800">
                  {match.awayTeam}
                </span>
                {getStemma(match.awayTeam) && (
                  <img 
                    src={getStemma(match.awayTeam)} 
                    alt={match.awayTeam}
                    className="w-8 h-8 object-contain"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
              </div>
            </div>
            
            {/* Footer con Minuto */}
            <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
              <span>
                {match.status === 'LIVE' ? match.minute : `Ore ${match.minute}`}
              </span>
              {match.url && (
                <a 
                  href={match.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Dettagli →
                </a>
              )}
            </div>
          </div>
        ))}
    </div>
  )}
</div>
```

### Step 6: Funzione Helper per Stemmi

Aggiungi questa funzione (la tua già esiste, ma assicurati supporti i nomi API):

```javascript
function getStemma(nomeSquadra) {
  if (!nomeSquadra) return null;
  
  // Il tuo STEMMISQUADRE esistente già funziona
  return getStemmaSquadra(nomeSquadra);
}
```

---

## 🔔 Configurazione Notifiche Push

### Richiedi Permessi all'Avvio

Aggiungi nel `useEffect` principale:

```javascript
useEffect(() => {
  // Richiedi permesso notifiche
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, []);
```

---

## 📊 Badge Notifiche

Mostra badge con numero partite live seguite:

```jsx
<div className="relative inline-block">
  <button className="...">
    ⚽ Partite Live
  </button>
  {partiteLive.filter(m => m.status === 'LIVE' && partiteSeguiti.includes(m.id)).length > 0 && (
    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
      {partiteLive.filter(m => m.status === 'LIVE' && partiteSeguiti.includes(m.id)).length}
    </span>
  )}
</div>
```

---

## 🎨 CSS Aggiuntivo

Aggiungi nello `<style>` esistente:

```css
/* Animazione pulsante LIVE */
@keyframes pulse-live {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.animate-pulse-live {
  animation: pulse-live 2s ease-in-out infinite;
}

/* Badge notifiche */
.notification-badge {
  animation: bounce 1s ease infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
```

---

## 🧪 Test

### 1. Test API
```bash
curl https://pronostici-backend-5mkq.onrender.com/api/diretta/live
```

### 2. Test Notifiche
1. Seleziona una partita live
2. Aspetta aggiornamento (60s)
3. Se c'è un gol, riceverai notifica

---

## 📱 PWA - Background Sync (Avanzato)

Per notifiche anche con app chiusa, aggiungi nel `sw.js`:

```javascript
// Background sync per partite live
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-live-scores') {
    event.waitUntil(syncLiveScores());
  }
});

async function syncLiveScores() {
  const response = await fetch('https://pronostici-backend-5mkq.onrender.com/api/diretta/status/live');
  const data = await response.json();
  
  // Invia notifica se ci sono gol
  // ... logica notifiche
}
```

---

## 🚀 Deploy e Performance

### Cache API
- L'API ha cache di **60 secondi**
- Richieste successive entro 60s sono istantanee

### Ottimizzazioni
- Usa `useCallback` per funzioni
- Memoizza rendering liste con `useMemo`
- Debounce sui toggle checkbox

---

## 📞 Supporto

Per problemi o domande:
- GitHub Issues: [Stats4Wins/pronostici-backend](https://github.com/Stats4Wins/pronostici-backend/issues)
- API Status: `GET /api/health`

---

## 🎉 Funzionalità Complete

✅ Partite live in tempo reale  
✅ Selezione partite da seguire  
✅ Notifiche per gol  
✅ Notifiche fischio finale  
✅ Aggiornamento automatico  
✅ Salvataggio preferenze  
✅ UI responsive mobile  
✅ Badge contatori  
✅ Link diretti Diretta.it  

**Enjoy! ⚽🎉**
