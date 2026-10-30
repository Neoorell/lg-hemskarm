#!/bin/sh
# Installerar bakgrundstjänsten för hemskärmen. Kör som root på TV:n (via SSH):
#   sh /media/developer/apps/usr/palm/applications/se.minhemskarm.launcher/setup/setup.sh
# Kan köras om hur många gånger som helst.

SRC=$(cd "$(dirname "$0")" && pwd)
DIR=/media/developer/custom_home
INITD=/var/lib/webosbrew/init.d
INIT=$INITD/50-customhome

# node finns på webOS 4, men inte alltid i PATH för SSH-skalet
NODE=$(command -v node)
for n in /usr/bin/node /usr/local/bin/node /usr/sbin/node; do
  [ -z "$NODE" ] && [ -x "$n" ] && NODE=$n
done
[ -z "$NODE" ] && NODE=$(find /usr /opt -name node -type f 2>/dev/null | head -n 1)
if [ -z "$NODE" ]; then
  echo "FEL: node finns inte på TV:n. Hör av dig så löser vi det."
  exit 1
fi
if [ ! -d "$INITD" ]; then
  echo "FEL: hittar inte $INITD - är TV:n rootad med Homebrew Channel?"
  exit 1
fi
if [ -f /var/lib/webosbrew/rawin-launcher/uninstall.sh ]; then
  echo "OBS: Homebar är installerat och tar också HOME-knappen. Ta bort det först med:"
  echo "  sh /var/lib/webosbrew/rawin-launcher/uninstall.sh"
  exit 1
fi
echo "Använder $NODE ($("$NODE" -v))"

# Tjänsten körs direkt från appens mapp, så en uppdatering av appen byter även ut tjänsten.
JS=/media/developer/apps/usr/palm/applications/se.minhemskarm.launcher/setup/customhome.js
[ -f "$JS" ] || JS=$SRC/customhome.js
mkdir -p "$DIR"
rm -f "$DIR/customhome.js"  # kopia från version 2.0.0

# Kort kommando för vanliga saker: sh /media/developer/custom_home/hem learn|apps|weather
cat > "$DIR/hem" <<HEMEOF
#!/bin/sh
exec $NODE $JS "\$@"
HEMEOF
chmod +x "$DIR/hem"

cat > "$INIT" <<INITEOF
#!/bin/sh
# Startar bakgrundstjänsten för den egna hemskärmen vid uppstart.
nohup $NODE $JS run >>/tmp/customhome.log 2>&1 &
INITEOF
chmod +x "$INIT"
echo "Autostart installerad: $INIT"

# Stoppa en eventuell gammal instans och starta om
pkill -f "customhome.js run" 2>/dev/null || true
"$NODE" "$JS" apps
"$NODE" "$JS" weather
nohup "$NODE" "$JS" run >>/tmp/customhome.log 2>&1 &
echo "Bakgrundstjänsten körs (logg: /tmp/customhome.log)"
echo

"$NODE" "$JS" learn
echo
echo "Allt klart! Tryck HOME på fjärrkontrollen för att testa."
