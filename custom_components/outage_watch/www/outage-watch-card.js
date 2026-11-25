const TAG = "outage-watch-card";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);
const icons = (name) => `<ha-icon icon="mdi:${escape(name)}"></ha-icon>`;
const timestamp = (value, locale) => value ? new Date(value * 1000).toLocaleTimeString(locale, {hour:"numeric", minute:"2-digit"}) : "—";
const labels = {
  provider_outage: "Provider outage", unreachable: "Unreachable",
  provider_degraded: "Possible problems", slow: "Slow response",
  intermittent: "Intermittent", blocked: "Check blocked", internet_down: "Unknown",
};
const rank = {outage: 0, possible_problems: 1, unknown: 2, operational: 3};
function label(service) {
  return labels[service.reason] || (service.status === "operational"
    ? (service.maintenance ? "Maintenance" : service.signal === "Checks only" || !service.feed_fresh ? "Reachable" : "Operational")
    : "Unknown");
}

function graph(service, detailed = false, locale) {
  const rows = service.history || [];
  const successful = rows.filter((row) => row[1] === "ok");
  if (!successful.length) return `<div class="no-chart">${service.signal === "Feed only" ? "Provider feed only" : "No response time history yet"}</div>`;
  const readings = successful.map((row) => row[2]);
  const peak = Math.max(...readings);
  const limit = Math.max(50, (service.baseline || 0) * 1.2, peak) * 1.04;
  const tickSize = 10 ** Math.floor(Math.log10(limit / 4));
  const max = detailed ? Math.ceil(limit / tickSize) * tickSize : limit;
  const ticks = [0, 1, 2, 3, 4];
  const format = (number) => number.toLocaleString(locale, {maximumFractionDigits:2});
  const now = Date.now() / 1000, height = detailed ? 120 : 26;
  // Reachability checks can back off to four polling intervals. The monitor
  // considers a reading fresh for five intervals, including scheduling jitter.
  let previous = null, single = "", dots = "", path = "";
  for (const [time, state, ms, interval = 300] of rows) {
    if (state !== "ok") { previous = null; continue; }
    const gap = previous === null || time - previous > 5 * interval;
    const x = Math.max(0, Math.min(320, 320 * (time - now + 86400) / 86400));
    const y = height - 2 - (height - 4) * ms / max;
    path += `${gap ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    if (gap) dots += single;
    single = gap ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4" fill="currentColor"/>` : "";
    previous = time;
  }
  const baseline = height - 2 - (height - 4) * service.baseline / max;
  const chart = `<svg class="chart" viewBox="0 0 320 ${height}" preserveAspectRatio="none" role="img" aria-label="Response time over 24 hours">
      ${detailed ? ticks.map((i) => `<path class="gridline" d="M${i * 80} 0v${height} M0 ${2 + i * (height - 4) / 4}h320"/>`).join("") : ""}
      ${detailed && service.baseline != null ? `<path class="baseline" d="M0 ${baseline}h320"/>` : ""}
      <path class="trace" d="${path}"/>${dots}${single}</svg>`;
  if (!detailed) return chart;
  return `<div class="response-chart">
      <div class="response-scale" aria-hidden="true">${ticks.map((i) => `<span>${format(max * (4 - i) / 4)} ms</span>`).join("")}</div>
      ${chart}
      <div class="axis"><span>24h ago</span><span>12h ago</span><span>Now</span></div>
      <div class="muted response-range">${format(Math.min(...readings))}–${format(peak)} ms</div>
    </div>`;
}

const SPEED_SENSORS = [
  {key:"download", label:"Download", arrow:"↓", unit:"Mbit/s"},
  {key:"upload", label:"Upload", arrow:"↑", unit:"Mbit/s"},
  {key:"ping", label:"Ping", arrow:"↔", unit:"ms"},
];
const SPEED_WINDOW = 24 * 60 * 60 * 1000;
const SPEED_STYLES = {
  classic: "Classic",
  matrix: "Signal Matrix",
  gauges: "Neon Gauges",
  rails: "Flux Rails",
  wave: "Aqua Wave",
};
const SPEED_STYLE_KEY = "outage-watch.speed-style";
const SPEED_RANGES = {1:"24 hours", 7:"7 days", 30:"30 days"};

function recordedSpeed(row) {
  return [typeof row.lu === "number" ? row.lu * 1000 : Date.parse(row.last_updated || row.last_changed),
    numeric(row.s ?? row.state)];
}

function numeric(value) {
  return value != null && String(value).trim() !== "" && Number.isFinite(Number(value))
    ? Number(value) : null;
}

function speedGraph(history, series, {days = 1, style = "classic", end = Date.now(), ping = false} = {}) {
  const span = days * SPEED_WINDOW, start = end - span;
  const lines = series.filter(({key}) => ping ? key === "ping" : key !== "ping").map(({key, id}) => ({
    key,
    points: (history[id] || []).map(recordedSpeed).filter(([time]) => Number.isFinite(time)),
  }));
  const values = lines.flatMap(({points}) => points.map(([,value]) => value).filter((v) => v !== null));
  if (!values.length) return '<span class="speed-empty">No recorded history</span>';
  const maximum = Math.max(1, ...values);
  function marks(points) {
    let path = "", dot = "", previous = null, area = "", segment = "", firstX, lastX;
    const closeArea = () => segment ? segment + `L${lastX},24 H${firstX} Z ` : "";
    for (const [time, value] of points) {
      if (value === null) { area += closeArea(); segment = ""; previous = null; continue; }
      const x = (2 + 92 * Math.max(0, Math.min(1, (time - start) / span))).toFixed(1);
      const y = (22 - 19 * value / maximum).toFixed(1);
      const step = previous === null ? `M${x},${y} ` :
        style === "wave" ? `C${(+lastX + +x)/2},${previous} ${(+lastX + +x)/2},${y} ${x},${y} ` : `H${x} V${y} `;
      dot = `<circle cx="${x}" cy="${y}" r="1.6"/>`;
      if (previous === null) firstX = x;
      path += step; segment += step; lastX = x; previous = y;
    }
    return `${style === "wave" ? `<path class="wave-fill" d="${area + closeArea()}"/>` : ""}<path d="${path}"/>${dot}`;
  }
  return `<svg class="speed-chart" viewBox="0 0 96 24" preserveAspectRatio="none" role="img" aria-label="Recorded ${ping ? "ping" : "download and upload speeds"} · ${SPEED_RANGES[days]}">
    <path class="speed-grid" d="M2 12h92 M2 22h92 M25 2v20 M48 2v20 M71 2v20"/>
    ${lines.map(({key,points}) => `<g class="${key}">${marks(points)}</g>`).join("")}
  </svg>`;
}

const THEMES = {
  steel: ["Brushed Steel", "The original industrial console", "#292c30", "#737a85", "#ad9aff"],
  relay: ["Amber Relay", "Vintage instruments, amber displays", "#24291f", "#c5bda0", "#ffbd5d"],
  neon: ["Neon Grid", "Cyan wireframes and magenta accents", "#070d20", "#28deef", "#fd86e6"],
  abyss: ["Midnight Drift", "Soft blue glow and rounded panels", "#0b1022", "#626bd2", "#77f1ff"],
  tide: ["Aqua Current", "Layered teal and luminous glass", "#0b384b", "#47cddf", "#7dffde"],
  trek: ["Star Trek", "Amber controls and lilac panel rails", "#080706", "#b3a4ed", "#ffcc66"],
  appearance: ["Follow Appearance", "Use your shared palette, font and text size", "#26382d", "#a6c48a", "#f2f5eb"],
};
const THEME_KEY = "outage-watch.theme";
const MOBILE_LAYOUT_KEY = "outage-watch.mobile-layout";
const SERVER_INFO_KEY = "outage-watch.server-info";
const SERVER_SENSORS = [
  ["cpu", "CPU", "sensor.system_monitor_processor_use", "%"],
  ["memory", "Memory", "sensor.system_monitor_memory_usage", "%"],
  ["disk", "Disk used", "sensor.system_monitor_disk_usage", "%"],
  ["disk_free", "Disk free", "sensor.system_monitor_disk_free", ""],
  ["temperature", "CPU temperature", "sensor.system_monitor_processor_temperature", ""],
];
const serviceCategory = (service) => service.category || "Custom";
const validTheme = (value) => Object.hasOwn(THEMES, value);

