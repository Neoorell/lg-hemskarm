#!/bin/sh
# Tar bort bakgrundstjänsten. TV:n får tillbaka LG:s vanliga hemskärm efter detta.
# Själva appen "Hemskärm" tar du bort i Dev Manager (eller som en vanlig app på TV:n).
pkill -f "customhome.js run" 2>/dev/null || true
rm -f /var/lib/webosbrew/init.d/50-customhome

# LG:s hemrad, reklamblockeringen och LG:s tjänster tillbaka direkt (annars vid nästa omstart).
# Bara tjänsten monterar över LG:s hemrad och dess minnesbilder; /etc/hosts bara om det är vår.
for target in /usr/palm/applications/com.webos.app.home/qml/main.qml \
              /mnt/lg/cmn_data/checkpoint/com.webos.app.home /tmp/checkpoint/com.webos.app.home; do
  grep -q " $target " /proc/mounts && umount -l "$target"
done
grep -q "Hemskärm: LG:s reklam" /etc/hosts 2>/dev/null && umount -l /etc/hosts
for p in $(pidof com.webos.app.home); do kill -9 "$p"; done
for job in admanager contentminer nudge uploadd rdxd; do initctl start "$job" >/dev/null 2>&1; done

rm -rf /media/developer/custom_home
echo "Bakgrundstjänsten är borttagen."
