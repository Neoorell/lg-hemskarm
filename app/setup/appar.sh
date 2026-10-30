#!/bin/sh
# Hemskärmens applista (dubbel-BACK). Körs som root via Homebrew Channels exec, eftersom
# hemskärmen inte själv får anropa applicationManager/running eller closeByAppId.
#   sh appar.sh            svaret från running på första raden, sedan "MEM <pid> <kB>" och "LEDIGT <kB>"
#   sh appar.sh stang ID…  stänger apparna
if [ "$1" = stang ]; then
  shift
  for id in "$@"; do
    case "$id" in ""|*[!A-Za-z0-9._-]*) continue ;; esac
    luna-send -n 1 luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$id\"}" >/dev/null 2>&1
    # tjänstens snabbstart förladdar inte en app som just stängts här
    echo "$id $(date +%s)" >> /tmp/hemskarm-stangda
  done
  echo OK
  exit 0
fi
# luna-send skriver inget inne i $(...) men fungerar till en fil
R=/tmp/hemskarm-appar.json
luna-send -n 1 luna://com.webos.applicationManager/running '{}' </dev/null >$R 2>/dev/null
head -n 1 $R
echo
for p in $(grep -oE '"(web)?processid": ?"[0-9]+"' $R | grep -oE '[0-9]+'); do
  echo "MEM $p $(grep -m1 VmRSS /proc/$p/status 2>/dev/null | awk '{print $2}')"
done
echo "LEDIGT $(grep -m1 MemAvailable /proc/meminfo | awk '{print $2}')"