const DASHBOARD_LANGUAGES = {en:"English",fr:"Français",nl:"Nederlands",de:"Deutsch",es:"Español",fil:"Filipino (Tagalog)",sv:"Svenska",it:"Italiano",pl:"Polski",da:"Dansk",nb:"Norsk bokmål"};
const LANGUAGE_KEY = "outage-watch.language";
const LANGUAGE_CODES = Object.keys(DASHBOARD_LANGUAGES).slice(1);
const UI_TRANSLATIONS = Object.freeze({
  "Filter tracked services": ["Filtrer les services suivis", "Gevolgde diensten filteren", "Überwachte Dienste filtern", "Filtrar servicios supervisados", "Salain ang mga sinusubaybayang serbisyo", "Filtrera övervakade tjänster", "Filtra servizi monitorati", "Filtruj monitorowane usługi", "Filtrer overvågede tjenester", "Filtrer overvåkede tjenester"],
  "Filter tracked services by category": ["Filtrer les services par catégorie", "Diensten filteren op categorie", "Dienste nach Kategorie filtern", "Filtrar servicios por categoría", "Salain ang mga serbisyo ayon sa kategorya", "Filtrera tjänster efter kategori", "Filtra servizi per categoria", "Filtruj usługi według kategorii", "Filtrer tjenester efter kategori", "Filtrer tjenester etter kategori"],
  "Home Assistant server info": ["Informations sur le serveur Home Assistant", "Home Assistant-serverinformatie", "Home Assistant-Serverinformationen", "Información del servidor de Home Assistant", "Impormasyon ng server ng Home Assistant", "Serverinfo för Home Assistant", "Informazioni sul server Home Assistant", "Informacje o serwerze Home Assistant", "Serverinfo for Home Assistant", "Serverinfo for Home Assistant"],
  "Open full-size Star Trek badge": ["Ouvrir l’insigne Star Trek en grand", "Star Trek-embleem op ware grootte openen", "Star-Trek-Abzeichen in voller Größe öffnen", "Abrir insignia de Star Trek a tamaño completo", "Buksan ang buong laki ng sagisag ng Star Trek", "Öppna Star Trek-märket i full storlek", "Apri lo stemma Star Trek a grandezza intera", "Otwórz odznakę Star Trek w pełnym rozmiarze", "Åbn Star Trek-mærket i fuld størrelse", "Åpne Star Trek-merket i full størrelse"],
  "Service category": ["Catégorie de service", "Dienstcategorie", "Dienstkategorie", "Categoría del servicio", "Kategorya ng serbisyo", "Tjänstekategori", "Categoria del servizio", "Kategoria usługi", "Tjenestekategori", "Tjenestekategori"],
  "Public HTTP URL": ["URL HTTP publique", "Openbare HTTP-URL", "Öffentliche HTTP-URL", "URL HTTP pública", "Pampublikong HTTP URL", "Offentlig HTTP-adress", "URL HTTP pubblico", "Publiczny adres HTTP", "Offentlig HTTP-adresse", "Offentlig HTTP-adresse"],
  "Response time over 24 hours": ["Temps de réponse sur 24 heures", "Responstijd over 24 uur", "Antwortzeit über 24 Stunden", "Tiempo de respuesta en 24 horas", "Oras ng tugon sa loob ng 24 oras", "Svarstid under 24 timmar", "Tempo di risposta nelle 24 ore", "Czas odpowiedzi w ciągu 24 godzin", "Svartid over 24 timer", "Svartid over 24 timer"],
  "Recorded ping": ["Latence enregistrée", "Gemeten ping", "Erfasster Ping", "Latencia registrada", "Naitalang ping", "Registrerad ping", "Ping registrato", "Zapisany ping", "Registreret ping", "Registrert ping"],
  "Recorded download and upload speeds": ["Débits montant et descendant enregistrés", "Gemeten download- en uploadsnelheden", "Erfasste Download- und Uploadgeschwindigkeit", "Velocidades de descarga y subida registradas", "Naitalang bilis ng download at upload", "Registrerade ned- och uppladdningshastigheter", "Velocità di download e upload registrate", "Zapisane prędkości pobierania i wysyłania", "Registrerede download- og uploadhastigheder", "Registrerte nedlastings- og opplastingshastigheter"],

  "No response time history yet": ["Aucun temps de réponse enregistré", "Nog geen responstijden vastgelegd", "Noch keine Antwortzeiten erfasst", "Aún no hay tiempos de respuesta", "Wala pang naitalang oras ng tugon", "Inga svarstider registrerade ännu", "Nessun tempo di risposta registrato", "Brak zapisanych czasów odpowiedzi", "Ingen svartider registreret endnu", "Ingen registrerte svartider ennå"],
  "Loading recorded readings…": ["Chargement des mesures…", "Metingen laden…", "Messwerte werden geladen…", "Cargando mediciones…", "Nilo-load ang mga sukat…", "Läser in mätvärden…", "Caricamento misurazioni…", "Wczytywanie pomiarów…", "Indlæser målinger…", "Laster inn målinger…"],
  "Speedtest history could not be loaded.": ["Impossible de charger l’historique des débits.", "De testgeschiedenis kon niet worden geladen.", "Der Testverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de velocidad.", "Hindi ma-load ang kasaysayan ng speed test.", "Testhistoriken kunde inte läsas in.", "Impossibile caricare la cronologia dei test.", "Nie udało się wczytać historii testów.", "Testhistorikken kunne ikke indlæses.", "Kunne ikke laste inn testhistorikken."],
  "No recorded Speedtest readings for this period.": ["Aucune mesure de débit pour cette période.", "Geen snelheidsmetingen voor deze periode.", "Keine Geschwindigkeitsmessungen für diesen Zeitraum.", "No hay mediciones de velocidad para este período.", "Walang naitalang speed test sa panahong ito.", "Inga hastighetsmätningar under perioden.", "Nessuna misurazione di velocità per questo periodo.", "Brak pomiarów prędkości w tym okresie.", "Ingen hastighedsmålinger i perioden.", "Ingen hastighetsmålinger i perioden."],
  "Loading history": ["Chargement de l’historique", "Geschiedenis laden", "Verlauf wird geladen", "Cargando historial", "Nilo-load ang kasaysayan", "Läser in historik", "Caricamento cronologia", "Wczytywanie historii", "Indlæser historik", "Laster historikk"],
  "Running Speedtest…": ["Test de débit en cours…", "Snelheidstest loopt…", "Speedtest läuft…", "Prueba de velocidad en curso…", "Isinasagawa ang speed test…", "Hastighetstest pågår…", "Test di velocità in corso…", "Trwa test prędkości…", "Hastighedstest i gang…", "Hastighetstest pågår…"],
  "Speedtest updated": ["Mesures de débit actualisées", "Snelheidsmeting bijgewerkt", "Speedtest aktualisiert", "Prueba de velocidad actualizada", "Na-update ang speed test", "Hastighetstest uppdaterat", "Test di velocità aggiornato", "Zaktualizowano test prędkości", "Hastighedstest opdateret", "Hastighetstest oppdatert"],
  "No new Speedtest reading": ["Aucune nouvelle mesure de débit", "Geen nieuwe snelheidsmeting", "Kein neuer Speedtest-Messwert", "Sin nuevas mediciones de velocidad", "Walang bagong resulta ng speed test", "Ingen ny hastighetsmätning", "Nessuna nuova misurazione", "Brak nowego pomiaru prędkości", "Ingen ny hastighedsmåling", "Ingen ny hastighetsmåling"],
  "Speedtest could not run": ["Impossible de lancer le test de débit", "Snelheidstest kon niet worden uitgevoerd", "Speedtest konnte nicht ausgeführt werden", "No se pudo ejecutar la prueba", "Hindi maisagawa ang speed test", "Hastighetstestet kunde inte köras", "Impossibile eseguire il test", "Nie udało się uruchomić testu", "Hastighedstesten kunne ikke køres", "Kunne ikke kjøre hastighetstesten"],
  "Could not load Outage Map.": ["Impossible de charger Outage Map.", "Outage Map kon niet worden geladen.", "Outage Map konnte nicht geladen werden.", "No se pudo cargar Outage Map.", "Hindi ma-load ang Outage Map.", "Outage Map kunde inte läsas in.", "Impossibile caricare Outage Map.", "Nie udało się wczytać Outage Map.", "Outage Map kunne ikke indlæses.", "Kunne ikke laste inn Outage Map."],
  "Could not save the change.": ["Impossible d’enregistrer la modification.", "De wijziging kon niet worden opgeslagen.", "Die Änderung konnte nicht gespeichert werden.", "No se pudo guardar el cambio.", "Hindi ma-save ang pagbabago.", "Ändringen kunde inte sparas.", "Impossibile salvare la modifica.", "Nie udało się zapisać zmiany.", "Ændringen kunne ikke gemmes.", "Kunne ikke lagre endringen."],
  "Enable Speedtest? Home Assistant starts a test and normally runs one every hour.": ["Activer le test de débit ? Home Assistant lance un test maintenant, puis normalement toutes les heures.", "Snelheidstest inschakelen? Home Assistant start nu een test en test normaal elk uur.", "Speedtest aktivieren? Home Assistant startet jetzt einen Test und führt normalerweise stündlich einen aus.", "¿Activar la prueba de velocidad? Home Assistant inicia una prueba y normalmente la repite cada hora.", "Paganahin ang speed test? Magsisimula ng test ang Home Assistant at karaniwang uulitin ito bawat oras.", "Aktivera hastighetstest? Home Assistant startar ett test och kör normalt ett varje timme.", "Attivare il test di velocità? Home Assistant avvia un test e di norma lo ripete ogni ora.", "Włączyć test prędkości? Home Assistant uruchomi test teraz i zwykle będzie go powtarzać co godzinę.", "Aktivér hastighedstest? Home Assistant starter en test og gentager den normalt hver time.", "Aktivere hastighetstest? Home Assistant starter en test og kjører vanligvis en hver time."],
  "Enabling…": ["Activation…", "Inschakelen…", "Wird aktiviert…", "Activando…", "Pinapagana…", "Aktiverar…", "Attivazione…", "Włączanie…", "Aktiverer…", "Aktiverer…"],
  "Use this phone for Outage Map alerts. Notifications will turn on for this service.": ["Utiliser ce téléphone pour les alertes Outage Map. Les notifications seront activées pour ce service.", "Gebruik deze telefoon voor Outage Map-meldingen. Meldingen worden ingeschakeld voor deze dienst.", "Dieses Telefon für Outage Map verwenden. Benachrichtigungen werden für diesen Dienst aktiviert.", "Usa este teléfono para las alertas de Outage Map. Se activarán las notificaciones para este servicio.", "Gamitin ang teleponong ito para sa mga alerto ng Outage Map. Bubuksan ang mga abiso para sa serbisyong ito.", "Använd telefonen för larm från Outage Map. Aviseringar aktiveras för den här tjänsten.", "Usa questo telefono per gli avvisi di Outage Map. Le notifiche verranno attivate per questo servizio.", "Użyj tego telefonu do alertów Outage Map. Powiadomienia zostaną włączone dla tej usługi.", "Brug telefonen til alarmer fra Outage Map. Notifikationer aktiveres for denne tjeneste.", "Bruk telefonen til varsler fra Outage Map. Varsler slås på for denne tjenesten."],
  "No phones registered for notifications. Connect the Home Assistant Companion App and allow notifications, then reopen this picker.": ["Aucun téléphone inscrit. Connectez l’application Companion de Home Assistant, autorisez les notifications, puis rouvrez cette liste.", "Geen telefoons geregistreerd. Verbind de Home Assistant Companion-app, sta meldingen toe en open deze lijst opnieuw.", "Kein Telefon registriert. Verbinden Sie die Home Assistant Companion App, erlauben Sie Benachrichtigungen und öffnen Sie die Auswahl erneut.", "No hay teléfonos registrados. Conecta la app Companion de Home Assistant, permite las notificaciones y vuelve a abrir esta lista.", "Walang nakarehistrong telepono. Ikonekta ang Home Assistant Companion App, payagan ang mga abiso at buksan muli ang listahan.", "Inga telefoner registrerade. Anslut Home Assistant Companion-appen, tillåt aviseringar och öppna listan igen.", "Nessun telefono registrato. Collega l’app Companion di Home Assistant, consenti le notifiche e riapri questo elenco.", "Brak zarejestrowanych telefonów. Połącz aplikację Home Assistant Companion, zezwól na powiadomienia i ponownie otwórz listę.", "Ingen telefoner registreret. Tilslut Home Assistant Companion-appen, tillad notifikationer, og åbn listen igen.", "Ingen telefoner registrert. Koble til Home Assistant Companion-appen, tillat varsler og åpne listen igjen."],
  "Shows recorded sensor changes. Longer ranges can be incomplete if Home Assistant has purged older history.": ["Affiche les changements enregistrés par les capteurs. Les périodes longues peuvent être incomplètes si Home Assistant a supprimé les anciennes données.", "Toont vastgelegde sensorwijzigingen. Langere perioden kunnen onvolledig zijn als Home Assistant oudere gegevens heeft verwijderd.", "Zeigt aufgezeichnete Sensoränderungen. Längere Zeiträume können Lücken enthalten, wenn Home Assistant ältere Daten gelöscht hat.", "Muestra los cambios registrados por los sensores. Los períodos largos pueden estar incompletos si Home Assistant eliminó datos antiguos.", "Ipinapakita ang naitalang pagbabago ng mga sensor. Maaaring kulang ang datos sa mahabang panahon kung binura ng Home Assistant ang lumang kasaysayan.", "Visar registrerade sensorändringar. Längre perioder kan ha luckor om Home Assistant har rensat äldre historik.", "Mostra le variazioni registrate dai sensori. I periodi lunghi possono essere incompleti se Home Assistant ha eliminato i dati meno recenti.", "Pokazuje zapisane zmiany czujników. Dłuższe okresy mogą zawierać luki, jeśli Home Assistant usunął starsze dane.", "Viser registrerede sensorændringer. Længere perioder kan have huller, hvis Home Assistant har slettet ældre data.", "Viser registrerte sensorendringer. Lengre perioder kan ha hull hvis Home Assistant har slettet eldre data."],
  "Internet connectivity may be disrupted": ["La connexion Internet est peut-être interrompue", "De internetverbinding is mogelijk verstoord", "Die Internetverbindung ist möglicherweise gestört", "La conexión a Internet puede estar interrumpida", "Maaaring may problema sa koneksyon sa internet", "Internetanslutningen kan vara störd", "La connessione Internet potrebbe essere interrotta", "Połączenie internetowe może być zakłócone", "Internetforbindelsen kan være afbrudt", "Internettforbindelsen kan være brutt"],
  "Home Assistant couldn’t reach either connectivity check. Service alerts are paused.": ["Les deux tests de connexion ont échoué. Les alertes de service sont suspendues.", "Beide verbindingstests van Home Assistant zijn mislukt. Dienstmeldingen zijn gepauzeerd.", "Beide Verbindungstests von Home Assistant sind fehlgeschlagen. Dienstmeldungen sind pausiert.", "Fallaron las dos comprobaciones de conexión de Home Assistant. Las alertas de servicios están en pausa.", "Nabigo ang parehong pagsusuri ng koneksyon ng Home Assistant. Naka-pause ang mga alerto ng serbisyo.", "Båda anslutningskontrollerna i Home Assistant misslyckades. Tjänstelarmen är pausade.", "Entrambi i controlli di connessione di Home Assistant sono falliti. Gli avvisi dei servizi sono sospesi.", "Oba testy łączności Home Assistant nie powiodły się. Alerty usług są wstrzymane.", "Begge forbindelsestjek i Home Assistant mislykkedes. Tjenestealarmer er sat på pause.", "Begge forbindelseskontrollene i Home Assistant mislyktes. Tjenestevarsler er satt på pause."],
  "See official status for details.": ["Consultez le statut officiel pour les détails.", "Bekijk de officiële status voor details.", "Details finden Sie im offiziellen Status.", "Consulta el estado oficial para más detalles.", "Tingnan ang opisyal na katayuan para sa detalye.", "Se officiell status för detaljer.", "Consulta lo stato ufficiale per i dettagli.", "Szczegóły znajdziesz na oficjalnej stronie statusu.", "Se officiel status for detaljer.", "Se offisiell status for detaljer."],
  "No matching catalog services.": ["Aucun service correspondant.", "Geen overeenkomende diensten.", "Keine passenden Dienste gefunden.", "No hay servicios que coincidan.", "Walang katugmang serbisyo sa katalogo.", "Inga matchande tjänster.", "Nessun servizio corrispondente.", "Brak pasujących usług.", "Ingen matchende tjenester.", "Ingen samsvarende tjenester."],
  "No services tracked yet.": ["Aucun service suivi pour le moment.", "Er worden nog geen diensten gevolgd.", "Noch keine Dienste überwacht.", "Aún no se supervisa ningún servicio.", "Wala pang sinusubaybayang serbisyo.", "Inga tjänster övervakas ännu.", "Nessun servizio ancora monitorato.", "Nie są jeszcze monitorowane żadne usługi.", "Ingen tjenester overvåges endnu.", "Ingen tjenester overvåkes ennå."],
  "No services available to view.": ["Aucun service à afficher.", "Geen diensten om te bekijken.", "Keine Dienste zur Anzeige verfügbar.", "No hay servicios para mostrar.", "Walang serbisyong maipapakita.", "Inga tjänster att visa.", "Nessun servizio da visualizzare.", "Brak usług do wyświetlenia.", "Ingen tjenester at vise.", "Ingen tjenester å vise."],
  "Home Assistant could not reach this endpoint.": ["Home Assistant n’a pas pu joindre ce point de terminaison.", "Home Assistant kon dit eindpunt niet bereiken.", "Home Assistant konnte diesen Endpunkt nicht erreichen.", "Home Assistant no pudo acceder a este punto de conexión.", "Hindi maabot ng Home Assistant ang endpoint na ito.", "Home Assistant kunde inte nå slutpunkten.", "Home Assistant non ha potuto raggiungere questo endpoint.", "Home Assistant nie mógł połączyć się z tym punktem końcowym.", "Home Assistant kunne ikke nå dette endepunkt.", "Home Assistant kunne ikke nå dette endepunktet."],
  "This tile reflects checks from your network.": ["Cette tuile indique les vérifications depuis votre réseau.", "Deze tegel toont controles vanaf je netwerk.", "Diese Kachel zeigt Prüfungen aus Ihrem Netzwerk.", "Esta tarjeta muestra comprobaciones desde tu red.", "Ipinapakita rito ang mga pagsusuri mula sa iyong network.", "Rutan visar kontroller från ditt nätverk.", "Questa scheda mostra i controlli dalla tua rete.", "Ten kafelek pokazuje kontrole z Twojej sieci.", "Feltet viser kontroller fra dit netværk.", "Kortet viser kontroller fra nettverket ditt."],
  "Connectivity checks paused": ["Tests de connexion suspendus", "Verbindingscontroles gepauzeerd", "Verbindungsprüfungen pausiert", "Comprobaciones de conexión en pausa", "Naka-pause ang pagsusuri ng koneksyon", "Anslutningskontroller pausade", "Controlli di connessione sospesi", "Kontrole łączności wstrzymane", "Forbindelsestjek sat på pause", "Forbindelseskontroller satt på pause"],
  "Enter a public HTTP or HTTPS URL without credentials": ["Saisissez une URL HTTP ou HTTPS publique sans identifiants", "Voer een openbare HTTP- of HTTPS-URL zonder inloggegevens in", "Geben Sie eine öffentliche HTTP- oder HTTPS-URL ohne Zugangsdaten ein", "Introduce una URL HTTP o HTTPS pública sin credenciales", "Maglagay ng pampublikong HTTP o HTTPS URL na walang kredensyal", "Ange en offentlig HTTP- eller HTTPS-adress utan inloggningsuppgifter", "Inserisci un URL HTTP o HTTPS pubblico senza credenziali", "Podaj publiczny adres HTTP lub HTTPS bez danych logowania", "Angiv en offentlig HTTP- eller HTTPS-adresse uden loginoplysninger", "Angi en offentlig HTTP- eller HTTPS-adresse uten påloggingsinformasjon"],
  "Enter a public address": ["Saisissez une adresse publique", "Voer een openbaar adres in", "Geben Sie eine öffentliche Adresse ein", "Introduce una dirección pública", "Maglagay ng pampublikong address", "Ange en offentlig adress", "Inserisci un indirizzo pubblico", "Podaj adres publiczny", "Angiv en offentlig adresse", "Angi en offentlig adresse"],
  "Set up Outage Map first": ["Configurez d’abord Outage Map", "Stel eerst Outage Map in", "Richten Sie zuerst Outage Map ein", "Configura primero Outage Map", "I-set up muna ang Outage Map", "Konfigurera Outage Map först", "Configura prima Outage Map", "Najpierw skonfiguruj Outage Map", "Konfigurer først Outage Map", "Sett opp Outage Map først"],
  "Unknown catalog service": ["Service du catalogue inconnu", "Onbekende catalogusdienst", "Unbekannter Katalogdienst", "Servicio de catálogo desconocido", "Hindi kilalang serbisyo sa katalogo", "Okänd katalogtjänst", "Servizio di catalogo sconosciuto", "Nieznana usługa katalogowa", "Ukendt katalogtjeneste", "Ukjent katalogtjeneste"],
  "Choose a catalog service or enter a name and URL": ["Choisissez un service du catalogue ou saisissez un nom et une URL", "Kies een catalogusdienst of voer een naam en URL in", "Wählen Sie einen Katalogdienst oder geben Sie Name und URL ein", "Elige un servicio del catálogo o introduce un nombre y una URL", "Pumili sa katalogo o maglagay ng pangalan at URL", "Välj en katalogtjänst eller ange namn och URL", "Scegli un servizio dal catalogo o inserisci nome e URL", "Wybierz usługę z katalogu lub podaj nazwę i adres URL", "Vælg en katalogtjeneste, eller angiv navn og URL", "Velg en katalogtjeneste eller skriv inn navn og URL"],
  "This service is already tracked": ["Ce service est déjà suivi", "Deze dienst wordt al gevolgd", "Dieser Dienst wird bereits überwacht", "Este servicio ya se supervisa", "Sinusubaybayan na ang serbisyong ito", "Tjänsten övervakas redan", "Questo servizio è già monitorato", "Ta usługa jest już monitorowana", "Denne tjeneste overvåges allerede", "Denne tjenesten overvåkes allerede"],
  "Service is no longer tracked": ["Ce service n’est plus suivi", "Deze dienst wordt niet meer gevolgd", "Dieser Dienst wird nicht mehr überwacht", "Este servicio ya no se supervisa", "Hindi na sinusubaybayan ang serbisyo", "Tjänsten övervakas inte längre", "Il servizio non è più monitorato", "Ta usługa nie jest już monitorowana", "Tjenesten overvåges ikke længere", "Tjenesten overvåkes ikke lenger"],
  "This service only has a provider feed": ["Ce service dispose uniquement d’un flux fournisseur", "Deze dienst heeft alleen een providerfeed", "Dieser Dienst hat nur einen Anbieterfeed", "Este servicio solo tiene una fuente de estado del proveedor", "Feed lang ng provider ang mayroon ang serbisyong ito", "Tjänsten har endast ett leverantörsflöde", "Il servizio dispone solo del feed del fornitore", "Ta usługa ma tylko kanał dostawcy", "Tjenesten har kun et leverandørfeed", "Tjenesten har bare en leverandørfeed"],
  "Choose a registered mobile app notification action": ["Choisissez une action de notification d’une appli mobile inscrite", "Kies een geregistreerde meldingsactie van de mobiele app", "Wählen Sie eine registrierte Benachrichtigungsaktion der mobilen App", "Elige una acción de notificación registrada de la app móvil", "Pumili ng nakarehistrong aksiyon sa abiso ng mobile app", "Välj en registrerad aviseringsåtgärd för mobilappen", "Scegli un’azione di notifica registrata dell’app mobile", "Wybierz zarejestrowaną akcję powiadomień aplikacji mobilnej", "Vælg en registreret notifikationshandling fra mobilappen", "Velg en registrert varslingshandling fra mobilappen"],
  "The notification destination has changed. Refresh the dashboard.": ["La destination des notifications a changé. Actualisez le tableau de bord.", "De meldingsbestemming is gewijzigd. Vernieuw het dashboard.", "Das Benachrichtigungsziel hat sich geändert. Laden Sie das Dashboard neu.", "El destino de las notificaciones cambió. Actualiza el panel.", "Nagbago ang patutunguhan ng mga abiso. I-refresh ang dashboard.", "Målet för aviseringar har ändrats. Uppdatera panelen.", "La destinazione delle notifiche è cambiata. Aggiorna la dashboard.", "Cel powiadomień został zmieniony. Odśwież panel.", "Notifikationernes destination er ændret. Opdatér dashboardet.", "Varslingsmålet er endret. Oppdater dashbordet."],
  "Configure a notification action in Outage Map options first": ["Configurez d’abord une action de notification dans les options d’Outage Map", "Stel eerst een meldingsactie in bij de opties van Outage Map", "Konfigurieren Sie zuerst eine Benachrichtigungsaktion in den Outage Map-Optionen", "Configura primero una acción de notificación en las opciones de Outage Map", "Mag-set up muna ng aksiyon sa abiso sa mga opsyon ng Outage Map", "Konfigurera först en aviseringsåtgärd i alternativen för Outage Map", "Configura prima un’azione di notifica nelle opzioni di Outage Map", "Najpierw skonfiguruj akcję powiadomień w opcjach Outage Map", "Konfigurer først en notifikationshandling i Outage Maps indstillinger", "Sett først opp en varslingshandling i innstillingene for Outage Map"],
  "Home Assistant could not set up the readout provider": ["Home Assistant n’a pas pu configurer le fournisseur de mesures", "Home Assistant kon de meetprovider niet instellen", "Home Assistant konnte die Messwertquelle nicht einrichten", "Home Assistant no pudo configurar el proveedor de mediciones", "Hindi ma-set up ng Home Assistant ang tagapagbigay ng mga sukat", "Home Assistant kunde inte konfigurera mätkällan", "Home Assistant non ha potuto configurare il fornitore delle misurazioni", "Home Assistant nie mógł skonfigurować źródła pomiarów", "Home Assistant kunne ikke konfigurere målekilden", "Home Assistant kunne ikke sette opp målekilden"],
  "First recorded reading:": ["Première mesure enregistrée :", "Eerste vastgelegde meting:", "Erster erfasster Messwert:", "Primera medición registrada:", "Unang naitalang sukat:", "Första registrerade mätning:", "Prima misurazione registrata:", "Pierwszy zapisany pomiar:", "Første registrerede måling:", "Første registrerte måling:"],
  "Download and upload share a scale.": ["Les débits montant et descendant utilisent la même échelle.", "Download en upload gebruiken dezelfde schaal.", "Download und Upload verwenden dieselbe Skala.", "La descarga y la subida usan la misma escala.", "Iisa ang iskala ng download at upload.", "Ned- och uppladdning använder samma skala.", "Download e upload usano la stessa scala.", "Pobieranie i wysyłanie używają tej samej skali.", "Download og upload bruger samme skala.", "Nedlasting og opplasting bruker samme skala."],
  "Recorded time": ["Heure de mesure", "Tijdstip meting", "Messzeit", "Hora de registro", "Oras ng pagtatala", "Mättid", "Ora di registrazione", "Czas pomiaru", "Måletidspunkt", "Måletidspunkt"],
  "Most recent Speedtest readings": ["Dernières mesures de débit", "Laatste snelheidsmetingen", "Neueste Speedtest-Messwerte", "Últimas mediciones de velocidad", "Pinakabagong mga sukat ng speed test", "Senaste hastighetsmätningar", "Ultime misurazioni di velocità", "Ostatnie pomiary prędkości", "Seneste hastighedsmålinger", "Siste hastighetsmålinger"],
  "Page {page} of {total}": ["Page {page} sur {total}", "Pagina {page} van {total}", "Seite {page} von {total}", "Página {page} de {total}", "Pahina {page} ng {total}", "Sida {page} av {total}", "Pagina {page} di {total}", "Strona {page} z {total}", "Side {page} af {total}", "Side {page} av {total}"],
  "{service} is reporting an incident": ["{service} signale un incident", "{service} meldt een incident", "{service} meldet einen Vorfall", "{service} informa de un incidente", "May iniulat na insidente ang {service}", "{service} rapporterar en incident", "{service} segnala un incidente", "{service} zgłasza incydent", "{service} melder om en hændelse", "{service} melder om en hendelse"],
  "The original industrial console": ["La console industrielle d’origine", "De oorspronkelijke industriële console", "Die ursprüngliche Industriekonsole", "La consola industrial original", "Ang orihinal na konsolang industriyal", "Den ursprungliga industrikonsolen", "La console industriale originale", "Oryginalna konsola przemysłowa", "Den oprindelige industrikonsol", "Den opprinnelige industrikonsollen"],
  "Vintage instruments, amber displays": ["Instruments rétro et écrans ambrés", "Retro-instrumenten en amberkleurige schermen", "Retro-Instrumente und bernsteinfarbene Anzeigen", "Instrumentos retro y pantallas ámbar", "Mga klasikong instrumento at kulay-ambar na display", "Retroinstrument och bärnstensfärgade skärmar", "Strumenti rétro e schermi ambrati", "Przyrządy retro i bursztynowe wyświetlacze", "Retroinstrumenter og ravfarvede skærme", "Retroinstrumenter og ravfargede skjermer"],
  "Cyan wireframes and magenta accents": ["Contours cyan et touches magenta", "Cyaan lijnen en magenta accenten", "Cyanfarbene Konturen und magentafarbene Akzente", "Contornos cian y detalles magenta", "Mga linyang cyan at detalyeng magenta", "Cyanfärgade konturer och magentadetaljer", "Contorni ciano e dettagli magenta", "Cyjanowe kontury i purpurowe akcenty", "Cyanfarvede konturer og magentadetaljer", "Cyanfargede konturer og magentadetaljer"],
  "Soft blue glow and rounded panels": ["Halo bleu doux et panneaux arrondis", "Zachte blauwe gloed en afgeronde panelen", "Sanftes blaues Leuchten und abgerundete Flächen", "Brillo azul suave y paneles redondeados", "Banayad na asul na ningning at mga panel na bilugan ang gilid", "Mjukt blått sken och rundade paneler", "Luce blu tenue e pannelli arrotondati", "Delikatna niebieska poświata i zaokrąglone panele", "Blødt blåt skær og afrundede paneler", "Mykt blått lys og avrundede paneler"],
  "Layered teal and luminous glass": ["Nuances de bleu-vert et verre lumineux", "Gelaagd blauwgroen en lichtgevend glas", "Blaugrüne Ebenen und leuchtendes Glas", "Capas de verde azulado y cristal luminoso", "Mga patong na bughaw-berde at kumikinang na salamin", "Blågröna lager och lysande glas", "Strati verde petrolio e vetro luminoso", "Turkusowe warstwy i świetliste szkło", "Blågrønne lag og lysende glas", "Blågrønne lag og lysende glass"],
  "Amber controls and lilac panel rails": ["Commandes ambrées et bordures lilas", "Amberkleurige knoppen en lila paneelranden", "Bernsteinfarbene Bedienelemente und lilafarbene Rahmen", "Controles ámbar y bordes lilas", "Mga kontrol na kulay-ambar at lilang gilid ng panel", "Bärnstensfärgade reglage och lila panelkanter", "Comandi ambra e bordi lilla", "Bursztynowe przyciski i liliowe ramki", "Ravfarvede knapper og lilla panelkanter", "Ravfargede kontroller og lilla panelkanter"],
  "Use your shared palette, font and text size": ["Utiliser votre palette, votre police et votre taille de texte partagées", "Gebruik je gedeelde kleuren, lettertype en tekstgrootte", "Gemeinsame Farbpalette, Schriftart und Textgröße verwenden", "Usa la paleta, la fuente y el tamaño de texto compartidos", "Gamitin ang nakabahaging mga kulay, font at laki ng teksto", "Använd din gemensamma palett, ditt typsnitt och din textstorlek", "Usa la palette, il carattere e la dimensione del testo condivisi", "Użyj wspólnej palety, czcionki i rozmiaru tekstu", "Brug din fælles palet, skrifttype og tekststørrelse", "Bruk felles palett, skrifttype og tekststørrelse"],
  "Close settings": ["Fermer les réglages", "Instellingen sluiten", "Einstellungen schließen", "Cerrar ajustes", "Isara ang mga setting", "Stäng inställningar", "Chiudi impostazioni", "Zamknij ustawienia", "Luk indstillinger", "Lukk innstillinger"],
  "Close details": ["Fermer les détails", "Details sluiten", "Details schließen", "Cerrar detalles", "Isara ang mga detalye", "Stäng detaljer", "Chiudi dettagli", "Zamknij szczegóły", "Luk detaljer", "Lukk detaljer"],
  "Open Speedtest history": ["Ouvrir l’historique des débits", "Testgeschiedenis openen", "Speedtest-Verlauf öffnen", "Abrir historial de velocidad", "Buksan ang kasaysayan ng speed test", "Öppna testhistoriken", "Apri cronologia test", "Otwórz historię testów", "Åbn testhistorik", "Åpne testhistorikk"],
  "Close Speedtest history": ["Fermer l’historique des débits", "Testgeschiedenis sluiten", "Speedtest-Verlauf schließen", "Cerrar historial de velocidad", "Isara ang kasaysayan ng speed test", "Stäng testhistoriken", "Chiudi cronologia test", "Zamknij historię testów", "Luk testhistorik", "Lukk testhistorikk"],
  "History period": ["Période de l’historique", "Geschiedenisperiode", "Verlaufszeitraum", "Período del historial", "Panahon ng kasaysayan", "Historikperiod", "Periodo cronologia", "Okres historii", "Historikperiode", "Historikkperiode"],
  "scale": ["échelle", "schaal", "Skala", "escala", "iskala", "skala", "scala", "skala", "skala", "skala"],

  "Language": ["Langue", "Taal", "Sprache", "Idioma", "Wika", "Språk", "Lingua", "Język", "Sprog", "Språk"],
  "Settings": ["Réglages", "Instellingen", "Einstellungen", "Ajustes", "Mga setting", "Inställningar", "Impostazioni", "Ustawienia", "Indstillinger", "Innstillinger"],
  "Dashboard settings": ["Réglages du tableau de bord", "Dashboardinstellingen", "Dashboard-Einstellungen", "Ajustes del panel", "Mga setting ng dashboard", "Panelinställningar", "Impostazioni della dashboard", "Ustawienia panelu", "Dashboardindstillinger", "Innstillinger for dashbord"],
  "+ Add service": ["+ Ajouter un service", "+ Dienst toevoegen", "+ Dienst hinzufügen", "+ Añadir servicio", "+ Magdagdag ng serbisyo", "+ Lägg till tjänst", "+ Aggiungi servizio", "+ Dodaj usługę", "+ Tilføj tjeneste", "+ Legg til tjeneste"],
  "Services": ["Services", "Diensten", "Dienste", "Servicios", "Mga serbisyo", "Tjänster", "Servizi", "Usługi", "Tjenester", "Tjenester"],
  "Outages": ["Pannes", "Storingen", "Ausfälle", "Interrupciones", "Mga pagkaantala", "Avbrott", "Interruzioni", "Awarie", "Nedbrud", "Avbrudd"],
  "Possible problems": ["Problèmes possibles", "Mogelijke problemen", "Mögliche Probleme", "Posibles problemas", "Posibleng problema", "Möjliga problem", "Possibili problemi", "Możliwe problemy", "Mulige problemer", "Mulige problemer"],
  "Healthy": ["Disponibles", "In orde", "In Ordnung", "En buen estado", "Maayos", "Fungerar", "Funzionanti", "Sprawne", "Velfungerende", "Fungerer"],
  "Unknown": ["Inconnu", "Onbekend", "Unbekannt", "Desconocido", "Hindi alam", "Okänd", "Sconosciuto", "Nieznany", "Ukendt", "Ukjent"],
  "Your services, at a glance.": ["Vos services en un coup d’œil.", "Je diensten in één oogopslag.", "Ihre Dienste auf einen Blick.", "Tus servicios de un vistazo.", "Isang tingin sa iyong mga serbisyo.", "Dina tjänster i korthet.", "I tuoi servizi a colpo d’occhio.", "Twoje usługi w skrócie.", "Dine tjenester på et øjeblik.", "Dine tjenester på et øyeblikk."],
  "Home internet connected": ["Internet à domicile connecté", "Thuisinternet verbonden", "Internet zu Hause verbunden", "Internet doméstico conectado", "May internet sa bahay", "Internet hemma anslutet", "Internet di casa connesso", "Internet domowy połączony", "Hjemmenet tilsluttet", "Hjemmenett tilkoblet"],
  "Run test": ["Tester", "Test starten", "Test starten", "Probar", "Subukan", "Kör test", "Avvia test", "Uruchom test", "Kør test", "Kjør test"],
  "All categories": ["Toutes les catégories", "Alle categorieën", "Alle Kategorien", "Todas las categorías", "Lahat ng kategorya", "Alla kategorier", "Tutte le categorie", "Wszystkie kategorie", "Alle kategorier", "Alle kategorier"],
  "All": ["Tout", "Alles", "Alle", "Todo", "Lahat", "Alla", "Tutti", "Wszystkie", "Alle", "Alle"],
  "Mobile layout": ["Disposition mobile", "Mobiele indeling", "Mobilansicht", "Diseño móvil", "Ayos sa mobile", "Mobillayout", "Layout mobile", "Układ mobilny", "Mobillayout", "Mobiloppsett"],
  "One column": ["Une colonne", "Eén kolom", "Eine Spalte", "Una columna", "Isang hanay", "En kolumn", "Una colonna", "Jedna kolumna", "Én kolonne", "Én kolonne"],
  "Two columns": ["Deux colonnes", "Twee kolommen", "Zwei Spalten", "Dos columnas", "Dalawang hanay", "Två kolumner", "Due colonne", "Dwie kolumny", "To kolonner", "To kolonner"],
  "Speedtest style": ["Style du test de débit", "Snelheidsteststijl", "Stil des Speedtests", "Estilo de prueba de velocidad", "Estilo ng speed test", "Hastighetstestets stil", "Stile del test di velocità", "Styl testu prędkości", "Hastighedstestens stil", "Stil for hastighetstest"],
  "Server info": ["Infos serveur", "Serverinfo", "Serverinfo", "Datos del servidor", "Impormasyon ng server", "Serverinfo", "Info server", "Informacje o serwerze", "Serverinfo", "Serverinfo"],
  "Show server info": ["Afficher les infos serveur", "Serverinfo tonen", "Serverinfo anzeigen", "Mostrar datos del servidor", "Ipakita ang impormasyon ng server", "Visa serverinfo", "Mostra info server", "Pokaż informacje o serwerze", "Vis serverinfo", "Vis serverinfo"],
  "Hide server info": ["Masquer les infos serveur", "Serverinfo verbergen", "Serverinfo ausblenden", "Ocultar datos del servidor", "Itago ang impormasyon ng server", "Dölj serverinfo", "Nascondi info server", "Ukryj informacje o serwerze", "Skjul serverinfo", "Skjul serverinfo"],
  "Memory": ["Mémoire", "Geheugen", "Speicher", "Memoria", "Memorya", "Minne", "Memoria", "Pamięć", "Hukommelse", "Minne"],
  "Disk used": ["Disque utilisé", "Schijfgebruik", "Belegter Speicher", "Disco usado", "Nagamit na disk", "Använt diskutrymme", "Disco usato", "Zajęte miejsce", "Brugt diskplads", "Brukt diskplass"],
  "Disk free": ["Disque libre", "Vrije schijfruimte", "Freier Speicher", "Disco libre", "Libreng espasyo", "Ledigt diskutrymme", "Disco libero", "Wolne miejsce", "Ledig diskplads", "Ledig diskplass"],
  "CPU temperature": ["Température CPU", "CPU-temperatuur", "CPU-Temperatur", "Temperatura de CPU", "Temperatura ng CPU", "CPU-temperatur", "Temperatura CPU", "Temperatura CPU", "CPU-temperatur", "CPU-temperatur"],
  "Host uptime": ["Disponibilité de l’hôte", "Host-uptime", "Host-Laufzeit", "Tiempo de actividad", "Tagal ng paggana", "Drifttid", "Tempo di attività", "Czas pracy", "Oppetid", "Oppetid"],
  "Operational": ["Opérationnel", "Operationeel", "Betriebsbereit", "Operativo", "Gumagana", "I drift", "Operativo", "Działa", "I drift", "I drift"],
  "Reachable": ["Accessible", "Bereikbaar", "Erreichbar", "Accesible", "Naaabot", "Nåbar", "Raggiungibile", "Osiągalna", "Tilgængelig", "Tilgjengelig"],
  "Unreachable": ["Inaccessible", "Onbereikbaar", "Nicht erreichbar", "Inaccesible", "Hindi maabot", "Kan inte nås", "Irraggiungibile", "Nieosiągalna", "Utilgængelig", "Utilgjengelig"],
  "Provider outage": ["Panne du fournisseur", "Providerstoring", "Anbieterausfall", "Fallo del proveedor", "Abala sa provider", "Leverantörsavbrott", "Guasto del fornitore", "Awaria dostawcy", "Leverandørnedbrud", "Leverandøravbrudd"],
  "Slow response": ["Réponse lente", "Trage reactie", "Langsame Antwort", "Respuesta lenta", "Mabagal na tugon", "Långsamt svar", "Risposta lenta", "Powolna odpowiedź", "Langsomt svar", "Treg respons"],
  "Feed only": ["Flux seul", "Alleen statusfeed", "Nur Statusfeed", "Solo fuente de estado", "Feed lang", "Endast statusflöde", "Solo feed", "Tylko kanał statusu", "Kun statusfeed", "Kun statusfeed"],
  "Checks only": ["Vérifications seules", "Alleen controles", "Nur Prüfungen", "Solo comprobaciones", "Mga pagsusuri lang", "Endast kontroller", "Solo controlli", "Tylko kontrole", "Kun kontroller", "Kun kontroller"],
  "Feed + checks": ["Flux + vérifications", "Feed + controles", "Feed + Prüfungen", "Fuente + comprobaciones", "Feed + pagsusuri", "Flöde + kontroller", "Feed + controlli", "Kanał + kontrole", "Feed + kontroller", "Feed + kontroller"],
  "Provider feed only": ["Flux du fournisseur uniquement", "Alleen providerfeed", "Nur Anbieterfeed", "Solo fuente del proveedor", "Feed lang ng provider", "Endast leverantörens flöde", "Solo feed del fornitore", "Tylko kanał dostawcy", "Kun leverandørfeed", "Kun leverandørfeed"],
  "Feed refreshed": ["Flux actualisé", "Feed bijgewerkt", "Feed aktualisiert", "Fuente actualizada", "Na-update ang feed", "Flödet uppdaterat", "Feed aggiornato", "Kanał odświeżony", "Feed opdateret", "Feed oppdatert"],
  "Checked": ["Vérifié", "Gecontroleerd", "Geprüft", "Comprobado", "Sinuri", "Kontrollerad", "Verificato", "Sprawdzono", "Kontrolleret", "Kontrollert"],
  "Affected components": ["Composants touchés", "Getroffen onderdelen", "Betroffene Komponenten", "Componentes afectados", "Mga apektadong bahagi", "Berörda komponenter", "Componenti interessati", "Dotknięte składniki", "Berørte komponenter", "Berørte komponenter"],
  "Official status": ["Statut officiel", "Officiële status", "Offizieller Status", "Estado oficial", "Opisyal na katayuan", "Officiell status", "Stato ufficiale", "Oficjalny status", "Officiel status", "Offisiell status"],
  "Notifications off": ["Notifications désactivées", "Meldingen uit", "Benachrichtigungen aus", "Notificaciones desactivadas", "Naka-off ang mga abiso", "Aviseringar av", "Notifiche disattivate", "Powiadomienia wyłączone", "Notifikationer fra", "Varsler av"],
  "Notifications on": ["Notifications activées", "Meldingen aan", "Benachrichtigungen an", "Notificaciones activadas", "Naka-on ang mga abiso", "Aviseringar på", "Notifiche attivate", "Powiadomienia włączone", "Notifikationer til", "Varsler på"],
  "Pause Tracking": ["Suspendre le suivi", "Controles pauzeren", "Überwachung pausieren", "Pausar seguimiento", "I-pause ang pagsubaybay", "Pausa övervakning", "Sospendi monitoraggio", "Wstrzymaj monitorowanie", "Sæt overvågning på pause", "Sett overvåking på pause"],
  "Resume Tracking": ["Reprendre le suivi", "Controles hervatten", "Überwachung fortsetzen", "Reanudar seguimiento", "Ipagpatuloy ang pagsubaybay", "Återuppta övervakning", "Riprendi monitoraggio", "Wznów monitorowanie", "Genoptag overvågning", "Gjenoppta overvåking"],
  "Remove service": ["Supprimer le service", "Dienst verwijderen", "Dienst entfernen", "Eliminar servicio", "Alisin ang serbisyo", "Ta bort tjänst", "Rimuovi servizio", "Usuń usługę", "Fjern tjeneste", "Fjern tjeneste"],
  "Confirm removal": ["Confirmer la suppression", "Verwijderen bevestigen", "Entfernen bestätigen", "Confirmar eliminación", "Kumpirmahin ang pag-alis", "Bekräfta borttagning", "Conferma rimozione", "Potwierdź usunięcie", "Bekræft fjernelse", "Bekreft fjerning"],
  "Cancel": ["Annuler", "Annuleren", "Abbrechen", "Cancelar", "Kanselahin", "Avbryt", "Annulla", "Anuluj", "Annuller", "Avbryt"],
  "Close": ["Fermer", "Sluiten", "Schließen", "Cerrar", "Isara", "Stäng", "Chiudi", "Zamknij", "Luk", "Lukk"],
  "Track a service": ["Suivre un service", "Dienst volgen", "Dienst überwachen", "Supervisar un servicio", "Subaybayan ang serbisyo", "Övervaka en tjänst", "Monitora un servizio", "Monitoruj usługę", "Overvåg en tjeneste", "Overvåk en tjeneste"],
  "Search catalog": ["Rechercher dans le catalogue", "Catalogus doorzoeken", "Katalog durchsuchen", "Buscar en el catálogo", "Maghanap sa katalogo", "Sök i katalogen", "Cerca nel catalogo", "Przeszukaj katalog", "Søg i kataloget", "Søk i katalogen"],
  "Service name": ["Nom du service", "Dienstnaam", "Dienstname", "Nombre del servicio", "Pangalan ng serbisyo", "Tjänstens namn", "Nome del servizio", "Nazwa usługi", "Tjenestens navn", "Tjenestenavn"],
  "Track URL": ["Suivre l’URL", "URL volgen", "URL überwachen", "Supervisar URL", "Subaybayan ang URL", "Övervaka URL", "Monitora URL", "Monitoruj URL", "Overvåg URL", "Overvåk URL"],
  "Smart home": ["Maison connectée", "Slim huis", "Smart Home", "Hogar inteligente", "Smart home", "Smarta hem", "Casa intelligente", "Inteligentny dom", "Smart hjem", "Smarthus"],
  "Online services": ["Services en ligne", "Onlinediensten", "Onlinedienste", "Servicios en línea", "Mga serbisyong online", "Onlinetjänster", "Servizi online", "Usługi online", "Onlinetjenester", "Nettjenester"],
  "Weather": ["Météo", "Weer", "Wetter", "Tiempo", "Panahon", "Väder", "Meteo", "Pogoda", "Vejr", "Vær"],
  "Custom": ["Personnalisé", "Aangepast", "Benutzerdefiniert", "Personalizado", "Pasadya", "Anpassad", "Personalizzato", "Własne", "Brugerdefineret", "Egendefinert"],
  "Speedtest history": ["Historique des débits", "Snelheidstestgeschiedenis", "Speedtest-Verlauf", "Historial de velocidad", "Kasaysayan ng speed test", "Testhistorik", "Cronologia test", "Historia testów", "Testhistorik", "Testhistorikk"],
  "Response time \u00b7 24 hours": ["Temps de réponse · 24 heures", "Reactietijd · 24 uur", "Antwortzeit · 24 Stunden", "Respuesta · 24 horas", "Oras ng tugon · 24 oras", "Svarstid · 24 timmar", "Tempo di risposta · 24 ore", "Czas odpowiedzi · 24 godziny", "Svartid · 24 timer", "Svartid · 24 timer"],
  "Last successful feed update": ["Dernière actualisation réussie", "Laatste geslaagde feedupdate", "Letztes erfolgreiches Feedupdate", "Última actualización correcta", "Huling matagumpay na update", "Senaste lyckade uppdatering", "Ultimo aggiornamento riuscito", "Ostatnia udana aktualizacja", "Seneste vellykkede opdatering", "Siste vellykkede oppdatering"],
  "Choose notification phone": ["Choisir un téléphone", "Telefoon kiezen", "Telefon auswählen", "Elegir teléfono", "Pumili ng telepono", "Välj telefon", "Scegli telefono", "Wybierz telefon", "Vælg telefon", "Velg telefon"],
  "Phone": ["Téléphone", "Telefoon", "Telefon", "Teléfono", "Telepono", "Telefon", "Telefono", "Telefon", "Telefon", "Telefon"],
  "Enable notifications": ["Activer les notifications", "Meldingen inschakelen", "Benachrichtigungen aktivieren", "Activar notificaciones", "Paganahin ang mga abiso", "Aktivera aviseringar", "Attiva notifiche", "Włącz powiadomienia", "Aktivér notifikationer", "Aktiver varsler"],
  "Charts show response time. A reachable endpoint can still have partial outages.": ["Les graphiques indiquent le temps de réponse. Un service accessible peut subir une panne partielle.", "Grafieken tonen de reactietijd. Een bereikbare dienst kan gedeeltelijk uitvallen.", "Diagramme zeigen die Antwortzeit. Ein erreichbarer Dienst kann teilweise ausfallen.", "Los gráficos muestran el tiempo de respuesta. Un servicio accesible puede sufrir fallos parciales.", "Ipinapakita ng mga graph ang oras ng tugon. Maaaring may bahagyang abala kahit naaabot ang serbisyo.", "Diagrammen visar svarstid. En nåbar tjänst kan ha delvisa avbrott.", "I grafici mostrano il tempo di risposta. Un servizio raggiungibile può avere guasti parziali.", "Wykresy pokazują czas odpowiedzi. Dostępna usługa może mieć częściową awarię.", "Graferne viser svartid. En tilgængelig tjeneste kan have delvise nedbrud.", "Grafene viser svartid. En tilgjengelig tjeneste kan ha delvise avbrudd."],
  "Applies on narrow screens and is saved in this browser.": ["S’applique aux petits écrans. Le choix est enregistré dans ce navigateur.", "Geldt voor smalle schermen en wordt in deze browser opgeslagen.", "Gilt für schmale Bildschirme und wird in diesem Browser gespeichert.", "Se aplica en pantallas estrechas y se guarda en este navegador.", "Para sa makikitid na screen. Naka-save sa browser na ito.", "Gäller smala skärmar och sparas i den här webbläsaren.", "Si applica agli schermi stretti e viene salvato in questo browser.", "Dotyczy wąskich ekranów i jest zapisywane w tej przeglądarce.", "Gælder smalle skærme og gemmes i denne browser.", "Gjelder smale skjermer og lagres i denne nettleseren."],
  "Show host metrics from your existing Home Assistant sensors.": ["Afficher les mesures du serveur issues des capteurs Home Assistant.", "Toon hostgegevens van je Home Assistant-sensoren.", "Hostwerte der vorhandenen Home Assistant-Sensoren anzeigen.", "Muestra métricas del servidor de tus sensores de Home Assistant.", "Ipakita ang mga sukat ng host mula sa mga sensor ng Home Assistant.", "Visa värddata från dina Home Assistant-sensorer.", "Mostra le metriche host dai sensori di Home Assistant.", "Pokaż dane hosta z czujników Home Assistant.", "Vis værtsmålinger fra dine Home Assistant-sensorer.", "Vis vertsdata fra Home Assistant-sensorene dine."],
  "24 hours": ["24 heures", "24 uur", "24 Stunden", "24 horas", "24 oras", "24 timmar", "24 ore", "24 godziny", "24 timer", "24 timer"],
  "7 days": ["7 jours", "7 dagen", "7 Tage", "7 días", "7 araw", "7 dagar", "7 giorni", "7 dni", "7 dage", "7 dager"],
  "30 days": ["30 jours", "30 dagen", "30 Tage", "30 días", "30 araw", "30 dagar", "30 giorni", "30 dni", "30 dage", "30 dager"],
  "Download": ["Réception", "Download", "Download", "Descarga", "Download", "Nedladdning", "Download", "Pobieranie", "Download", "Nedlasting"],
  "Upload": ["Envoi", "Upload", "Upload", "Subida", "Upload", "Uppladdning", "Caricamento", "Wysyłanie", "Upload", "Opplasting"],
  "Newer": ["Plus récents", "Nieuwer", "Neuer", "Más recientes", "Mas bago", "Nyare", "Più recenti", "Nowsze", "Nyere", "Nyere"],
  "Older": ["Plus anciens", "Ouder", "Älter", "Más antiguos", "Mas luma", "Äldre", "Meno recenti", "Starsze", "Ældre", "Eldre"],
  "Enable Speedtest": ["Activer le test de débit", "Snelheidstest inschakelen", "Speedtest aktivieren", "Activar prueba de velocidad", "Paganahin ang speed test", "Aktivera hastighetstest", "Attiva test velocità", "Włącz test prędkości", "Aktivér hastighedstest", "Aktiver hastighetstest"],
  "Enable host metrics": ["Activer les mesures du serveur", "Hostmetingen inschakelen", "Hostmetriken aktivieren", "Activar métricas del servidor", "Paganahin ang mga sukat ng host", "Aktivera värddata", "Attiva metriche host", "Włącz dane hosta", "Aktivér værtsmålinger", "Aktiver vertsdata"],
  "Intermittent": ["Intermittent", "Wisselvallig", "Zeitweise gestört", "Intermitente", "Pabugso-bugso", "Instabil", "Intermittente", "Niestabilna", "Ustabil", "Ustabil"],
  "Check blocked": ["Vérification bloquée", "Controle geblokkeerd", "Prüfung blockiert", "Comprobación bloqueada", "Naharang ang pagsusuri", "Kontroll blockerad", "Controllo bloccato", "Kontrola zablokowana", "Kontrol blokeret", "Kontroll blokkert"],
  "Maintenance": ["Maintenance", "Onderhoud", "Wartung", "Mantenimiento", "Pagpapanatili", "Underhåll", "Manutenzione", "Konserwacja", "Vedligeholdelse", "Vedlikehold"],
  "Checks paused": ["Vérifications suspendues", "Controles gepauzeerd", "Prüfungen pausiert", "Comprobaciones pausadas", "Naka-pause ang pagsusuri", "Kontroller pausade", "Controlli sospesi", "Kontrole wstrzymane", "Kontroller sat på pause", "Kontroller satt på pause"],
  "Feed unavailable": ["Flux indisponible", "Feed niet beschikbaar", "Feed nicht verfügbar", "Fuente no disponible", "Hindi makuha ang feed", "Flödet är otillgängligt", "Feed non disponibile", "Kanał niedostępny", "Feed er utilgængeligt", "Feed utilgjengelig"],
  "Connectivity uncertain": ["Connexion incertaine", "Verbinding onzeker", "Verbindung unklar", "Conexión incierta", "Hindi tiyak ang koneksyon", "Osäker anslutning", "Connessione incerta", "Niepewne połączenie", "Usikker forbindelse", "Usikker tilkobling"],
  "Checking connectivity": ["Vérification de la connexion", "Verbinding controleren", "Verbindung wird geprüft", "Comprobando conexión", "Sinusuri ang koneksyon", "Kontrollerar anslutning", "Verifica connessione", "Sprawdzanie połączenia", "Kontrollerer forbindelse", "Sjekker tilkobling"],
  "No recorded history": ["Aucun historique", "Geen geschiedenis", "Kein Verlauf", "Sin historial", "Walang naitalang kasaysayan", "Ingen historik", "Nessuna cronologia", "Brak historii", "Ingen historik", "Ingen historikk"],
  "Testing\u2026": ["Test en cours…", "Bezig met testen…", "Test läuft…", "Probando…", "Sinusubukan…", "Testar…", "Test in corso…", "Testowanie…", "Tester…", "Tester…"]
});

