# Egen hemskärm för LG 43UM7100PLB (webOS 4.5)

En hemskärm i Luma- och Apple TV-stil:
- **bakgrundsbild** som fyller hela skärmen (din egen eller ett bergsfoto)
- **stor klocka och datum** uppe till vänster, **väder** uppe till höger
- **HDMI 1 och HDMI 2** och apparna **Stremio, TV4 Play, SVT Play, Netflix, YouTube, HBO Max och Prime Video**
- öppnas när du trycker **HOME** och när du **slår på TV:n**
- **uppdateras via Homebrew Channel**, precis som andra homebrew-appar

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

> LG:s smala hemrad kan synas en kort stund innan hemskärmen tar över. Det är normalt.

---

## Uppdateringar

Öppna **Homebrew Channel**. Finns en ny version av **Hemskärm** visas det där, och du
installerar den som vilken homebrew-app som helst. Bakgrundstjänsten märker själv att den har
uppdaterats och startar om sig inom en minut. Du behöver **inte** köra `setup.sh` igen.

Din bakgrundsbild, väderort och HOME-knappens kod finns kvar efter en uppdatering.

## Egen bakgrundsbild (på Macen)

Välj en bild, helst liggande och ungefär 1920×1080, lägg den i **Dokument** och skicka den till TV:n
(mappen Dokument heter `~/Documents` i Terminal):

```sh
cat ~/Documents/minbild.jpg | ssh root@192.168.0.222 'cat > /media/developer/custom_home/bakgrund.jpg'
```

Tryck HOME så syns den. Bilden måste vara en **.jpg** och heta exakt `bakgrund.jpg` på TV:n.
Ta bort den med `rm /media/developer/custom_home/bakgrund.jpg` på TV:n för att få tillbaka bergsfotot.

## Väder för din ort (på TV:n)

Vädret visar Stockholm från början. Byt ort genom att ange latitud och longitud
(slå upp din ort på t.ex. latlong.net). Exempel för Göteborg:

```sh
printf 'LAT=57.71\nLON=11.97\nORT=Göteborg\n' > /media/developer/custom_home/plats.conf
sh /media/developer/custom_home/hem weather
```

Vädret uppdateras automatiskt var 30:e minut (från Open-Meteo, inget konto behövs).

## Ändra appar, namn och färger

Överst i `app/index.html` under **INSTÄLLNINGAR**:
- **Lägga till en app:** kopiera en rad i `APPAR`, ändra `namn`, `hitta` (appens namn på TV:n
  med små bokstäver) och färg. ID:t letas upp automatiskt.
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
