echo "Removing all playlist folder"
rm -rf ./Youtube/playlists/*

echo "Downloading TubeYtPlaylists"
yt-dlp \
-f "bestvideo[ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]" \
-ciw -o "./Youtube/playlists/%(playlist)s/%(title)s.%(ext)s" \
--yes-playlist \
-v https://www.youtube.com/@TubeYtPlaylists/playlists

echo "Reloading Ersatztv"
curl -X POST --data '' http://192.168.2.68:8409/api/libraries/15/scan
curl -X POST --data '' http://192.168.2.68:8409/api/channels/1/playout/reset

echo "Downloading Colors"
yt-dlp \
--download-archive ./Youtube/script/colors_archive.txt \
-f "bestvideo[ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]" \
-ciw -o "./Youtube/all/Colors/%(title)s.%(ext)s" \
-v https://www.youtube.com/@COLORSxSTUDIOS/playlists

echo "Downloading Cercle"
yt-dlp \
--download-archive ./Youtube/script/cercle_archive.txt \
-f "bestvideo[ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]" \
-ciw -o "./Youtube/all/Cercle/%(title)s.%(ext)s" \
-v https://www.youtube.com/c/Cercle

if [ $? -eq 0 ]; then
  echo "Download completed successfully."
else
  echo "Error occurred during download. Check the output above for details."
  exit 1
fi
