# Egen hemskärm för LG 43UM7100PLB (webOS 4.5)

En hemskärm i Luma- och Apple TV-stil:
- **bakgrundsbild** som fyller hela skärmen (din egen eller ett bergsfoto)
- **stor klocka och datum** uppe till vänster, **väder** uppe till höger
- **HDMI 1 och HDMI 2** och apparna **Stremio, TV4 Play, SVT Play, Netflix, YouTube, HBO Max och Prime Video**
- öppnas när du trycker **HOME** och när du **slår på TV:n**
- **uppdateras via Homebrew Channel**, precis som andra homebrew-appar
- **ersätter LG:s meny**, blockerar LG:s reklamservrar och stänger av LG:s reklam- och statistiktjänster,
  så att TV:n får mer ledigt minne och blir snabbare

Projektet: https://github.com/Neoorell/lg-hemskarm

Kommandona nedan körs i **Terminal på Macen**. Det står vid varje steg om du ska vara
på **Macen** (`neoorell@MacBook-Air`) eller inloggad på **TV:n** (`root@LGwebOSTV`).

---

## Steg 1 – Ta bort Homebar (på TV:n)

Homebar och den här hemskärmen kan inte båda ta HOME-knappen.

```sh
ssh root@192.168.0.222
sh /var/lib/webosbrew/rawin-launcher/uninstall.sh
```

Låt TV:ns "Home screen" stå kvar på **Basic**. Det är den lättaste menyn och den blinkar minst.

## Steg 2 – Lägg till app-källan i Homebrew Channel (på TV:n)

1. Öppna **Homebrew Channel** och gå till **Settings**.
2. Lägg till den här adressen bland de extra repositories (app-källor):
   ```
   https://raw.githubusercontent.com/Neoorell/lg-hemskarm/main/release/repo.json
   ```
3. Gå tillbaka till listan med appar. **Hemskärm** finns nu där. Välj den och tryck **Install**.

> Går det inte att lägga till adressen kan du installera manuellt i stället, se
> "Manuell installation" längst ner.

## Steg 3 – Koppla HOME-knappen, bara första gången (på TV:n)

```sh
sh /media/developer/apps/usr/palm/applications/se.minhemskarm.launcher/setup/setup.sh
```

Skriptet hittar TV:ns node, installerar bakgrundstjänsten, läser in dina appar och hämtar vädret.
Sist ber det dig **trycka HOME tre gånger** på fjärrkontrollen, så att den lär sig rätt knapp.

Tryck HOME. Klart! 🎉

> Direkt efter att TV:n slagits på kan LG:s meny synas den första halvminuten. Sedan tar Hemskärm över.

## Det här stänger Hemskärm av hos LG

Allt görs på nytt vid varje start och ändrar inga systemfiler. Tas Hemskärm bort är allt som förut.
- **LG:s meny** (hemraden): HOME öppnar Hemskärm direkt i stället.
- **Reklam och spårning:** LG:s reklamservrar och Live Plus (som känner igen vad du tittar på) blockeras,
  och tjänsterna för reklam, rekommendationer, tips och statistik stoppas.
- **Förladdade appar:** YouTube och webbläsaren stängs så fort LG förladdar dem i bakgrunden.
  De öppnas som vanligt när du väljer dem. Netflix och övriga appar rörs inte.

**Om 4K:** menyer och appar ritas i 1920×1080 på den här TV:n (LG:s grafiklager), men film och serier
visas i 4K när innehållet finns i 4K, eftersom videon har ett eget lager.

---

## Inställningar på TV:n

Markera **kugghjulet** sist bland ingångarna och tryck OK, eller tryck på **gula knappen** på
fjärrkontrollen. Där kan du:
- **Appar på raden:** OK lägger till eller tar bort en app, ◀ ▶ flyttar den.
- **Ingångar:** tomma ingångar (inget anslutet) döljs automatiskt; det går att stänga av.
- **Ingångar:** visa eller dölj HDMI 1–3 och byt namn, t.ex. till "PlayStation".
- **Vid påslag:** välj vad TV:n visar när den slås på, Hemskärm eller en HDMI-ingång (till exempel en
  Google TV-sticka). Står TV:n på en annan HDMI-ingång efter påslag, till exempel för att en PS5 väckte
  den eller för att den ingången var öppen sist, stannar den där. HOME öppnar alltid Hemskärm.
