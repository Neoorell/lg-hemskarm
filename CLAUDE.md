# CLAUDE.md

Egen hemskärm för en rootad LG-TV. Ägaren skriver på svenska och är ny på terminal och
rootning: svara på svenska, förklara enkelt och skriv ut exakt vilka kommandon som ska köras och
**var** (Macen eller TV:n). Repot är publikt – lägg aldrig in lösenord eller andra hemligheter här.

## Större uppgifter: fråga om en egen chatt först

Ägarens önskemål 2026-10-29: när ägaren ber om en större uppgift, till exempel en ny funktion i flera steg, en ny design
eller något annat som tar många steg, fråga först om den ska göras i en egen sidochatt (en ny session) i stället för i den
pågående chatten. En ny chatt börjar med lite historik och drar därför färre tokens. I Claude Code-appen: erbjud en ny
session (knapparna "New session" / "Do it here"). Små ändringar, frågor och uppföljningar på det som just gjorts stannar
i chatten utan att fråga.

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
- [x] Uppdatera till 2.1.1 på TV:n och bekräfta att HOME öppnar hemskärmen med riktiga fjärrkontrollen.
- [x] Bekräfta att LG:s ikoner syns i 2.1.3 (2.1.2 visade reservloggorna eftersom bilderna blockerades).
- [x] 2.3.0 på TV:n: menyn, BACK och HOME fungerar med riktiga fjärrkontrollen.
- [ ] 2.4.0: applistan (BACK två gånger) och snabbstart av TV4 med riktiga fjärrkontrollen.
- [ ] Väderort: ägaren har inte sagt vilken ort – standard är Stockholm (väljs nu i menyn).
- [ ] Eventuell egen bakgrundsbild (`bakgrund.jpg`, se GUIDE.md).

Hemskärmen är installerad på TV:n. Tjänsten i 2.1.1 är testad på den riktiga TV:n med inskickade knapptryck.

## Projektet

- `app/index.html` – hemskärmen (webbapp). Standardvärden (appar, ingångar, bakgrund) överst under `INSTÄLLNINGAR`.
- `app/meny.js` – inställningsmenyn (kugghjulet eller gula knappen 405). Sparar vid stängning genom
  `luna://org.webosbrew.hbchannel.service/exec` → `sh /media/developer/custom_home/hem spara <base64-JSON>`;
  tjänsten rensar värdena (`cleanSettings`) och skriver `installningar.js` (och `plats.conf` + vädret vid ny ort).
  Uppdateringar installeras med `hbchannel.service/install` `{id, ipkUrl, ipkHash}` från `repo.json`.
  Sidan får inte anropa `applicationManager/getAppInfo`; den installerade versionen tas från `tvapps.js`.
  Apparnas ID letas upp via deras namn på TV:n (`hitta`), så ID:n behöver inte vara kända.
- `app/setup/customhome.js` – bakgrundstjänst som körs på TV:ns node: startar hemskärmen vid HOME-tryck
  (läser `/dev/input/event*` utan att låsa) och vid påslag (`luna://com.webos.service.tvpower`),
  skriver app-listan och vädret (Open-Meteo via curl) till `/media/developer/custom_home/`, och startar om
  sig själv när filen byts ut vid en uppdatering.
- `app/setup/setup.sh` – körs en gång som root: hittar node, lägger autostart i
  `/var/lib/webosbrew/init.d/50-customhome`, lär in HOME-knappens kod. `uninstall.sh` tar bort det.
- Användardata på TV:n ligger i `/media/developer/custom_home/` (bakgrund.jpg, plats.conf, homekey.conf,
  tvapps.js, ikoner.js, bakgrund.js, weather.js, installningar.js) och överlever uppdateringar.
- `build/build_ipk.py` – bygger `.ipk` och Homebrew Channel-filerna till `release/`.
- `GUIDE.md` – ägarens guide på svenska. Håll den i synk med ändringar.

## Begränsningar som måste respekteras

- **webOS 4.5:s webbläsare är Chromium 53.** I `index.html`: ingen `inset`, flex-`gap`, CSS grid, `min()/max()`,
  `backdrop-filter`, `scrollTo({behavior})`. Bara ES5 (var/function, inga pilar, mallsträngar, let/const).
  Fjärrkontrollen skickar `keyCode` (37–40 pilar, 13 OK, 461 BACK, 405 gul). BACK når bara sidan tack vare
  `"disableBackHistoryAPI": true` i `appinfo.json`; utan den stänger BACK hemskärmen och LG:s meny syns.
- **Vid uppstart saknar tjänsten PATH** (Homebrew Channels init.d); bara /bin och /usr/bin hittas. Därför sätter
  `customhome.js` PATH själv överst. Testa uppstartsändringar med en riktig omstart (`reboot` över SSH).