class OutageWatchCard extends HTMLElement {
  static getStubConfig() { return {}; }
  constructor() {
    super();
    this.attachShadow({mode: "open"});
    this.language = "en";
    this.theme = "steel";
    this.mobileLayout = "single";
    this.serverInfoPreference = null;
    this.speedStyle = "classic";
    this.speedDays = 1;
    this.speedPage = 0;
    try {
      const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
      if (Object.hasOwn(DASHBOARD_LANGUAGES, savedLanguage)) this.language = savedLanguage;
      const saved = localStorage.getItem(THEME_KEY);
      if (validTheme(saved)) this.theme = saved;
      if (localStorage.getItem(MOBILE_LAYOUT_KEY) === "double") this.mobileLayout = "double";
      const serverInfo = localStorage.getItem(SERVER_INFO_KEY);
      if (serverInfo !== null) this.serverInfoPreference = serverInfo === "true";
      const speedStyle = localStorage.getItem(SPEED_STYLE_KEY);
      if (Object.hasOwn(SPEED_STYLES, speedStyle)) this.speedStyle = speedStyle;
    } catch { /* Theme selection still works without storage. */ }
    this.shadowRoot.addEventListener("close", (event) => {
      if (!this.isConnected) return;
      if (event.target.classList.contains("theme-dialog") && this.speedStyleChanged) {
        this.speedStyleChanged = false;
        this.render();
        [...this.shadowRoot.querySelectorAll('[data-action="themes"]')].find(button => button.offsetWidth)?.focus();
      }
      if (event.target.classList.contains("speed-dialog")) {
        this.render();
        this.shadowRoot.querySelector('[data-action="speed-history"]')?.focus();
      }
    }, true);
    this.shadowRoot.addEventListener("change", (event) => {
      if (event.target.id === "dashboard-language") {
        const language = event.target.value;
        if (!Object.hasOwn(DASHBOARD_LANGUAGES, language)) return;
        this.language = language;
        try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Keep the session choice. */ }
        this.shadowRoot.querySelector(".theme-dialog").close();
        this.render();
        this.shadowRoot.querySelector(".theme-dialog").showModal();
        this.shadowRoot.querySelector("#dashboard-language").focus();
        return;
      }
      if (event.target.id === "mobile-service-filter") {
        this.serviceFilter = event.target.value;
        this.render();
        this.shadowRoot.querySelector("#mobile-service-filter")?.focus();
      }
      if (event.target.id === "catalog-category") this.filterCatalog();
    });
    this.appearanceReady = () => this.syncAppearance();
    this.shadowRoot.addEventListener("click", (event) => this.handle(event));
    this.shadowRoot.addEventListener("submit", (event) => this.submit(event));
    this.shadowRoot.addEventListener("input", (event) => {
      if (event.target.id === "search") this.filterCatalog();
    });
  }
  setConfig(config) { this.config = config; this.render(); }
  set hass(value) {
    const first = !this._hass;
    this._hass = value;
    this.syncAppearance();
    if (first && this.isConnected) this.refresh();
  }
  getGridOptions() { return {columns: "full", rows: "auto", min_columns: 6}; }
  getCardSize() { return 10; }
  connectedCallback() {
    window.addEventListener("yanke-appearance-ready", this.appearanceReady);
    this.syncAppearance();
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 15000);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
    window.removeEventListener("yanke-appearance-ready", this.appearanceReady);
  }

  syncAppearance() {
    if (this.theme === "appearance" && this._hass) {
      const shell = this.shadowRoot.querySelector('[data-theme="appearance"]');
      if (shell) window.YankeAppearance?.apply(shell, this._hass);
    }
  }

  chooseTheme(theme) {
    if (!validTheme(theme)) return;
    this.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Keep the in-memory choice. */ }
    this.shadowRoot.querySelector(".theme-dialog")?.close();
    this.syncAppearance();
    this.render();
    [...this.shadowRoot.querySelectorAll('[data-action="themes"]')].find(button => button.offsetWidth)?.focus();
  }

  get speedSeries() {
    return SPEED_SENSORS.map((sensor) => ({
      ...sensor, id: this.config?.[`speedtest_${sensor.key}_entity`] || this.data?.readout_entities?.speedtestdotnet?.[sensor.key] || `sensor.speedtest_${sensor.key}`,
    })).filter(({id}) => this._hass?.states?.[id]);
  }

  fetchSpeedReadings(ids, days, end, includeStart = false) {
    return this._hass.callWS({
      type:"history/history_during_period", entity_ids:ids,
      start_time:new Date(end - days * SPEED_WINDOW).toISOString(), end_time:new Date(end).toISOString(),
      include_start_time_state:includeStart, minimal_response:true, no_attributes:true,
    });
  }

  async openSpeedHistory(days = this.speedDays) {
    const dialog = this.shadowRoot.querySelector(".speed-dialog");
    if (!dialog.open) dialog.showModal();
    this.speedDays = days;
    this.speedPage = 0;
    const request = {end:Date.now(), loading:true};
    this.speedLog = request;
    this.drawSpeedHistory();
    try {
      request.data = await this.fetchSpeedReadings(this.speedSeries.map(({id}) => id), days, request.end) || {};
    } catch {
      request.error = true;
    } finally {
      request.loading = false;
      if (this.speedLog === request && dialog.open) this.drawSpeedHistory();
    }
  }

  drawSpeedHistory() {
    const content = this.shadowRoot.querySelector(".speed-log");
    const request = this.speedLog;
    for (const button of this.shadowRoot.querySelectorAll('[data-action="speed-range"]')) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.id) === this.speedDays));
    }
    if (request.loading || request.error) {
      content.innerHTML = `<p role="status">${request.loading ? "Loading recorded readings…" : "Speedtest history could not be loaded."}</p>`;
      this.localize(content);
      return;
    }
    const series = this.speedSeries;
    const byMinute = new Map();
    for (const {id,key} of series) {
      for (const [time,value] of (request.data[id] || []).map(recordedSpeed)) {
        if (!Number.isFinite(time) || value === null) continue;
        const minute = Math.floor(time / 60000) * 60000;
        if (!byMinute.has(minute)) byMinute.set(minute, {});
        byMinute.get(minute)[key] = value;
      }
    }
    const rows = [...byMinute.entries()].sort(([a],[b]) => b-a);
    const pageSize = 20;
    const pages = Math.ceil(rows.length / pageSize);
    const format = (value) => value == null ? "—" : value.toLocaleString(this.language, {maximumFractionDigits:1});
    content.innerHTML = rows.length ? `
      <div class="speed-history-chart">${speedGraph(request.data, series, {days:this.speedDays, style:"wave", end:request.end})}</div>
      ${series.some(({key,id}) => key === "ping" && request.data[id]?.length) ?
        `<div class="speed-history-chart ping-chart"><span class="muted">Ping · ms</span>
          ${speedGraph(request.data, series, {days:this.speedDays, style:"wave", end:request.end, ping:true})}</div>` : ""}
      <p class="muted">First recorded reading: ${escape(new Date(rows.at(-1)[0]).toLocaleString(this.language))} · Download and upload share a scale.</p>
      <div class="speed-table-wrap"><table><thead><tr><th scope="col">Recorded time</th>${series.map(({label,unit}) => `<th scope="col">${label} (${unit})</th>`).join("")}</tr></thead>
        <tbody>${rows.slice(this.speedPage * pageSize, (this.speedPage + 1) * pageSize).map(([time,values]) =>
          `<tr><th scope="row">${escape(new Date(time).toLocaleString(this.language))}</th>${series.map(({key}) => `<td>${escape(format(values[key]))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
      ${pages > 1 ? `<div class="row speed-paging">
        <button type="button" data-action="speed-page" data-id="-1" ${this.speedPage ? "" : "disabled"}>Newer</button>
        <span>${this.translate("Page {page} of {total}").replace("{page}",this.speedPage + 1).replace("{total}",pages)}</span>
        <button type="button" data-action="speed-page" data-id="1" ${this.speedPage + 1 < pages ? "" : "disabled"}>Older</button>
      </div>` : ""}` : '<p role="status">No recorded Speedtest readings for this period.</p>';
    this.localize(content);
  }

  async refreshSpeedHistory() {
    const ids = this.speedSeries.filter(({key}) => key !== "ping").map(({id}) => id);
    const key = ids.join("|");
    const now = Date.now();
    if (!ids.length || this.speedLoading ||
        (this.speedHistoryKey === key && now < this.speedHistoryDue)) return;
    this.speedLoading = true;
    this.speedHistoryKey = key;
    this.speedHistoryDue = now + 5 * 60 * 1000;
    try {
      const history = await this.fetchSpeedReadings(ids, 1, now, true);
      this.speedHistory = history || {};
    } catch {
      this.speedHistory = {};
    } finally {
      this.speedLoading = false;
      if (this.isConnected && !this.adding) this.render();
    }
  }

  async runSpeedtest() {
    if (this.speedRunning || !this._hass?.user?.is_admin) return;
    const download = this.speedSeries.find(({key}) => key === "download");
    if (!download) return;
    const before = this._hass.states[download.id];
    const oldReport = before.last_reported || before.last_updated;
    this.speedRunning = true;
    this.speedMessage = "Running Speedtest…";
    this.render();
    try {
      // Updating one sensor refreshes the integration's shared results.
      await this._hass.callService("homeassistant", "update_entity", {entity_id:download.id});
      const deadline = Date.now() + 10000;
      let fresh = false;
      while (this.isConnected && Date.now() < deadline) {
        const state = this._hass.states[download.id];
        if (!state || numeric(state.state) === null) break;
        if ((state.last_reported || state.last_updated) !== oldReport) {
          fresh = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      this.speedMessage = fresh ? "Speedtest updated" : "No new Speedtest reading";
      // Give Recorder time to commit the readings before querying history again.
      this.speedHistoryDue = Date.now() + 10000;
    } catch {
      this.speedMessage = "Speedtest could not run";
    } finally {
      this.speedRunning = false;
      if (this.isConnected && !this.adding) this.render();
    }
  }

  speedHeader(style = this.speedStyle) {
    const series = this.speedSeries;
    if (!series.length) {
      if (!this.data?.can_manage || this.data.speedtest_configured) return "";
      return '<button type="button" data-action="enable-readouts" data-id="speedtestdotnet">Enable Speedtest</button>';
    }
    const latest = series.map(({id}) => Date.parse(this._hass.states[id].last_updated)).filter(Number.isFinite);
    const last = latest.length ? new Date(Math.max(...latest)).toLocaleString(this.language) : "";
    const canRun = this._hass.user?.is_admin && series.some(({key}) => key === "download");
    const action = canRun ? `<div class="speed-action">
      <button type="button" data-action="speedtest" ${this.speedRunning ? "disabled" : ""}>${this.speedRunning ? "Testing…" : "Run test"}</button>
      <span role="status" class="speed-message" title="${escape(this.speedMessage)}">${escape(this.speedMessage)}</span>
    </div>` : "";
    return `<div class="speed-panel" data-speed-style="${style}" title="${escape(last ? `Speedtest updated ${last}` : "Most recent Speedtest readings")}">
      <button type="button" class="speed-view" data-action="speed-history" aria-label="Open Speedtest history" aria-haspopup="dialog">
      ${style === "gauges" || style === "rails" ? "" : `<span class="speed-trend">${this.speedLoading && !this.speedHistory ? '<span class="speed-empty">Loading history</span>' : speedGraph(this.speedHistory || {}, series, {style:style})}<span class="speed-caption">Speedtest · 24h</span></span>`}
      <span class="speed-values">${series.map(({id,key,label,arrow,unit}) => {
        const sensor = this._hass.states[id];
        const reading = numeric(sensor.state);
        const value = reading === null ? "—" : reading.toLocaleString(this.language, {maximumFractionDigits:1});
        const scale = key === "download" ? 1000 : key === "upload" ? 500 : 100;
        const progress = Math.round(100 * Math.min(1, Math.max(0, (reading ?? 0) / scale)));
        if (style !== "classic") {
          const unitText = escape(sensor.attributes?.unit_of_measurement || unit);
          const display = reading === null ? "—" : Math.abs(reading) >= 10000
            ? new Intl.NumberFormat(this.language, {notation:"compact", maximumFractionDigits:1}).format(reading) : value;
          const gauge = style === "gauges";
          const arc = "M13 57 A32 32 0 1 1 67 57";
          return `<span class="instrument ${key}" style="--level:${progress}%" title="${label}: ${escape(value)} ${unitText} · scale 0–${scale}">
            ${gauge ? `<svg viewBox="0 0 80 64" aria-hidden="true"><path d="${arc}"/><path class="lit" d="${arc}" pathLength="100" stroke-dasharray="${progress} 101"/></svg>` : ""}
            ${style === "rails" ? '<i class="rail"></i>' : ""}
            <span class="reading">${gauge ? "" : arrow} ${escape(display)}</span><small>${unitText}</small>
            ${gauge ? `<strong>${label}</strong>` : ""}</span>`;
        }
        return `<span class="speed-metric ${key}" style="--speed-progress:${progress}%" title="${label} · scale 0–${scale} ${unit}">
          <b>${arrow} ${escape(value)}</b> ${escape(sensor.attributes?.unit_of_measurement || unit)}
        </span>`;
      }).join("")}</span></button>${action}
    </div>`;
  }

  async refresh() {
    if (!this._hass || this.loading) return;
    this.loading = true;
    void this.refreshSpeedHistory();
    try {
      this.data = await this._hass.callWS({type: "outage_watch/dashboard"});
      this.loadError = "";
    } catch (error) {
      this.loadError = error.message && Object.hasOwn(UI_TRANSLATIONS, error.message) ? error.message : "Could not load Outage Map.";
      if (error.message && this.loadError !== error.message) console.warn("Outage Map", error.message);
    } finally {
      this.loading = false;
    }
    if (!this.adding) this.render();
  }

  async change(action, data) {
    this.error = "";
    try {
      await this._hass.callService("outage_watch", action, data);
      this.adding = false;
      this.confirmRemove = false;
      await this.refresh();
    } catch (error) {
      this.error = error.message && Object.hasOwn(UI_TRANSLATIONS, error.message) ? error.message : "Could not save the change.";
      if (error.message && this.error !== error.message) console.warn("Outage Map", error.message);
    }
    this.render();
  }

  handle(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const {action, id} = button.dataset;
    if (action === "themes") {
      const dialog = this.shadowRoot.querySelector(".theme-dialog");
      dialog.showModal();
      dialog.querySelector('[aria-pressed="true"]')?.focus();
      return;
    }
    if (action === "close-themes") return this.shadowRoot.querySelector(".theme-dialog").close();
    if (action === "choose-theme") return this.chooseTheme(id);
    if (action === "server-info") {
      this.serverInfoPreference = !this.showServerInfo;
      try { localStorage.setItem(SERVER_INFO_KEY, String(this.showServerInfo)); } catch { /* In-memory choice. */ }
      button.setAttribute("aria-pressed", String(this.showServerInfo));
      button.textContent = this.translate(this.showServerInfo ? "Hide server info" : "Show server info");
      this.shadowRoot.querySelector(".server-info").hidden = !this.showServerInfo;
      return;
    }
    if (action === "filter-services") {
      this.serviceFilter = id;
      this.render();
      this.shadowRoot.querySelector('[data-action="filter-services"][aria-pressed="true"]')?.focus();
      return;
    }
    if (action === "mobile-layout") {
      if (id !== "single" && id !== "double") return;
      this.mobileLayout = id;
      try { localStorage.setItem(MOBILE_LAYOUT_KEY, id); } catch { /* Keep the in-memory choice. */ }
      this.shadowRoot.querySelector(".shell").dataset.mobileLayout = id;
      for (const choice of this.shadowRoot.querySelectorAll('[data-action="mobile-layout"]')) {
        choice.setAttribute("aria-pressed", String(choice.dataset.id === id));
      }
      return;
    }
    if (action === "speed-history") return this.openSpeedHistory();
    if (action === "close-speed-history") return this.shadowRoot.querySelector(".speed-dialog").close();
    if (action === "speed-range" && Object.hasOwn(SPEED_RANGES, id)) return this.openSpeedHistory(Number(id));
    if (action === "speed-page") {
      this.speedPage += Number(id);
      this.drawSpeedHistory();
      this.shadowRoot.querySelector(`[data-action="speed-page"][data-id="${id}"]:not(:disabled)`)?.focus();
      return;
    }
    if (action === "speed-style" && Object.hasOwn(SPEED_STYLES, id)) {
      this.speedStyle = id;
      try { localStorage.setItem(SPEED_STYLE_KEY, id); } catch { /* In-memory choice. */ }
      for (const choice of this.shadowRoot.querySelectorAll('[data-action="speed-style"]')) {
        choice.setAttribute("aria-pressed", String(choice.dataset.id === id));
      }
      this.speedStyleChanged = true;
      return;
    }
    if (action === "speedtest") return this.runSpeedtest();
    if (action === "enable-readouts") {
      if (id === "speedtestdotnet" && !window.confirm(this.translate("Enable Speedtest? Home Assistant starts a test and normally runs one every hour."))) return;
      button.disabled = true;
      button.textContent = this.translate("Enabling…");
      return this.change("enable_readouts", {provider: id});
    }
    const service = this.activeService;
    this.error = "";
    if (action === "track") return this.change("add_service", {catalog_id: id});
    if (action === "pause-tracking") return this.change("set_tracking_paused", {service_id:service.id, paused:!service.paused});
    if (action === "alerts" && !service.alerts && !this.data.notify_configured) {
      this.shadowRoot.querySelector(".phone-dialog").showModal();
      return;
    }
    if (action === "cancel-phone") return this.shadowRoot.querySelector(".phone-dialog").close();
    if (action === "save-phone") {
      const phone = this.shadowRoot.querySelector(".phone-dialog select").value;
      this.shadowRoot.querySelector(".phone-dialog").close();
      return this.change("set_alerts", {service_id:service.id, enabled:true, phone});
    }
    if (action === "alerts") return this.change("set_alerts", {service_id: service.id, enabled: !service.alerts});
    if (action === "remove") return this.change("remove_service", {service_id: service.id});
    if (action === "select" || action === "close") {
      this.selected = id || null;
      this.confirmRemove = false;
    }
    if (action === "confirm" || action === "cancel-remove") this.confirmRemove = action === "confirm";
    if (action === "add" || action === "cancel") this.adding = action === "add";
    this.render();
    if (this.adding) this.shadowRoot.querySelector("#search")?.focus();
    else if (action === "select") this.shadowRoot.querySelector('[data-action="close"]')?.focus();
  }

  submit(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    this.change("add_service", {name: data.get("name"), url: data.get("url")});
  }

  filterCatalog() {
    const query = this.shadowRoot.querySelector("#search").value.trim().toLowerCase();
    const category = this.shadowRoot.querySelector("#catalog-category").value;
    let matches = 0;
    for (const element of this.shadowRoot.querySelectorAll("[data-search]")) {
      element.hidden = !element.dataset.search.toLowerCase().includes(query) ||
        (category !== "" && element.dataset.category !== category);
      if (!element.hidden) matches += 1;
    }
    this.shadowRoot.querySelector(".catalog-empty").hidden = matches > 0;
  }

  get showServerInfo() { return this.serverInfoPreference ?? (this.theme === "trek"); }

  serverInfo() {
    const states = this._hass?.states || {};
    const config = this.config?.server_info_entities || {};
    const detected = this.data?.readout_entities?.systemmonitor || {};
    const metrics = SERVER_SENSORS.flatMap(([key, label, fallback, unit]) => {
      const sensor = states[config[key] || detected[key] || fallback];
      const value = numeric(sensor?.state);
      if (value === null) return [];
      const displayUnit = sensor.attributes?.unit_of_measurement || unit;
      return [[label, value.toLocaleString(this.language, {maximumFractionDigits:1}) +
        (displayUnit === "%" ? "%" : displayUnit ? " " + displayUnit : "")]];
    });
    const boot = Date.parse(states[config.uptime || detected.uptime || "sensor.system_monitor_uptime"]?.state);
    if (Number.isFinite(boot) && boot <= Date.now()) {
      const hours = Math.floor((Date.now() - boot) / 3600000);
      const days = Math.floor(hours / 24);
      const uptime = hours < 1 ? "<1h" : days ? `${days}d ${hours % 24}h` : `${hours}h`;
      metrics.push(["Host uptime", uptime]);
    }
    const hasHostMetrics = metrics.length > 0;
    if (this._hass?.config?.version) metrics.push(["Home Assistant", this._hass.config.version]);
    return `<section class="server-info" aria-label="Home Assistant server info" ${this.showServerInfo ? "" : "hidden"}>
      <h2>Server info</h2>
      <dl>${metrics.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>
      ${hasHostMetrics || !this.data?.can_manage ? "" :
        '<button type="button" data-action="enable-readouts" data-id="systemmonitor">Enable host metrics</button>'}
    </section>`;
  }

  translate(text) {
    const index = LANGUAGE_CODES.indexOf(this.language);
    const lookup = key => Object.hasOwn(UI_TRANSLATIONS,key) ? UI_TRANSLATIONS[key][index] : null;
    if (index < 0) return text;
    const value = text.trim();
    if (!value) return text;
    const translated = value.split(" · ").map(part => {
      if (lookup(part)) return lookup(part);
      for (const prefix of ["Checked", "Feed refreshed", "Last successful feed update", "Official status", "Speedtest updated", "First recorded reading:", "scale"]) {
        if (part.startsWith(prefix + " ")) return lookup(prefix) + part.slice(prefix.length);
      }
      return part;
    }).join(" · ");
    return text.replace(value, lookup(value) || translated);
  }

  localize(root) {
    if (this.language === "en") return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || node.parentElement.closest("style,.identity,.catalog,.chips,[data-provider-text],#dashboard-language")) continue;
      node.nodeValue = this.translate(node.nodeValue);
    }
    for (const el of root.querySelectorAll("[placeholder],[aria-label],[title]:not(.identity)")) {
      for (const attr of ["placeholder","aria-label","title"]) {
        if (el.hasAttribute(attr)) el.setAttribute(attr,this.translate(el.getAttribute(attr)));
      }
    }
  }

  render() {
    if (this.shadowRoot.querySelector("dialog[open]")) return;
    const {services = [], catalog = [], connected, can_manage, notify_configured} = this.data || {};
    const categories = [...new Set(catalog.map((item) => item.category).filter(Boolean))].sort();
    const ordered = [...services].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
    const trackedCategories = [...new Set(ordered.map(serviceCategory))].sort();
    const filters = ["All", ...trackedCategories];
    const activeFilter = filters.includes(this.serviceFilter) ? this.serviceFilter : "All";
    const visible = activeFilter === "All" ? ordered :
      ordered.filter((item) => serviceCategory(item) === activeFilter);
    const selected = visible.find((item) => item.id === this.selected);
    if (!selected) this.selected = null;
    this.activeService = selected;
    const incident = ordered.find((item) => item.reason === "provider_outage");
    const counts = [["outage", "Outages"], ["possible_problems", "Possible problems"], ["operational", "Healthy"], ["unknown", "Unknown"]];
    const link = (url, title) => /^https:\/\//i.test(url || "") ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${title} ↗</a>` : "";
    const connection = this.data && !("connected" in this.data) ? "" : `<span class="connection"><span class="dot ${connected !== true ? "uncertain" : ""}">●</span>${connected === true ? "Home internet connected" : connected === false ? "Connectivity uncertain" : !services.length && this.data ? "Connectivity checks paused" : "Checking connectivity"}</span>`;
    const trek = this.theme === "trek";
    const summary = `<div class="summary"><span class="count"><b>${services.length}</b> Services</span>
        ${counts.map(([state, name]) => `<span class="count" data-state="${state}"><b>${services.filter((item) => item.status === state).length}</b> ${name}</span>`).join("")}
      </div>`;
    const phones = Object.keys(this._hass?.services?.notify || {}).filter(key => key.startsWith("mobile_app_")).sort();
    const headerActions = `<div class="header-actions"><button type="button" class="theme-open" data-action="themes" aria-haspopup="dialog">Settings</button>${can_manage ? '<button class="primary" data-action="add">+ Add service</button>' : ""}</div>`;
    const filterBar = trackedCategories.length > 0 ? `<div class="service-filters" role="group" aria-label="Filter tracked services">
        <select id="mobile-service-filter" aria-label="Filter tracked services by category">${filters.map(name => `<option value="${escape(name)}" ${name === activeFilter ? "selected" : ""}>${name === "All" ? "All categories" : escape(name)}</option>`).join("")}</select>
        ${filters.map((name) => `<button type="button" data-action="filter-services" data-id="${escape(name)}"
          aria-pressed="${name === activeFilter}">${escape(name)}</button>`).join("")}
      </div>` : "";
    this.shadowRoot.innerHTML = `<style>
      :host {
        display:block;
        font:inherit;
        --ink:#f2f2f3;
        --muted:#c1c5c9;
        --line:#62676c;
        --blue:#a4cfff;
        --violet:#ad9aff;
        --good:#70f0c9;
        --warn:#ffcf87;
        --bad:#ffacac;
      }
      *, *::before, *::after {box-sizing:border-box}
      [hidden] {display:none!important}
      .shell {
        --speed-down:var(--accent,var(--blue));
        --speed-up:var(--trace-color,var(--violet));
        --speed-base:var(--theme-surface,#24272c);
        --speed-track:color-mix(in srgb,var(--line) 55%,var(--speed-base));
        container-type:inline-size;
        color:var(--ink);
        padding:clamp(16px,3vw,38px);
        border:2px solid #72777b;
        border-radius:24px;
        background:
          repeating-linear-gradient(0deg,#fff0 0 2px,#ffffff06 3px,#0002 4px),
          radial-gradient(ellipse at 45% 0%,#454950,#272a2f 72%);
        box-shadow:inset 0 0 0 5px #121416,inset 0 0 16px 7px #0009,0 8px 20px #0008;
      }
      header,.row,.actions,.axis {
        display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
      }
      h1,h2,h3,p {margin:0}
      h1,h2,.identity {text-shadow:0 2px 2px #000}
      h1 {font-size:clamp(34px,5vw,62px);font-weight:760;letter-spacing:-.045em;line-height:1.08}
      h2 {font-size:clamp(20px,2.3cqw,29px)}
      h3 {font-size:15px}
      header p {color:#a8d4e5;font-size:clamp(15px,2cqw,21px);margin-top:7px}
      .muted,.axis,.no-chart {color:var(--muted);font-size:13px}
      button,input,a {font:inherit}
      button,a {cursor:pointer;color:inherit}
      button:disabled {cursor:default;opacity:.6}
      button,a {
        border:1px solid #707579;border-radius:8px;padding:8px 12px;
        background:linear-gradient(#3d4247,#202326);
        box-shadow:inset 0 1px 1px #ffffff31,0 2px 4px #0008;
      }
      button:hover:not(:disabled),a:hover {border-color:var(--blue)}
      button:focus-visible,a:focus-visible,input:focus-visible {outline:2px solid var(--blue);outline-offset:3px}
      .primary {
        padding:11px 18px;border:2px solid #758598;border-radius:999px;
        color:#e2eeff;font-weight:700;background:linear-gradient(#3b5a80,#1a2d49);
        box-shadow:inset 0 0 0 2px #1c293e,0 0 15px #579bfd45,0 4px 7px #000b;
      }
      .server-info {
        display:flex;align-items:center;flex-wrap:wrap;gap:5px 12px;margin:0 0 9px;padding:6px 9px;
        background:var(--theme-raised,#1b1e21);border:1px solid var(--line);border-radius:8px;
      }
      .server-info h2 {font-size:12px}
      .server-info dl {display:flex;flex-wrap:wrap;gap:5px 12px;margin:0}
      .server-info dl div {display:flex;gap:4px;font-size:11px}
      .server-info dt {color:var(--muted)}
      .server-info dd {margin:0;font-weight:700;font-variant-numeric:tabular-nums}
      .server-info p {font-size:11px}
      .service-filters {
        display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px;
      }
      .service-filters button {font-size:12px;line-height:1.2;padding:5px 8px}
      .service-filters button[aria-pressed="true"] {
        outline:2px solid var(--blue);outline-offset:-2px;
      }
      .summary {display:flex;flex-wrap:wrap;gap:10px;margin:clamp(18px,3cqw,30px) 0 18px}
      .count,.connection {
        display:inline-flex;align-items:center;gap:7px;
        border:1px solid #747a80;border-radius:9px;padding:8px 12px;
        color:#e4e5e7;font-size:clamp(12px,1.5cqw,16px);
        background:linear-gradient(140deg,#ffffff22 0%,#ffffff09 48%,transparent 49%),linear-gradient(#16191d,#2c3035);
        box-shadow:inset 0 0 0 2px #101214,inset 0 -3px 6px #ffffff15,0 3px 6px #000a;
      }
      .count b {color:#9ad8ff;text-shadow:0 0 8px currentColor;font:700 1.35em ui-monospace,monospace}
      .count[data-state="outage"] b {color:var(--bad)}
      .count[data-state="possible_problems"] b,.count[data-state="unknown"] b {color:var(--warn)}
      .count[data-state="operational"] b {color:var(--good)}
      .connection {margin-left:auto;background:#1b1e21;box-shadow:inset 0 2px 5px #0009}
      .header-controls {display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;min-width:0}
      .header-controls .connection {margin-left:0}
      .speed-panel {
        display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid var(--line);
        border-radius:8px;background:#1b1e21;box-shadow:inset 0 2px 5px #0009;
      }
      .speed-trend {width:96px;text-align:center;line-height:1}
      .speed-chart {width:96px;height:24px;display:block}
      .speed-chart path {fill:none;stroke:currentColor;stroke-width:1.35}
      .speed-chart circle {fill:currentColor}
      .speed-chart .speed-grid {stroke:var(--speed-track);stroke-width:.5}
      .speed-caption,.speed-empty {font-size:9px;color:var(--muted)}
      .speed-values {display:flex;flex-wrap:wrap;gap:4px 8px;font-size:11px;font-variant-numeric:tabular-nums}
      .speed-values span {white-space:nowrap}
      .download {color:#a4cfff}
      .upload {color:#c7b2ff}
      .speed-values .ping {color:var(--muted)}
      .speed-panel .speed-view,.shell:not([data-theme="steel"]) .speed-panel .speed-view {
        display:flex;align-items:center;gap:6px;background:transparent;
        border:0;box-shadow:none;padding:1px 2px;text-align:left;min-width:0;
      }
      .speed-view:hover .speed-caption {text-decoration:underline}
      .speed-action {display:grid;justify-items:center;gap:2px;min-width:66px}
      .speed-action button {font-size:11px;line-height:1.15;padding:5px 7px;white-space:nowrap}
      .speed-message {font-size:9px;line-height:1.1;color:var(--muted);max-width:76px;text-align:center}
      @container (max-width:689px) {.speed-panel {flex-wrap:wrap;max-width:100%}}
      @container (max-width:689px) {.header-controls {justify-content:flex-start}}
      .dot,.pill::after {
        display:inline-block;flex:0 0 auto;width:10px;height:10px;border-radius:50%;
        background:radial-gradient(circle at 35% 25%,#fff9,transparent 65%),currentColor;
        box-shadow:0 0 8px currentColor,inset 0 -2px 3px #0007;
      }
      .dot {color:var(--good);margin-right:2px;font-size:0}
      .dot.uncertain {color:var(--warn)}
      .banner {border:1px solid #b67477;background:#37282b;border-radius:10px;padding:12px 14px;margin-bottom:16px}
      .banner p {margin-top:4px;color:#f5c7cc}
      .warning {background:#332b20;border-color:#9a7a43}
      .warning p {color:#f4d99e}
      .layout {display:grid;gap:16px;align-items:start}
      .with-detail {grid-template-columns:minmax(0,1.95fr) minmax(0,1fr)}
      .tiles {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .tile,.detail,.add-box {
        position:relative;min-width:0;padding:clamp(14px,2cqw,24px);
        border:4px double #777c80;border-radius:15px;
        background:
          radial-gradient(circle at center,#ffffff12 .45px,transparent .7px) 0 0/3px 3px,
          linear-gradient(155deg,#383b3e,#252729 48%,#1c1e21);
        box-shadow:inset 0 0 0 1px #141516,inset 0 0 12px #0007,0 5px 8px #000b;
      }
      .tile::before,.detail::before {
        content:"";position:absolute;inset:4px;pointer-events:none;
        --screw:radial-gradient(circle at 40% 35%,#a1a4a7 0%,#4b4f52 47%,#121315 62%,#686b6e 72%,transparent 75%);
        background:var(--screw) top left/9px 9px no-repeat,var(--screw) top right/9px 9px no-repeat,
                   var(--screw) bottom left/9px 9px no-repeat,var(--screw) bottom right/9px 9px no-repeat;
      }
      .tile {width:100%;text-align:left;display:grid;align-content:start;gap:10px;min-height:148px}
      .tile[aria-pressed=true] {border-color:#a9b5c5;box-shadow:inset 0 0 0 1px #111,0 0 12px #a4cfff50,0 5px 8px #000b}
      .identity {display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere;font-size:clamp(16px,2.15cqw,25px)}
      .tile .identity {min-width:0;line-height:1.15;overflow-wrap:normal}
      .tile .identity ha-icon {flex:none}
      .service-name {
        display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;
        min-width:0;overflow:hidden;overflow-wrap:anywhere;
      }
      .tile-meta {display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0}
      .tile-meta .muted {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tile-meta .pill {flex:none;white-space:nowrap}
      .identity ha-icon {color:#e1e2e4;filter:drop-shadow(0 2px 1px #000)}
      .pill {
        display:inline-flex;align-items:center;gap:8px;
        font-weight:650;font-size:clamp(11px,1.3cqw,14px);
        padding:5px 9px;border-radius:999px;color:#e2e5ea;
        background:#33363a;box-shadow:inset 0 2px 6px #0008;
      }
      .pill::after {content:"";width:8px;height:8px}
      .operational {color:var(--good);background:#103a33}
      .outage {color:var(--bad);background:#542a30}
      .possible_problems {color:var(--warn);background:#4d3720}
      .trace {fill:none;stroke:var(--violet);stroke-width:1.55;vector-effect:non-scaling-stroke}
      .chart {display:block;width:100%;height:auto;min-height:26px;filter:drop-shadow(0 0 4px #8e77ff80)}
      .spark {display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:32px}
      .spark strong {font-variant-numeric:tabular-nums;font-size:14px}
      .gridline,.baseline {fill:none;stroke:#465761;stroke-width:.65}
      .baseline {stroke:#bcc9dc;stroke-dasharray:4 4}
      .detail {display:grid;gap:16px}
      .detail p {overflow-wrap:anywhere}
      .plot {border:1px solid #636d75;padding:10px;border-radius:9px;background:radial-gradient(ellipse at center,#202f3d,#11171d);box-shadow:inset 0 0 9px #000}
      .plot .row {margin-bottom:9px}
      .axis {font-size:11px;margin-top:5px}
      .response-chart {display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:8px}
      .response-chart .chart {height:120px}
      .response-chart .axis {grid-column:2}
      .response-scale {display:flex;flex-direction:column;justify-content:space-between;color:var(--muted);font-size:11px;text-align:end;white-space:nowrap;font-variant-numeric:tabular-nums}
      .response-range {grid-column:2;margin-top:4px;font-variant-numeric:tabular-nums}
      .chips {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .chips span {font-size:12px;color:#151619;font-weight:700;border:1px solid #e2e3e4;background:linear-gradient(#c6c9cb,#858b91);padding:5px 8px;border-radius:5px;box-shadow:0 2px 3px #0009}
      .detail a {border-color:#8db2dc;text-decoration:none;padding:7px 9px;font-size:13px;box-shadow:inset 0 0 0 2px #15191e,0 0 8px #75adff55}
      .detail footer {border-top:1px solid #64686c;padding-top:11px}
      button.danger {border-color:#d79094}
      .danger {color:var(--bad)}
      .notice {margin-top:14px}
      .add-box {margin-bottom:14px}
      .catalog-controls {display:flex;flex-wrap:wrap;gap:6px}
      .catalog-controls select {font:inherit;color:var(--ink);background:var(--theme-raised,#202429);border:1px solid var(--line);border-radius:8px;padding:6px;max-width:100%}
      .catalog {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;max-height:220px;overflow:auto;padding:3px}
      .add-box form {display:flex;gap:8px;flex-wrap:wrap}
      .add-box input {min-width:0;max-width:100%;background:#16191d;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px}
      .add-box form input {flex:1 1 160px}
      /* Keep the normal dashboard view compact on desktop. */
      @container (min-width:690px) {
        header h1 {font-size:clamp(28px,3.4cqw,44px)}
        header p {font-size:13px;margin-top:2px;line-height:1.2}
        .summary {margin:10px 0 9px;gap:6px}
        .count,.connection {padding:5px 9px;font-size:12px}
        .layout,.tiles {gap:7px}
        .with-detail {grid-template-columns:minmax(0,2.65fr) minmax(245px,1fr)}
        .tiles {grid-template-columns:repeat(3,minmax(0,1fr))}
        .layout:not(.with-detail) .tiles {grid-template-columns:repeat(4,minmax(0,1fr))}
        .tile,.detail {padding:9px 11px}
        .tile {gap:3px;min-height:0;grid-template-rows:30px 18px 17px 14px;line-height:1.12;padding:6px 9px}
        .tile .identity {font-size:13px;line-height:1.12}
        .tile ha-icon {--mdc-icon-size:16px;flex:none}
        .pill {font-size:10px;padding:3px 6px;gap:5px}
        .pill::after {width:6px;height:6px}
        .tile .muted,.tile .no-chart {font-size:11px;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .spark {min-height:15px}
        .spark .chart {height:17px;min-height:0}
        .spark strong {font-size:11px}
        .detail {gap:9px;max-height:calc(100dvh - 215px);overflow:auto}
        .detail .plot .chart {max-height:120px}
        .detail button,.detail a {padding:5px 7px}
        .notice {margin-top:8px}
        .banner {padding:6px 10px;margin-bottom:8px;font-size:13px}
        .banner p {display:none}
      }
      @container (min-width:900px) {
        .tiles {grid-template-columns:repeat(4,minmax(0,1fr))}
        .layout:not(.with-detail) .tiles {grid-template-columns:repeat(5,minmax(0,1fr))}
      }
      @media (max-height:800px) {
        @container (min-width:690px) {
          .tile {grid-template-rows:27px 16px 14px 12px;padding-block:5px}
          .tile .identity {font-size:12px}
          .spark .chart {height:14px}
        }
      }
      @media (min-width:1024px) {
        .shell {padding:14px 16px}
      }
      @container (max-width:689px) {
        .with-detail {grid-template-columns:minmax(0,1fr)}
        .detail {grid-row:1}
        .connection {margin-left:0}
      }
      @container (max-width:500px) {.tiles {grid-template-columns:minmax(0,1fr)}}
      .theme-open {white-space:nowrap}
      @container (min-width:690px) and (max-width:1100px) {
        .header-controls {gap:5px}
        .header-controls .primary,.theme-open {font-size:11px;padding:6px 9px}
        .header-controls .connection {font-size:11px;padding-inline:6px}
        .speed-panel {gap:5px;padding-inline:6px}
        .speed-trend,.speed-chart {width:74px}
        .speed-values {gap:4px;font-size:10px}
      }
      .theme-dialog,.speed-dialog {
        box-sizing:border-box;width:min(540px,calc(100vw - 26px));max-height:calc(100dvh - 26px);
        color:var(--ink);background:var(--theme-surface,#22262b);border:1px solid var(--line);
        padding:16px;border-radius:14px;box-shadow:0 12px 54px #0009;
      }
      .theme-dialog::backdrop,.speed-dialog::backdrop {background:#060a1199}
      .speed-dialog {width:min(690px,calc(100vw - 26px))}
      .speed-ranges,.speed-style-controls {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      .speed-ranges button[aria-pressed="true"] {outline:2px solid var(--blue);outline-offset:-2px}
      .speed-log {margin-top:10px}
      .speed-history-chart .speed-chart {width:100%;height:130px;background:var(--theme-raised,#17232b);border-radius:6px}
      .speed-history-chart .speed-chart path {vector-effect:non-scaling-stroke}
      .speed-history-chart.ping-chart {margin-top:7px}
      .ping-chart .speed-chart {height:65px}
      .ping-chart .ping {color:var(--good)}
      .speed-table-wrap {overflow:auto;max-height:45vh;margin-top:8px}
      .speed-table-wrap table {width:100%;border-collapse:collapse;font-size:12px}
      .speed-table-wrap :is(th,td) {padding:6px;text-align:left;border-bottom:1px solid var(--line)}
      .speed-table-wrap tbody th {font-weight:400}
      .speed-paging {margin-top:8px}
      .theme-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,205px),1fr));gap:8px;margin-top:12px}
      .theme-choice {display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px;text-align:left;min-width:0}
      .theme-choice[aria-pressed="true"] {outline:2px solid var(--blue);outline-offset:-2px}
      .theme-choice small {display:block;color:var(--muted);margin-top:3px;line-height:1.2}
      .theme-swatch {width:26px;height:26px;border:1px solid var(--swatch-edge);border-radius:5px;background:linear-gradient(140deg,var(--swatch-bg) 60%,var(--swatch-accent) 61%)}

      .shell:not([data-theme="steel"]) {
        --blue:var(--accent);
        --violet:var(--trace-color,var(--accent));
        background:var(--backdrop,var(--theme-bg));
        border:1px solid var(--line);
        box-shadow:inset 0 0 24px var(--glow,transparent);
        border-radius:var(--theme-radius,12px);
      }
      .shell:not([data-theme="steel"]) :is(.tile,.detail,.add-box) {
        color:var(--ink);background:var(--panel,var(--theme-surface));border:1px solid var(--line);
        border-radius:var(--theme-radius,12px);box-shadow:inset 0 0 10px var(--glow,transparent);
      }
      .shell:not([data-theme="steel"]) :is(.tile,.detail)::before {display:none}
      .shell:not([data-theme="steel"]) :is(button,a,.count,.connection,.speed-panel,.plot,.chips span,.add-box input):not(.tile) {
        color:var(--ink);background:var(--theme-raised);border-color:var(--line);box-shadow:none;
      }
      .shell:not([data-theme="steel"]) :is(button,a):hover:not(:disabled),
      .shell:not([data-theme="steel"]) .tile[aria-pressed="true"] {
        border-color:var(--accent);box-shadow:0 0 9px var(--glow,transparent);
      }
      .shell:not([data-theme="steel"]) .primary {
        background:var(--action-bg,var(--accent));color:var(--on-accent);border-color:var(--accent);
      }
      .shell:not([data-theme="steel"]) :is(header p,.count b,.identity ha-icon,.download) {color:var(--accent)}
      .shell:not([data-theme="steel"]) .upload {color:var(--trace-color,var(--accent))}
      .shell:not([data-theme="steel"]) :is(h1,h2,.identity,.count b) {text-shadow:none}
      .shell:not([data-theme="steel"]) .chart {filter:drop-shadow(0 0 3px var(--glow,transparent))}
      .shell:not([data-theme="steel"]) .banner {background:var(--theme-raised);border-color:var(--bad)}
      .shell:not([data-theme="steel"]) .banner p {color:var(--muted)}
      .shell:not([data-theme="steel"]) .warning {border-color:var(--warn)}
      .shell:not([data-theme="steel"]) .operational {color:var(--good);background:color-mix(in srgb,var(--good) 14%,var(--theme-bg))}
      .shell:not([data-theme="steel"]) .possible_problems {color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,var(--theme-bg))}
      .shell:not([data-theme="steel"]) .outage {color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,var(--theme-bg))}
      .shell:not([data-theme="steel"]) .unknown {color:var(--muted);background:var(--theme-raised)}
      .shell:not([data-theme="steel"]) .pill {box-shadow:none}
      .shell:not([data-theme="steel"]) .count[data-state="outage"] b {color:var(--bad)}
      .shell:not([data-theme="steel"]) .count[data-state="possible_problems"] b {color:var(--warn)}
      .shell:not([data-theme="steel"]) .count[data-state="operational"] b {color:var(--good)}
      .shell[data-theme="relay"] {
        --theme-bg:#20251e;--theme-surface:#292b22;--theme-raised:#34372c;--line:#93896b;
        --ink:#f4e9ca;--muted:#d8cca8;--accent:#ffca75;--on-accent:#261d0d;
        --trace-color:#ffb45c;--theme-radius:7px;
        --backdrop:repeating-linear-gradient(0deg,#0002 0 1px,transparent 1px 4px),#242a21;
      }
      .shell[data-theme="relay"] h1 {font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.015em;color:var(--accent)}
      .shell[data-theme="relay"] .tile {border-top:4px solid #c6bb97}
      .shell[data-theme="relay"] .count {outline:1px solid #c6bb97;outline-offset:-3px}
      .shell[data-theme="neon"] {
        --theme-bg:#060b1c;--theme-surface:#0c1428;--theme-raised:#121c33;--line:#4c7898;
        --ink:#f0f3ff;--muted:#b3c4df;--accent:#70f5ff;--on-accent:#231021;
        --action-bg:#ff91e7;--trace-color:#f887ed;--glow:#59e9ff47;--theme-radius:4px;
        --backdrop:linear-gradient(#64dfff14 1px,transparent 1px) 0 0/24px 24px,
                   linear-gradient(90deg,#64dfff14 1px,transparent 1px) 0 0/24px 24px,#080d20;
      }
      .shell[data-theme="neon"] h1 {font-family:ui-monospace,monospace;text-transform:uppercase;color:var(--accent);text-shadow:0 0 12px #ef74e5aa}
      .shell[data-theme="neon"] :is(.tile,.detail) {border-top:2px solid var(--accent)}
      .shell[data-theme="abyss"] {
        --theme-bg:#0a1021;--theme-surface:#141b32;--theme-raised:#212947;--line:#576393;
        --ink:#f2f5ff;--muted:#bfc9e9;--accent:#77f1ff;--on-accent:#07262c;
        --trace-color:#8ce6ba;--glow:#7275df55;--theme-radius:20px;
        --backdrop:radial-gradient(ellipse at 100% 100%,#26204a,transparent 62%),#0a1021;
        --panel:linear-gradient(145deg,#202b46,#121a30);
      }
      .shell[data-theme="abyss"] h1 {color:var(--accent);text-shadow:0 0 14px #58eeff65}
      .shell[data-theme="tide"] {
        --theme-bg:#062939;--theme-surface:#0d3546;--theme-raised:#184959;--line:#4392a3;
        --ink:#f1fbff;--muted:#b8dfe7;--accent:#85ffe4;--on-accent:#042e32;
        --trace-color:#72eaff;--glow:#58e9ed50;--theme-radius:10px;
        --backdrop:radial-gradient(ellipse at 100% 90%,#0a6676,transparent 62%),
                   radial-gradient(ellipse at 0 0,#147688,transparent 55%),#08293c;
        --panel:linear-gradient(160deg,#185060,#0b3446 70%);
      }
      .shell[data-theme="tide"] h1 {color:#d6fbff;text-shadow:0 2px 0 #0a5267,0 0 14px #67f1f585}
      .shell[data-theme="tide"] :is(.count,.detail a) {border-radius:999px}
      .shell[data-theme="trek"] {
        --theme-bg:#080706;--theme-surface:#080706;--theme-raised:#231a12;--line:#604625;
        --ink:#ffe3a2;--muted:#d9bb84;--accent:#ffcc66;--on-accent:#151009;
        --good:#8cd798;--warn:#ff9e59;--trace-color:#99b5ff;
        --theme-radius:23px 8px 10px 15px;
      }
      .trek-identity {display:flex;align-items:center;flex-wrap:wrap;gap:10px;min-width:0}
      .shell[data-theme="trek"] .trek-badge {
        display:block;flex:0 1 auto;width:clamp(76px,min(11cqw,17dvh),150px);max-width:100%;
        padding:0;border:0;border-radius:50%;background:transparent;
      }
      .trek-badge img {display:block;width:100%;height:auto;border-radius:inherit}
      .trek-badge:focus-visible {outline:2px solid var(--accent);outline-offset:4px}
      .shell[data-theme="trek"] h1 {
        color:var(--accent);text-transform:uppercase;letter-spacing:.045em;
      }
      .shell[data-theme="trek"] :is(.tile,.detail) {
        border-inline-start:5px solid #b3a4ed;border-block-end:2px solid var(--warn);
      }
      .shell[data-theme="trek"] .detail {border-inline-start-color:var(--trace-color)}
      .shell[data-theme="trek"] :is(.count,.connection,.theme-open) {border-radius:999px}
      .shell[data-theme="trek"] .theme-open {background:#b3a4ed;color:var(--on-accent)}
      .trek-toolbar {display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;margin-block:6px}
      .trek-toolbar :is(.summary,.service-filters) {margin:0}
      .shell[data-theme="trek"] .header-controls .server-info {flex:1 0 100%;margin:0;line-height:1.2}
      .shell[data-theme="trek"] .server-info dl div {white-space:nowrap}
      @media (min-width:1024px) and (max-height:760px) {
        .shell[data-theme="trek"] {padding-block:6px}
      }

      @container (min-width:690px) {
        .shell[data-theme="trek"] header {gap:8px;align-items:flex-start}
        .shell[data-theme="trek"] .trek-identity {flex-wrap:nowrap;align-items:flex-start}

        .shell[data-theme="trek"] header h1 {font-size:clamp(30px,3.8cqw,58px)}
        .shell[data-theme="trek"] .header-controls {flex:1 1 640px;gap:5px;padding-block-start:8px}
        .shell[data-theme="trek"] .header-controls :is(.primary,.theme-open,.connection) {
          font-size:11px;padding:5px 8px;white-space:nowrap;
        }
        .shell[data-theme="trek"] .speed-trend {width:74px}
        .shell[data-theme="trek"] .speed-trend .speed-chart {width:100%}

        .shell[data-theme="trek"] :is(.layout,.tiles) {gap:6px}
        .shell[data-theme="trek"] .tile {
          grid-template-rows:22px 16px 16px 13px;
          gap:2px;padding-block:3px;
        }
        .shell[data-theme="trek"] .tile .identity {font-size:clamp(13px,1.3cqw,18px)}
        .shell[data-theme="trek"] .detail h2 {font-size:clamp(22px,2.5cqw,34px)}
        .shell[data-theme="trek"] .spark .chart {height:15px}
        .shell[data-theme="trek"] .detail {gap:8px;max-height:max(240px,calc(100dvh - 255px))}
      }

      @media (min-width:1024px) {
        .shell[data-theme="trek"]:has(.tile:nth-child(9)):not(:has(.add-box)) {
          display:flex;flex-direction:column;min-height:calc(100dvh - 62px);
        }
        .shell[data-theme="trek"]:has(.tile:nth-child(9)):not(:has(.add-box)) .layout {
          flex:1;align-items:stretch;
        }
        .shell[data-theme="trek"]:has(.tile:nth-child(9)) .tiles {
          grid-auto-rows:minmax(min-content,1fr);
        }
        .shell[data-theme="trek"]:has(.tile:nth-child(9)) .tile {
          align-content:center;
        }
        .shell[data-theme="trek"] .detail {align-self:start}
      }

      .shell[data-theme="appearance"] {
        --theme-bg:var(--yanke-bg,var(--primary-background-color,#20242b));
        --theme-surface:var(--yanke-surface,var(--ha-card-background,#292f39));
        --theme-raised:var(--yanke-raised,var(--secondary-background-color,#343d49));
        --ink:var(--yanke-text,var(--primary-text-color,#f0f2f7));
        --muted:var(--yanke-muted,var(--secondary-text-color,#b6c5db));
        --speed-up:var(--accent-color,var(--good));
        --accent:var(--yanke-accent,var(--primary-color,#65d4ee));
        --on-accent:var(--yanke-on-accent,var(--text-primary-color,#10191c));
        --line:var(--yanke-line,var(--divider-color,#758294));
        --good:var(--yanke-success,var(--success-color,#6fd2a6));
        --warn:var(--yanke-warning,var(--warning-color,#ffce83));
        --bad:var(--yanke-danger,var(--error-color,#ff9d9d));
        font-family:var(--yanke-font,var(--ha-font-family-body,inherit));
      }
      .shell[data-theme="appearance"] .tile {grid-template-rows:auto;grid-auto-rows:minmax(min-content,auto)}
      .shell[data-theme="appearance"] .identity {font-size:calc(1em * var(--yanke-scale,1))}
      .shell[data-theme="appearance"] :is(.muted,.pill,.count,.connection,.speed-values) {
        font-size:calc(11px * var(--yanke-scale,1));
      }
      .shell[data-theme="appearance"] .header-controls button {font-size:calc(12px * var(--yanke-scale,1))}
      .shell[data-theme="appearance"] h1 {font-size:calc(clamp(28px,3.4cqw,44px) * var(--yanke-scale,1))}
      .layout-options {border:0;padding:0;margin:16px 0 0}
      .layout-options legend {font-weight:700;margin-bottom:6px}
      .layout-options button {margin:0 5px 0 0}
      .layout-options button[aria-pressed="true"] {outline:2px solid var(--blue);outline-offset:-2px}
      .layout-options p {margin-top:6px}
      @container (max-width:500px) {
        .shell[data-mobile-layout="double"] .tiles {
          grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;
        }
        .shell[data-mobile-layout="double"] .tile {padding:9px 7px;gap:6px;min-height:0}
        .shell[data-mobile-layout="double"] .tile .identity {font-size:13px;align-items:flex-start;gap:4px}
        .shell[data-mobile-layout="double"] .tile ha-icon {--mdc-icon-size:15px}
        .shell[data-mobile-layout="double"] .tile-meta {display:grid;justify-content:stretch}
        .shell[data-mobile-layout="double"] .tile .pill {
          justify-self:start;max-width:100%;white-space:normal;font-size:10px;padding:3px 5px;
        }
        .shell[data-mobile-layout="double"] .tile .muted,
        .shell[data-mobile-layout="double"] .no-chart {font-size:11px}
        .shell[data-mobile-layout="double"] .spark {gap:4px;min-height:22px}
        .shell[data-mobile-layout="double"] .spark strong {font-size:11px}
      }
      .speed-chart path.wave-fill {fill:currentColor;opacity:.12;stroke:none}
      .shell .speed-panel[data-speed-style]:not([data-speed-style="classic"]) {
        box-sizing:border-box;max-width:100%;padding:6px 10px;gap:10px;flex-wrap:wrap;
        background:linear-gradient(150deg,color-mix(in srgb,var(--speed-down) 12%,var(--speed-base)),var(--speed-base));border:1px solid var(--line);
        border-radius:14px;box-shadow:inset 0 0 0 3px var(--speed-base);
      }
      .speed-panel:not([data-speed-style="classic"]) .speed-values {display:grid;gap:2px}
      .instrument {--light:var(--speed-down);color:var(--ink);display:flex;align-items:baseline;gap:4px;line-height:1.12}
      .instrument.upload {--light:var(--speed-up);color:var(--ink)}
      .instrument.ping {--light:var(--good);color:var(--ink)}
      .reading {font-size:15px;font-weight:700;color:var(--light);font-variant-numeric:tabular-nums}
      .instrument small {font-size:10px;color:var(--muted)}
      .speed-panel:not([data-speed-style="classic"]) .speed-trend {width:clamp(92px,12vw,175px)}
      .speed-panel:not([data-speed-style="classic"]) .speed-chart {width:100%;height:auto;color:var(--speed-down)}
      .shell[data-theme] :is(.speed-chart,.speed-values,.speed-dialog) .download {color:var(--speed-down)}
      .shell[data-theme] :is(.speed-chart,.speed-values,.speed-dialog) .upload {color:var(--speed-up)}
      .speed-panel:not([data-speed-style="classic"]) .speed-caption {color:var(--muted)}
      .speed-panel[data-speed-style="matrix"] .speed-chart {background:radial-gradient(ellipse,var(--speed-track) 1px,transparent 1.5px) 0 0/4px 3px}
      .speed-panel[data-speed-style="matrix"] .speed-chart g path {stroke-dasharray:1.2 .5;stroke-width:2}
      .speed-panel[data-speed-style="gauges"] .speed-values {display:flex;gap:4px;flex-wrap:wrap}
      .speed-panel[data-speed-style="gauges"] .instrument {
        width:clamp(62px,5vw,82px);aspect-ratio:80/74;position:relative;display:flex;
        flex-direction:column;align-items:center;justify-content:flex-end;gap:1px;
      }
      .instrument svg {width:100%;position:absolute;inset:0 0 auto;fill:none;stroke:var(--speed-track);stroke-width:5;stroke-linecap:round}
      .instrument svg .lit {stroke:var(--light);filter:drop-shadow(0 0 2px var(--light))}
      .instrument svg ~ .reading {position:relative;line-height:1.1;font-size:14px}
      .instrument strong {margin-top:5px;color:var(--light);font-size:9px;text-transform:uppercase}
      .rail {width:clamp(90px,12vw,175px);height:7px;margin-right:6px;align-self:center;border:1px solid var(--line);border-radius:8px;background:var(--speed-base);overflow:hidden}
      .rail::before {content:"";display:block;width:var(--level);height:100%;background:linear-gradient(90deg,color-mix(in srgb,var(--light) 48%,var(--speed-base)),var(--light));border-radius:inherit}
      .shell .speed-panel:not([data-speed-style="classic"]) .speed-action button {
        color:var(--ink);border:1px solid var(--speed-down);border-radius:20px;padding:7px 10px;
        background:var(--speed-base);box-shadow:0 0 6px color-mix(in srgb,var(--speed-down) 30%,transparent);
      }
      .speed-message:empty {display:none}
      .header-actions {display:flex;align-items:center;flex-wrap:wrap;gap:5px}
      .trek-header {--trek-art:url(data:image/webp;base64,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);--frame:#e6b861;--panel-blue:#a6b9e5;--panel-violet:#b4a0c4}
      .trek-header .trek-identity {align-items:center}
      .trek-header .trek-identity > div {
        padding:8px 12px;border-inline-start:10px solid var(--frame);
        border-block-end:4px solid var(--frame);border-radius:18px 0 18px 0;
        background:#120e08;
      }
      .trek-header .trek-identity h1 {
        font-family:"Arial Narrow","Roboto Condensed",system-ui,sans-serif;
        font-stretch:condensed;letter-spacing:.01em;
      }
      .shell[data-theme="trek"] .trek-header .header-controls {
        gap:4px;justify-content:flex-end;align-items:center;
      }
      .shell[data-theme="trek"] .trek-header .connection {
        background:#15251a;border-color:#83b18a;color:#c5e8bf;
      }
      .shell[data-theme="trek"] .trek-header .speed-panel[data-speed-style] {
        background:#080706;border:2px solid var(--frame);border-radius:24px 8px 8px 24px;
        box-shadow:none;padding:3px 7px;gap:5px;
      }
      .trek-header .speed-panel[data-speed-style="gauges"] .instrument {width:clamp(53px,5.5cqw,76px)}
      .trek-header .instrument svg > path:first-child {
        stroke:color-mix(in srgb,var(--light) 55%,#080706);
      }
      .shell[data-theme="trek"] .trek-header .speed-action button {
        background:linear-gradient(#ffe1a2,#d3953d);color:#241407;border-color:#ffda87;
      }
      .shell[data-theme="trek"] .trek-header .server-info {
        border:0;border-inline-start:10px solid var(--frame);border-radius:8px 4px 4px 8px;
        padding:2px 4px;gap:3px;background:#080706;
      }
      .trek-header .server-info :is(h2,dl div) {
        background:#4b351f;color:#ffebbc;padding:3px 5px;border-radius:2px;
      }
      .trek-header .server-info dl {gap:3px}
      .trek-header .server-info dl div:nth-child(3n + 1) {border-inline-start:3px solid var(--frame)}
      .trek-header .server-info dl div:nth-child(3n + 2) {border-inline-start:3px solid var(--panel-blue)}
      .trek-header .server-info dl div:nth-child(3n) {border-inline-start:3px solid var(--panel-violet)}
      .trek-toolbar .service-filters button {border-radius:999px}
      .shell[data-theme="trek"] .trek-toolbar button[aria-pressed="true"] {
        background:var(--accent);color:var(--on-accent);
      }
      .shell[data-theme="trek"] .trek-toolbar .count[data-state] {
        border-color:color-mix(in srgb,currentColor 60%,var(--line));
      }
      .shell[data-theme="trek"] .trek-toolbar .count[data-state="outage"] {color:var(--bad)}
      .shell[data-theme="trek"] .trek-toolbar .count[data-state="possible_problems"] {color:var(--warn)}
      .shell[data-theme="trek"] .trek-toolbar .count[data-state="operational"] {color:var(--good)}
      @container (min-width:950px) {
        .shell[data-theme="trek"] .trek-header {flex-wrap:nowrap;align-items:center}
        .shell[data-theme="trek"] .trek-header .trek-badge {width:clamp(76px,10cqw,136px)}
        .shell[data-theme="trek"] .trek-header h1 {font-size:clamp(26px,3.1cqw,48px);white-space:nowrap}
        .shell[data-theme="trek"] .trek-header .header-controls {padding:0}
      }

      @container (min-width:950px) {
        .shell[data-theme="trek"] header.trek-header {
          display:block;position:relative;width:100%;aspect-ratio:1024/124;margin:0;padding:0;
          isolation:isolate;background:#000 var(--trek-art) left top/100% auto no-repeat;
        }
        /* Clear only the instrument well, inside the original gold bezel. */
        .trek-header::before {
          content:"";position:absolute;z-index:-1;pointer-events:none;
          left:63.45%;right:2.05%;top:7.5%;bottom:26.6%;
          border-radius:2cqw 1.2cqw 1.2cqw 2cqw;background:#060503;
        }
        .trek-header::after {
          content:"";position:absolute;z-index:-1;pointer-events:none;
          left:20.95%;right:2%;bottom:0;height:18.7%;background:#080604;
        }
        .trek-header .trek-identity,.shell[data-theme="trek"] .trek-header .header-controls {display:contents}
        .shell[data-theme="trek"] .trek-header .trek-badge {position:absolute;inset:0 auto auto 0;width:12%;height:94%;opacity:0}
        .trek-header .trek-identity>div {position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}
        .shell[data-theme="trek"] .trek-header .connection {position:absolute;left:47.8%;top:23%;width:14.6%;height:33%;box-sizing:border-box;justify-content:center;padding:0;font:condensed 600 clamp(10px,1.05cqw,18px)/1 "Arial Narrow",sans-serif;background:#122117}
        .trek-header .header-actions {position:absolute;left:47.6%;top:3%;width:15%;height:17%;display:flex;flex-wrap:nowrap;gap:2px}
        .shell[data-theme="trek"] .header-actions button {flex:auto;height:100%;padding:0 2px;border:0;border-radius:0;background:#e3a153;color:#100d10;font:bold clamp(9px,1cqw,15px)/1 "Arial Narrow",sans-serif}
        .shell[data-theme="trek"] .header-actions .primary {background:#acbce1}
        .shell[data-theme="trek"] .trek-header .speed-panel[data-speed-style] {position:absolute;left:64%;top:10%;width:33.6%;height:60%;box-sizing:border-box;background:black;border:0;padding:0;display:flex;align-items:center;justify-content:space-around;gap:0}
        .trek-header .speed-view {padding:0;flex:1}
        .trek-header .speed-values {justify-content:space-around}
        .trek-header .speed-panel[data-speed-style="gauges"] .instrument {width:6.6cqw}
        .trek-header .instrument svg ~ .reading {font-size:1.45cqw}
        .trek-header .instrument small,.trek-header .instrument strong {font-size:.9cqw}
        .trek-header .speed-action {min-width:0;width:25%}
        .trek-header [data-id="speedtestdotnet"] {position:absolute;left:72%;top:25%}
        .shell[data-theme="trek"] .trek-header .server-info {position:absolute;left:21%;bottom:0;width:76.6%;height:19%;box-sizing:border-box;display:flex;padding:0;border:0;align-items:stretch;background:black}
        .shell[data-theme="trek"] .trek-header .server-info[hidden] {display:none}
        .trek-header .server-info dl {flex:1;display:flex;align-items:stretch}
        .shell[data-theme="trek"] .trek-header .server-info :is(h2,dl div) {flex:auto;display:flex;align-items:center;justify-content:center;padding:0 2px;font-size:clamp(9px,1cqw,16px);line-height:1;background:#402d1b}
        .shell[data-theme="trek"] .trek-header .connection {
          left:47.85%;width:14.2%;top:26%;height:26%;border:1px solid #739173;
          border-radius:1.3cqw;background:linear-gradient(#253525,#101910);color:#dbebd7;
        }
        .trek-header .header-actions {left:47.65%;top:4%;width:15%;height:15%;gap:2px}
        .shell[data-theme="trek"] .trek-header .speed-panel[data-speed-style] {
          left:63.75%;top:9%;width:33.8%;height:63%;padding:0 .45cqw;
          border:0;background:transparent;box-shadow:none;
        }
        .shell[data-theme="trek"] .trek-header .speed-panel button.speed-view {
          background:transparent;box-shadow:none;border:0;justify-content:center;
        }
        .trek-header .speed-view .speed-values {width:100%;flex-wrap:nowrap}
        .shell[data-theme="trek"] .trek-header .server-info {
          width:78.5%;gap:2px;background:transparent;flex-wrap:nowrap;
        }
        .shell[data-theme="trek"] .trek-header .server-info h2 {flex:0 0 auto;padding-inline:.45cqw}
        .shell[data-theme="trek"] .trek-header .server-info dl {flex:1 1 auto;min-width:0;flex-wrap:nowrap;gap:2px}
        .shell[data-theme="trek"] .trek-header .server-info dl div {gap:2px;font-size:clamp(8px,.91cqw,15px)}
        .shell[data-theme="trek"] .trek-toolbar {justify-content:space-between;margin:2px 0 4px}
      }

      @container (width < 950px) {
        .shell[data-theme="trek"] header.trek-header {display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
        .trek-header .trek-identity {position:relative;width:min(100%,470px);aspect-ratio:475/124;clip-path:polygon(0 0,100% 0,100% 79%,44% 79%,44% 100%,0 100%);background:var(--trek-art) left top/215.58% auto no-repeat}
        .trek-header .trek-identity>div {position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}
        .shell[data-theme="trek"] .trek-header .trek-badge {position:absolute;inset:0 auto 0 0;width:26%;opacity:0}
        .shell[data-theme="trek"] .trek-header .header-controls {display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;padding:0}
        .trek-header .header-actions {margin-inline-start:auto}
        .shell[data-theme="trek"] .trek-header .speed-panel {order:1;flex:1 0 100%;min-width:0;box-sizing:border-box;justify-content:space-evenly}
        .shell[data-theme="trek"] .trek-header .server-info {order:-1;flex-wrap:wrap;min-width:0}
        .trek-header .speed-view {min-width:0}
        .trek-header .speed-view .speed-values {display:flex;gap:2px;flex-wrap:nowrap}
        .trek-header .speed-panel[data-speed-style="gauges"] .instrument {width:clamp(42px,15cqw,70px)}
        .shell[data-theme="trek"] .trek-header .server-info:not([hidden]) {display:grid;grid-template-columns:minmax(0,1fr);width:100%;box-sizing:border-box}
        .shell[data-theme="trek"] .trek-header .server-info:not([hidden]) {margin-top:calc(-6px - min(5cqw,24px));background:transparent;border:0;padding:0}
        .trek-header .server-info h2 {margin-left:min(44%,207px);align-self:end}
        .trek-header .server-info dl {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr));gap:3px}
        .shell[data-theme="trek"] .trek-header .server-info dl div {min-width:0;white-space:normal;flex-wrap:wrap;justify-content:space-between;overflow-wrap:anywhere}
        .shell[data-theme="trek"] .trek-toolbar {display:grid;grid-template-columns:minmax(0,1fr);gap:5px}
        .trek-toolbar :is(.service-filters,.summary) {display:flex;flex-wrap:wrap;min-width:0}
      }
      @container (width < 950px) {
        .shell[data-theme="trek"] .trek-header .server-info:not([hidden]) {
          display:flex;align-items:stretch;justify-content:flex-start;flex-wrap:wrap;gap:2px;
          margin:0;padding:0;border:0;background:transparent;
        }
        .trek-header .server-info h2 {margin:0;align-self:stretch}
        .trek-header .server-info dl {display:contents}
        .shell[data-theme="trek"] .trek-header .server-info :is(h2,dl div) {
          display:flex;align-items:center;justify-content:center;flex:1 0 auto;
          gap:3px;padding:3px 5px;font-size:11px;line-height:1.25;
        }
      }
      @container (600px <= width < 950px) {
        .shell[data-theme="trek"] header.trek-header {
          grid-template-columns:minmax(0,1fr) minmax(0,1fr);
          grid-template-areas:"identity controls" "identity speed" "server server";
          align-items:center;gap:4px 8px;
        }
        .trek-header .trek-identity {grid-area:identity;width:100%}
        .shell[data-theme="trek"] .trek-header .header-controls {display:contents}
        .trek-header .connection,.trek-header .header-actions {grid-area:controls}
        .shell[data-theme="trek"] .trek-header .connection {justify-self:start;font-size:10px;padding:4px}
        .trek-header .header-actions {justify-self:end}
        .shell[data-theme="trek"] .trek-header .header-actions button {padding:4px;font-size:10px}
        .shell[data-theme="trek"] .trek-header .speed-panel {grid-area:speed;width:100%;flex-wrap:nowrap}
        .trek-header .speed-panel[data-speed-style="gauges"] .instrument {width:clamp(45px,7cqw,66px)}
        .shell[data-theme="trek"] .trek-header .server-info {grid-area:server}
      }
      #mobile-service-filter {display:none}
      @container (max-width:599px) {
        .shell[data-theme] .service-filters button {display:none}
        .shell[data-theme] #mobile-service-filter {display:block;font:inherit;font-size:13px;color:var(--ink);background:var(--theme-raised,#25282c);border:1px solid var(--line);border-radius:6px;padding:5px;min-height:32px}
        .shell[data-theme] .summary {display:flex;align-items:center;gap:4px 10px;flex-wrap:wrap;margin:4px 0}
        .shell[data-theme] .summary .count {display:inline-flex;align-items:baseline;gap:3px;padding:0;min-height:0;border:0;box-shadow:none;background:none;font-size:11px}
        .shell[data-theme] .summary .count b {font-size:13px;text-shadow:none}
        .shell[data-theme] .header-controls {width:100%;justify-content:space-between;gap:4px}
        .shell[data-theme] .header-controls :is(.connection,.theme-open,.primary) {padding:4px 7px;font-size:12px}
        .shell[data-theme] .header-actions button {min-height:32px}
        .shell[data-theme] .header-controls .speed-panel {order:1;width:100%;box-sizing:border-box;justify-content:space-between}
      }
      .shell[data-theme] .header-controls .speed-panel[data-speed-style] {flex-wrap:nowrap;min-width:0}
      .shell[data-theme] .speed-panel .speed-view {flex:1 1 0;min-width:0}
      .shell[data-theme] .speed-panel .speed-view .speed-trend {display:block;flex:1 1 0;width:auto;min-width:0}
      .shell[data-theme] .speed-view .speed-trend .speed-chart {width:100%;height:32px}
      .shell[data-theme] .speed-view .speed-chart path {vector-effect:non-scaling-stroke}
      .shell[data-theme] .speed-panel .speed-view .speed-values {width:auto;flex:0 0 auto;display:grid;gap:1px}
      .shell[data-theme] .speed-panel .speed-action {width:auto;flex:0 0 auto}
      .shell[data-theme] .speed-panel[data-speed-style="rails"] .speed-values,
      .shell[data-theme] .speed-panel[data-speed-style="gauges"] .speed-values {flex:1 1 0;min-width:0}
      .shell[data-theme] .speed-panel[data-speed-style="rails"] .speed-values {grid-template-columns:minmax(0,1fr);justify-items:stretch}
      .shell[data-theme] .speed-panel[data-speed-style="rails"] .rail {flex:1 1 0;width:auto;min-width:0}
      .shell[data-theme] .speed-panel[data-speed-style="gauges"] .speed-values {grid-template-columns:repeat(3,minmax(0,1fr));justify-items:center}
      .shell[data-theme] .speed-panel[data-speed-style="gauges"] .instrument {width:100%;max-width:80px}
      @container (min-width:600px) {
        .shell:not([data-theme="trek"]) .header-controls .speed-panel {flex:1 1 250px}
      }
      .trek-filter-row {display:contents}
      .trek-filter-row .header-actions {display:none}
      @container (max-width:599px) {
        .shell[data-theme="trek"] header.trek-header {grid-template-areas:"identity" "server" "speed"}
        .trek-header .trek-identity {grid-area:identity;width:100%}
        .shell[data-theme="trek"] .trek-header .header-controls {display:contents}
        .trek-header .header-controls .header-actions {display:none}
        .shell[data-theme="trek"] .trek-header .connection {
          grid-area:identity;z-index:1;align-self:end;justify-self:stretch;
          margin:0 0 0 45%;box-sizing:border-box;min-width:0;min-height:0;
          justify-content:center;gap:4px;padding:1px 3px;font-size:clamp(10px,2.9cqw,14px);line-height:1.25;
        }
        .trek-header .server-info {grid-area:server}
        .trek-header :is(.speed-panel,[data-id="speedtestdotnet"]) {grid-area:speed}
        .trek-filter-row {display:flex;align-items:center;justify-content:space-between;gap:4px}
        .trek-filter-row .header-actions {display:flex;flex-wrap:nowrap;margin-inline-start:auto}
        .trek-filter-row .header-actions button {min-height:32px;padding:4px 8px;font-size:12px}
        .trek-filter-row .service-filters {min-width:0}
        .trek-filter-row select {max-width:100%}
      }
      .shell[data-theme] header.regular-header {
        display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:6px;
      }
      .regular-header .header-controls {display:contents}
      .shell[data-theme] .regular-header .connection {grid-column:2;grid-row:1;justify-self:end;margin:0}
      .shell[data-theme] .regular-header :is(.speed-panel,[data-id="speedtestdotnet"]) {grid-column:1/-1;grid-row:2}
      .regular-header [data-id="speedtestdotnet"] {justify-self:start}
      .regular-filter-row {display:flex;align-items:center;justify-content:space-between;gap:6px;margin:6px 0 3px}
      .regular-filter-row .header-actions {margin-inline-start:auto;flex-wrap:nowrap}
      .regular-filter-row .service-filters {margin:0;min-width:0}
      .regular-filter-row .service-filters button {display:none}
      .shell[data-theme] .regular-filter-row #mobile-service-filter {display:block;max-width:100%;min-height:32px;padding:4px 7px;font:inherit;font-size:13px;color:var(--ink);background:var(--theme-raised,#25282c);border:1px solid var(--line);border-radius:6px}
      @container (max-width:420px) {
        .regular-header .connection {font-size:10px;padding:4px 6px}
        .regular-header h1 {font-size:clamp(20px,6cqw,26px)}
        .regular-filter-row .header-actions button {min-height:32px;padding:4px 7px;font-size:12px}
      }
      .shell[data-theme] .regular-filter-row :is(#mobile-service-filter, .header-actions button) {
        box-sizing:border-box;height:32px;min-height:32px;padding:0 8px;border-width:1px;
        border-radius:6px;font-size:13px;line-height:1.1;white-space:nowrap;
      }
      .regular-filter-row .header-actions {display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
      .regular-filter-row .header-actions:has(> :only-child) {grid-template-columns:auto}
    </style><main class="shell" data-theme="${this.theme}" data-mobile-layout="${this.mobileLayout}">
      <dialog class="phone-dialog" aria-label="Choose notification phone"><h2>Choose notification phone</h2>
        ${phones.length ? `<p>Use this phone for Outage Map alerts. Notifications will turn on for this service.</p><label>Phone <select>${phones.map(key => `<option value="${escape(key)}">${escape(key.slice(11).replaceAll("_"," "))}</option>`).join("")}</select></label><button data-action="save-phone">Enable notifications</button>` : "<p>No phones registered for notifications. Connect the Home Assistant Companion App and allow notifications, then reopen this picker.</p>"}
        <button data-action="cancel-phone">Cancel</button></dialog>
      <dialog class="theme-dialog" aria-labelledby="ow-theme-title">
        <div class="row"><h2 id="ow-theme-title">Dashboard settings</h2><button type="button" data-action="close-themes" aria-label="Close settings">×</button></div>
        <label class="language-setting"><span>Language</span> <select id="dashboard-language">${Object.entries(DASHBOARD_LANGUAGES).map(([code,name]) => `<option value="${code}" ${code === this.language ? "selected" : ""}>${name}</option>`).join("")}</select></label>
        <div class="theme-grid">${Object.entries(THEMES).map(([id,[name,description,bg,edge,accent]]) => `
          <button type="button" class="theme-choice" data-action="choose-theme" data-id="${id}" aria-pressed="${this.theme === id}">
            <span class="theme-swatch" aria-hidden="true" style="--swatch-bg:${bg};--swatch-edge:${edge};--swatch-accent:${accent}"></span>
            <span><strong>${name}</strong><small>${description}</small></span>
          </button>`).join("")}</div>
        <fieldset class="layout-options">
          <legend>Mobile layout</legend>
          ${[["single","One column"],["double","Two columns"]].map(([id,name]) =>
            `<button type="button" data-action="mobile-layout" data-id="${id}" aria-pressed="${this.mobileLayout === id}">${name}</button>`).join("")}
          <p class="muted">Applies on narrow screens and is saved in this browser.</p>
        </fieldset>
        <fieldset class="layout-options">
          <legend>Speedtest style</legend>
          <div class="speed-style-controls">${Object.entries(SPEED_STYLES).map(([id,name]) =>
            `<button type="button" data-action="speed-style" data-id="${id}" aria-pressed="${this.speedStyle === id}">${name}</button>`).join("")}</div>
        </fieldset>
        <fieldset class="layout-options">
          <legend>Server info</legend>
          <button type="button" data-action="server-info" aria-pressed="${this.showServerInfo}">${this.showServerInfo ? "Hide server info" : "Show server info"}</button>
          <p class="muted">Show host metrics from your existing Home Assistant sensors.</p>
        </fieldset>
      </dialog>
      <dialog class="speed-dialog" aria-labelledby="ow-speed-title">
        <div class="row"><h2 id="ow-speed-title">Speedtest history</h2><button type="button" data-action="close-speed-history" aria-label="Close Speedtest history">×</button></div>
        <div class="speed-ranges" role="group" aria-label="History period">
          ${Object.entries(SPEED_RANGES).map(([days,label]) => `<button type="button" data-action="speed-range" data-id="${days}">${label}</button>`).join("")}
        </div>
        <p class="muted">Shows recorded sensor changes. Longer ranges can be incomplete if Home Assistant has purged older history.</p>
        <div class="speed-log"></div>
      </dialog>
      <header class="${trek ? "trek-header" : "regular-header"}"><div class="${this.theme === "trek" ? "trek-identity" : ""}">${this.theme === "trek" ?
        '<a class="trek-badge" href="/outage_watch/star-trek-badge.jpg" target="_blank" rel="noopener" aria-label="Open full-size Star Trek badge"><img src="/outage_watch/star-trek-badge.jpg" alt="United Network Federation · Outage Map &amp; Monitoring" width="2048" height="2048"></a>' : ""}<div><h1>Outage Map</h1><p>Your services, at a glance.</p></div></div><div class="header-controls">${connection}${this.speedHeader()}${trek ? headerActions : ""}${trek ? this.serverInfo() : ""}</div></header>
      ${this.loadError ? `<p class="notice" role="status">${escape(this.loadError)}</p>` : ""}
      ${this.error ? `<p class="notice danger" role="alert">${escape(this.error)}</p>` : ""}
      ${connected === false ? '<div class="banner warning"><strong>Internet connectivity may be disrupted</strong><p>Home Assistant couldn’t reach either connectivity check. Service alerts are paused.</p></div>' :
        incident ? `<div class="banner"><strong>${escape(this.translate("{service} is reporting an incident").replace("{service}", () => incident.name))}</strong><p data-provider-text>${escape(incident.incident || this.translate("See official status for details."))}</p></div>` : ""}
      ${this.adding ? `<section class="add-box"><div class="row"><h2>Track a service</h2><button data-action="cancel">Close</button></div>
        <div class="catalog-controls"><input id="search" type="search" aria-label="Search catalog" placeholder="Search catalog">
        <select id="catalog-category" aria-label="Service category"><option value="">All categories</option>
        ${categories.map((name) => `<option value="${escape(name)}">${escape(name)}</option>`).join("")}</select></div>
        <div class="catalog">${catalog.filter((item) => !services.some((service) => service.id === item.id)).map((item) => `<button data-search="${escape(item.name)}" data-category="${escape(item.category)}" data-action="track" data-id="${escape(item.id)}">${escape(item.name)}</button>`).join("")}</div>
        <p class="muted catalog-empty" hidden>No matching catalog services.</p>
        <form><input name="name" aria-label="Service name" placeholder="Service name" maxlength="80" required><input name="url" type="url" aria-label="Public HTTP URL" placeholder="https://example.com" required><button class="primary">Track URL</button></form></section>` : ""}
      ${this.theme === "trek" ? "" : this.serverInfo()}
      ${trek ? `<div class="trek-toolbar"><div class="trek-filter-row">${filterBar}${headerActions}</div>${summary}</div>` : `<div class="regular-filter-row">${filterBar}${headerActions}</div>${summary}`}
      <div class="layout ${selected ? "with-detail" : ""}">
        <div class="tiles">${visible.map((item) => `<button class="tile" data-action="select" data-id="${escape(item.id)}" aria-pressed="${selected?.id === item.id}">
          <strong class="identity" title="${escape(item.name)}">${icons(item.icon || "link-variant")}<span class="service-name">${escape(item.name)}</span></strong>
          <span class="tile-meta"><span class="muted">${escape(item.signal)}${item.feed_scope ? " · " + escape(item.feed_scope) : ""}${item.paused && item.signal === "Feed only" ? " · Checks paused" : ""}${!item.paused && item.signal !== "Checks only" && !item.feed_fresh ? " · Feed unavailable" : ""}</span><span class="pill ${escape(item.status)}">${label(item)}</span></span>
          <span class="spark">${graph(item)}<strong>${item.latency == null ? "—" : `${escape(item.latency)} ms`}</strong></span>
          <span class="muted">${item.signal === "Feed only" ? "Feed refreshed" : "Checked"} ${timestamp(item.checked || item.feed_checked,this.language)}</span>
        </button>`).join("") || (this.data ? `<p class="muted">${can_manage ? "No services tracked yet." : "No services available to view."}</p>` : "")}</div>
        ${selected ? `<aside class="detail"><div class="row"><h2 class="identity">${icons(selected.icon || "link-variant")}${escape(selected.name)}</h2><button aria-label="Close details" data-action="close">×</button></div>
          <div><span class="pill ${escape(selected.status)}">${label(selected)}</span><p class="muted">${selected.reason === "unreachable" ? "Home Assistant could not reach this endpoint." : selected.signal === "Checks only" ? "This tile reflects checks from your network." : escape(selected.signal)}</p></div>
          ${selected.incident ? `<p data-provider-text>${escape(selected.incident)}</p>` : ""}
          <div class="plot"><div class="row"><h3>Response time · 24 hours</h3>${selected.baseline == null ? "" : `<span class="muted">Baseline ${escape(selected.baseline)} ms</span>`}</div>${graph(selected,true,this.language)}</div>
          ${selected.components?.length ? `<div><h3>Affected components</h3><div class="chips">${selected.components.map((name) => `<span>${escape(name)}</span>`).join("")}</div></div>` : ""}
          <p class="muted">Last successful feed update ${timestamp(selected.feed_checked,this.language)}</p>
          <div class="actions">${link(selected.official, selected.name === "Spotify" ? "Spotify ongoing issues" : "Official status")}${link(selected.crowd,"Downdetector")}</div>
          ${can_manage ? `<footer class="actions"><button data-action="alerts" aria-pressed="${!!selected.alerts}">Notifications ${selected.alerts ? "on" : "off"}</button>
          ${selected.can_pause ? `<button data-action="pause-tracking">${selected.paused ? "Resume Tracking" : "Pause Tracking"}</button>` : ""}
          ${this.confirmRemove ? '<button data-action="cancel-remove">Cancel</button><button class="danger" data-action="remove">Confirm removal</button>' : '<button data-action="confirm">Remove service</button>'}</footer>` : ""}
        </aside>` : ""}
      </div><p class="muted notice">Charts show response time. A reachable endpoint can still have partial outages.</p>
    </main>`;
    this.shadowRoot.querySelector("main").lang = this.language;
    this.localize(this.shadowRoot);
    this.syncAppearance();
  }
}
if (!customElements.get(TAG)) {
  customElements.define(TAG, OutageWatchCard);
  window.customCards = window.customCards || [];
  window.customCards.push({type: TAG, name: "Outage Map", description: "Provider incidents and local reachability."});
}
