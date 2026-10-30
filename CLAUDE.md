# CLAUDE.md

Egen hemskärm för en rootad LG-TV. Ägaren skriver på svenska och är ny på terminal och
rootning: svara på svenska, förklara enkelt och skriv ut exakt vilka kommandon som ska köras och
**var** (Macen eller TV:n). Repot är publikt – lägg aldrig in lösenord eller andra hemligheter här.

## TV:n

- LG 43UM7100PLB (UM71, 2019), firmware 05.40.97, webOS 4.5 (systemversion 4.10.2), chassi k5lp, ARM 32-bit.
- Rootad med SlopBro, Homebrew Channel installerat, SSH påslaget. TV:n har legat på `192.168.0.222`
  (kan ändras): `ssh root@192.168.0.222`. Macen loggar in med nyckeln `~/.ssh/lg_tv` (inställd i
  `~/.ssh/config`), så Claude kan köra kommandon på TV:n direkt med `ssh -o BatchMode=yes root@192.168.0.222 '…'`.
  Lösenordsinloggning stängs av efter omstart när en nyckel finns.
- Testa knapptryck utan fjärrkontroll: skriv `struct input_event` (16 byte, typ 1, kod, värde 1/0)
  till `/dev/input/event1`. Det når både LG:s system och tjänsten.
- **Ingen python** på TV:n. **node finns** (webOS 4 har node 0.12), även om det inte alltid ligger i PATH
  för SSH-skalet. `curl` finns och klarar GitHub/HTTPS.
- TV:n har två LG-hemskärmar; "Home screen" är satt till **Basic** och ska vara kvar så.
- Prompten `root@LGwebOSTV` = TV:n, `neoorell@MacBook-Air` = Macen. Ägaren har tidigare råkat köra
  TV-kommandon på Macen – påpeka det om utskriften ser ut att komma från Macen.

## Status

- [x] TV rootad, SSH fungerar.
- [x] Homebar (rawinek/webos-homebar) testades och installerades, men har ingen bakgrundsbild,
  så ägaren vill ha den här hemskärmen i stället.
- [x] Avinstallera Homebar: `sh /var/lib/webosbrew/rawin-launcher/uninstall.sh` (på TV:n). `setup.sh` vägrar köra annars.
- [x] Lägg till app-källan i Homebrew Channel och installera **Hemskärm** (se GUIDE.md steg 2).
- [x] Kör `setup.sh` en gång (GUIDE.md steg 3). I 2.1.0 frös tjänsten direkt (se Begränsningar); rättat i 2.1.1.
- [ ] Uppdatera till 2.1.1 på TV:n och bekräfta att HOME öppnar hemskärmen med riktiga fjärrkontrollen.
- [ ] Väderort: ägaren har inte sagt vilken ort – standard är Stockholm (`plats.conf`, se GUIDE.md).
- [ ] Eventuell egen bakgrundsbild (`bakgrund.jpg`, se GUIDE.md).

Hemskärmen är installerad på TV:n. Tjänsten i 2.1.1 är testad på den riktiga TV:n med inskickade knapptryck.

## Projektet

- `app/index.html` – hemskärmen (webbapp). Inställningar (appar, ingångar, bakgrund) överst under `INSTÄLLNINGAR`.
  Apparnas ID letas upp via deras namn på TV:n (`hitta`), så ID:n behöver inte vara kända.
- `app/setup/customhome.js` – bakgrundstjänst som körs på TV:ns node: startar hemskärmen vid HOME-tryck
  (läser `/dev/input/event*` utan att låsa) och vid påslag (`luna://com.webos.service.tvpower`),
  skriver app-listan och vädret (Open-Meteo via curl) till `/media/developer/custom_home/`, och startar om
  sig själv när filen byts ut vid en uppdatering.
- `app/setup/setup.sh` – körs en gång som root: hittar node, lägger autostart i
  `/var/lib/webosbrew/init.d/50-customhome`, lär in HOME-knappens kod. `uninstall.sh` tar bort det.
- Användardata på TV:n ligger i `/media/developer/custom_home/` (bakgrund.jpg, plats.conf, homekey.conf,
  tvapps.js, weather.js) och överlever uppdateringar.
- `build/build_ipk.py` – bygger `.ipk` och Homebrew Channel-filerna till `release/`.
- `GUIDE.md` – ägarens guide på svenska. Håll den i synk med ändringar.

## Begränsningar som måste respekteras

- **webOS 4.5:s webbläsare är Chromium 53.** I `index.html`: ingen `inset`, flex-`gap`, CSS grid, `min()/max()`,
  `backdrop-filter`, `scrollTo({behavior})`. Bara ES5 (var/function, inga pilar, mallsträngar, let/const).
  Fjärrkontrollen skickar `keyCode` (37–40 pilar, 13 OK).
- **node 0.12** för `customhome.js`: samma ES5-regler, `new Buffer`, inga löften/async.
  **Läs aldrig `/dev/input` med `fs.read`**: varje väntande läsning låser en av trådpoolens 4 trådar
  (`UV_THREADPOOL_SIZE` går inte att höja inifrån) och hela node fryser vid nästa `spawn`/`execFile`.
  `watchKeys` läser därför varje enhet via en egen `cat`-process. Avsluta med `hardExit()` så att
  `cat`-processerna och `luna-send` stängs.
- TV:n har 9 indataenheter (event0–8, resten av event9–31 saknar enhet). Fjärrkontrollen är
  "LGE RCU" på `event1`, HOME = kod 773.
- Appens `trustLevel` ska vara `default` (`trusted` avvisas för tredjepartsappar).

## Ikonerna

`customhome.js` kopierar varje apps `mediumLargeIcon || largeIcon || icon` till
`/media/developer/custom_home/ikoner/<id>.png` och skriver `ikon` och `iconColor` i `tvapps.js`.
Samma val som LG:s hemrad (`/usr/palm/applications/com.webos.app.home/qml/Containers/Main/AppTile.qml`):
115×115-ikonen på `iconColor`. Ägaren vill ha de breda, rundade rutorna (220×132) med LG:s loggor
och färger i (provade kvadratiska och förstorade/beskurna ikoner, ville inte ha dem).

## Bygga och släppa en ny version

**Installera inte en opublicerad version på TV:n** (t.ex. via `appInstallService/dev/install`):
Homebrew Channel ser att versionen skiljer sig från `repo.json` och installerar tillbaka den publicerade.
Testa i stället med `CUSTOMHOME_DIR=/tmp/…` och en förhandsvisning på Macen, och publicera sedan.


1. Höj `version` i `app/appinfo.json` (annars ser Homebrew Channel ingen uppdatering).
2. `python3 build/build_ipk.py`
3. Checka in allt inklusive `release/` och pusha till `main`. Homebrew Channel läser
   `https://raw.githubusercontent.com/Neoorell/lg-hemskarm/main/release/repo.json`.
   (GitHub-releaser används inte.)

## Testa

- Webbsidan: Playwright/Chromium i 1920×1080 med en låtsad `window.PalmServiceBridge` och
  `window.TV_APPS` / `window.TV_WEATHER`.
- Tjänsten: kör med node 0.12 (nodejs.org/dist/v0.12.18) och låtsade `luna-send`/`curl` i PATH,
  `CUSTOMHOME_DIR` och `CUSTOMHOME_INPUT` pekade på tillfälliga mappar, och en FIFO som indataenhet.
- På riktigt: `cat /tmp/customhome.log` på TV:n, och `sh /media/developer/custom_home/hem learn|apps|weather`.

Bygger på github.com/NaveenDA/lg-webos-custom-home (MIT).