- **node 0.12** för `customhome.js`: samma ES5-regler, `new Buffer`, inga löften/async.
  **Läs aldrig `/dev/input` med `fs.read`**: varje väntande läsning låser en av trådpoolens 4 trådar
  (`UV_THREADPOOL_SIZE` går inte att höja inifrån) och hela node fryser vid nästa `spawn`/`execFile`.
  `watchKeys` läser därför varje enhet via en egen `cat`-process. Avsluta med `hardExit()` så att
  `cat`-processerna och `luna-send` stängs.
- **Kallstart:** skärmen tänds ~13 s efter strömpåslag, men Homebrew Channel kör `init.d` först runt 40 s
  (efter sina egna steg i `startup.sh`, som inte får ändras). HOME går till LG fram till dess; tjänsten öppnar
  hemskärmen så fort den är igång (`uppstart`). Med Quick Start+ på blir avstängning viloläge och tjänsten
  fortsätter köra.
- TV:n har 6–9 indataenheter (event0–5 alltid; "IoT keypad", "Smart Remote RCU Input" och "LGE Network Input"
  dyker upp senare), resten av event0–31 saknar enhet (ENXIO). Nya enheter letas upp var 3:e sekund. Fjärrkontrollen är
  "LGE RCU" på `event1`, HOME = kod 773.
- **Hemskärmen får inte ladda bilder utanför appens mapp** (`<img>`/`new Image()` med `file:///media/...`
  ger fel), men `<script src="file:///media/developer/custom_home/...">` fungerar. Bilder från TV:n
  (app-ikoner, `bakgrund.jpg`) skrivs därför av tjänsten som data-URL:er i `ikoner.js` och `bakgrund.js`.
- Appens `trustLevel` ska vara `default` (`trusted` avvisas för tredjepartsappar).

## LG:s hemrad och bakgrundsfunktioner (`setupLg` i customhome.js)

- **LG:s hemrad ersätts** (som Homebar gör): tjänsten patchar LG:s
  `/usr/palm/applications/com.webos.app.home/qml/main.qml` på TV:n (`patchLgHomeQml`: en `Timer` som anropar
  `interfaces.application.launchApp("se.minhemskarm.launcher", …)` när `start(mode)` får `home`/`main`),
  bind-monterar kopian från `custom_home/lghome/`, gömmer CRIU-minnesbilderna
  (`/mnt/lg/cmn_data/checkpoint/com.webos.app.home`, `/tmp/checkpoint/…`) och dödar `com.webos.app.home`.
  LG:s fil är upphovsrättsskyddad – lägg den aldrig i repot. Matchar filen inte (firmwareuppdatering) lämnas den.
  Knappbevakningen är då bara reserv (startar Hemskärm om den inte syns 2,5 s efter HOME).
  HDMI → HOME → Hemskärm tar ~1,3 s. Sidan får `webOSRelaunch` i stället för att laddas om.
- **Reklam:** `/etc/hosts` bind-monteras med `BLOCKED_HOSTS` (lgsmartad, ngfts/ACR, ibs.lgappstv, cjpowercast).
- **Upstart-jobb stoppas:** admanager, contentminer, nudge, uploadd, rdxd (`initctl stop`).
- **Förladdade appar:** tjänsten prenumererar på `applicationManager/running`; YouTube och webbläsaren stängs
  6 s efter att de dykt upp om de inte har synts (Netflix ska ägaren ha kvar). Appar i `snabbstart`
  (standard TV4 Play, högst två) förladdas med `launch {preload:"full"}` när TV:n är på, minnet > 150 MB och
  appen inte stängts i applistan senaste 30 min (`/tmp/hemskarm-stangda`).
- **Applistan** (`app/vaxlare.js`, BACK två gånger; menyns panel: ▲▼ väljer, OK stänger, ▶ öppnar, sista raden Stäng alla): läser `korande.js` som tjänsten skriver vid varje ändring
  (direkt), stänger via `hbchannel exec` → `setup/appar.sh stang …` (exec tar 1–3 s, kortet försvinner direkt).
  Sidan får inte anropa `running` eller `closeByAppId` själv.
- `luna-send` skriver inget inne i `$(...)` i skalskript – skriv till en fil i stället (se `appar.sh`).
- **4K går inte för grafiken:** compositorn kör `STARFISH_SCREEN_WIDTH/HEIGHT=1920×1080`; video är 4K i eget lager.
- Testat med två omstarter: HOME från HDMI → Hemskärm 1,7 s första gången, sedan ~0,9 s.
- Minne före/efter: 188 → 366 MB tillgängligt av 1 GB. `uninstall.sh` tar bort allt direkt.

## Ikonerna

`customhome.js` läser varje apps `mediumLargeIcon || largeIcon || icon` och skriver dem som data-URL:er
i `ikoner.js` (`window.TV_IKONER[id]`), och `iconColor` i `tvapps.js`.
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
