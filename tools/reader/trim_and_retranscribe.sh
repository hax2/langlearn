#!/bin/bash
set -e

# Trim "Cuentos de amor de locura y de muerte.mp3"
if [ -f "Cuentos de amor de locura y de muerte.mp3" ]; then
    mv "Cuentos de amor de locura y de muerte.mp3" "Cuentos de amor de locura y de muerte.old.mp3"
    ffmpeg -i "Cuentos de amor de locura y de muerte.old.mp3" -ss 23.58 -c:a libmp3lame -q:a 2 "Cuentos de amor de locura y de muerte.mp3"
    rm "Cuentos de amor de locura y de muerte.json" "Cuentos de amor de locura y de muerte.vtt"
fi

# Trim "Cuentos de la tierra.mp3"
if [ -f "Cuentos de la tierra.mp3" ]; then
    mv "Cuentos de la tierra.mp3" "Cuentos de la tierra.old.mp3"
    ffmpeg -i "Cuentos de la tierra.old.mp3" -ss 114.24 -c:a libmp3lame -q:a 2 "Cuentos de la tierra.mp3"
    rm "Cuentos de la tierra.json" "Cuentos de la tierra.vtt"
fi

# Run add_audio.sh for the trimmed files
./add_audio.sh "Cuentos de amor de locura y de muerte.mp3" "Cuentos de la tierra.mp3"

