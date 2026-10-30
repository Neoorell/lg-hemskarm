#!/bin/sh
# Tar bort bakgrundstjänsten. TV:n får tillbaka LG:s vanliga hemskärm efter detta.
# Själva appen "Hemskärm" tar du bort i Dev Manager (eller som en vanlig app på TV:n).
pkill -f "customhome.js run" 2>/dev/null || true
rm -f /var/lib/webosbrew/init.d/50-customhome
rm -rf /media/developer/custom_home
echo "Bakgrundstjänsten är borttagen."