- **Bakgrund:** välj bland några foton, bara stjärnhimmel eller din egen bild. **Växla bakgrund** byter
  bild var 15:e minut. **Ladda upp från mobilen** visar en QR-kod (se nedan).
- **Väder:** välj ort i listan eller sök efter en annan.
- **Snabbstart:** välj upp till två appar som förladdas, så att de öppnas direkt (TV4 Play från början).
- **Ljud ut:** TV-högtalare, soundbar (HDMI ARC), optisk eller Bluetooth.
- **Bild-, ljud- och nätverksinställningar** och **allmänna TV-inställningar:** öppnar TV:ns egna
  inställningar direkt på rätt sida.
- **Uppdateringar:** se om en ny version finns och installera den direkt.

**BACK** går tillbaka ett steg. Ändringarna sparas när du stänger menyn, och hemskärmen laddas om.
BACK en gång på själva hemskärmen gör ingenting, så du hamnar inte i LG:s gamla meny av misstag.

## Hemskärmen

- **Håll OK** på en app på raden för att ändra den: **◀ ▶** flyttar, **▼** tar bort, **OK** klar.
- **Alla appar** sist i raden visar alla appar på TV:n. **OK** öppnar, **gula knappen** lägger till
  eller tar bort appen från raden.
- TV4 Play tar ungefär 20 sekunder att starta från början (TV4-appen är tung); under tiden syns
  TV4:s startbild. Med **Snabbstart** öppnas den direkt.

## Appar som körs (BACK två gånger)

Tryck **BACK två gånger snabbt** på hemskärmen, så visas apparna som ligger i bakgrunden och
hur mycket minne de tar, i samma stil som inställningarna:
- **▲ ▼** väljer app, **OK** stänger den, **▶** öppnar den.
- **Stäng alla** längst ned stänger allihop.
- **BACK** tillbaka till hemskärmen.

En app med snabbstart som du stänger här förladdas inte igen förrän efter en halvtimme.

## Uppdateringar

En röd prick på kugghjulet betyder att en ny version finns. Installera den under
**Inställningar → Uppdateringar**, eller i **Homebrew Channel** som vilken homebrew-app som helst.
Bakgrundstjänsten märker själv att den har uppdaterats och startar om sig inom en minut.
Du behöver **inte** köra `setup.sh` igen.

Din bakgrundsbild, väderort, dina inställningar och HOME-knappens kod finns kvar efter en uppdatering.

## Egen bakgrundsbild

**Enklast, från mobilen:** Inställningar → Bakgrund → **Ladda upp från mobilen**. Skanna QR-koden med
mobilens kamera (mobilen ska vara på samma wifi), välj ett foto, flytta och zooma det så att rätt del
syns och tryck **Spara på TV:n**. TV:n byter till bilden direkt. Sidan på TV:n är öppen i högst
10 minuter och tar emot en bild.

**Från Macen** (Terminal), om du hellre vill: lägg bilden i **Dokument** och kör

```sh
cat ~/Documents/minbild.jpg | ssh root@192.168.0.222 'cat > /media/developer/custom_home/bakgrund.jpg'
```

Vänta cirka 15 sekunder och tryck HOME. Bilden måste vara en **.jpg**, helst 1920×1080.
Välj den under **Inställningar → Bakgrund → Egen bild** om ett annat foto är valt.
Ta bort den med `rm /media/developer/custom_home/bakgrund.jpg` på TV:n.

## Väder för din ort (på TV:n)

Enklast: **Inställningar → Väder** på TV:n. Det går också med ett kommando, med latitud och
longitud (slå upp din ort på t.ex. latlong.net). Exempel för Göteborg:

