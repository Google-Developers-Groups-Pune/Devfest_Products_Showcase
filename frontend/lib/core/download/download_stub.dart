/// Non-web builds (tests): remembers the last file instead of saving it.
String? lastDownloadName;
String? lastDownloadText;

void downloadTextFile(String filename, String text, {String mimeType = 'text/plain'}) {
  lastDownloadName = filename;
  lastDownloadText = text;
}