```sh
printf 'LAT=57.71\nLON=11.97\nORT=Göteborg\n' > /media/developer/custom_home/plats.conf
sh /media/developer/custom_home/hem weather
```

Vädret uppdateras automatiskt var 30:e minut (från Open-Meteo, inget konto behövs).

## Ändra appar, namn och färger i koden

Det mesta görs enklast i menyn på TV:n (se ovan). Det som står överst i `app/index.html` under
**INSTÄLLNINGAR** är standardvärdena, som gäller tills du ändrar något i menyn:
- **Lägga till en app:** kopiera en rad i `APPAR`, ändra `namn`, `hitta` (appens namn på TV:n
  med små bokstäver) och färg. ID:t letas upp automatiskt.
- **Ikonerna** hämtas från TV:n, samma bilder och färger som LG:s hemrad. Färgen och texten i
  `APPAR` används bara för appar som inte finns på TV:n, eller om du sätter `tvIkon: false`.
- **Byta namn på en ingång:** t.ex. `namn: "HDMI 1"` till `namn: "PlayStation"`.
- **Apparna överst:** sätt `INGANGAR_FORST = false`.

Det enklaste är att säga vad du vill ändra, så lägger jag upp en ny version som dyker upp
i Homebrew Channel.

Appar du installerar senare hittas automatiskt nästa gång TV:n slås på. En app som inte finns
på TV:n visas nedtonad.

## Bra kommandon (på TV:n)

| Kommando | Gör |
|---|---|
| `sh /media/developer/custom_home/hem learn` | Lär in HOME-knappen igen |
| `sh /media/developer/custom_home/hem apps` | Läser in app-listan på nytt |
| `sh /media/developer/custom_home/hem weather` | Hämtar vädret nu |
| `cat /tmp/customhome.log` | Visar vad bakgrundstjänsten gör |

## Ta bort allt (på TV:n)

```sh
sh /media/developer/apps/usr/palm/applications/se.minhemskarm.launcher/setup/uninstall.sh
```

Ta sedan bort appen **Hemskärm** som vilken app som helst. LG:s vanliga hemskärm kommer tillbaka.

## Felsökning

| Problem | Lösning |
|---|---|
| HOME öppnar LG:s meny precis efter att TV:n slagits på | Normalt den första halvminuten: tjänsten startar ungefär 30 sekunder efter att skärmen tänts, och sedan öppnas hemskärmen av sig själv. Slå på **Quick Start+** (Inställningar → Alla inställningar → Allmänt) så går TV:n bara i viloläge och hemskärmen fungerar direkt |
| Inget händer när jag trycker HOME | Kör `hem learn` (se tabellen ovan) och tryck HOME 3 gånger |
| Inget väder syns | Kör `hem weather` och se vad det står. Vädret döljs om det är äldre än 6 timmar |
| En app är nedtonad fast den finns | Kontrollera att `hitta` stämmer med appens namn på TV:n och kör `hem apps` |
| `setup.sh` hittar inte node | Skicka en bild på utskriften |

## Manuell installation (om Homebrew Channel-vägen inte fungerar)

Ladda ner `.ipk`-filen från mappen `release` på https://github.com/Neoorell/lg-hemskarm och lägg den i **Dokument**. Sedan, på Macen:

```sh
cd ~/Documents
cat se.minhemskarm.launcher_*_all.ipk | ssh root@192.168.0.222 'cat > /tmp/hem.ipk'
```

Och på TV:n (tryck **Ctrl+C** när det står `"state": "installed"`):

```sh
luna-send -i luna://com.webos.appInstallService/dev/install '{"id":"se.minhemskarm.launcher","ipkUrl":"/tmp/hem.ipk","subscribe":true}'
```

Fortsätt sedan med steg 3.

Bygger på [lg-webos-custom-home](https://github.com/NaveenDA/lg-webos-custom-home) (MIT-licens),
omgjord för webOS 4.5 och TV:ns egen node.
