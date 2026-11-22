import 'dart:js_interop';

import 'package:web/web.dart' as web;

String? lastDownloadName;
String? lastDownloadText;

/// Saves [text] as a file through a Blob. A plain link cannot send the
/// Authorization header, so the file is fetched first and saved here (FE-17).
void downloadTextFile(String filename, String text, {String mimeType = 'text/plain'}) {
  lastDownloadName = filename;
  lastDownloadText = text;
  final blob = web.Blob([text.toJS].toJS, web.BlobPropertyBag(type: mimeType));
  final url = web.URL.createObjectURL(blob);
  final a = web.HTMLAnchorElement()
    ..href = url
    ..download = filename
    ..style.display = 'none';
  web.document.body?.append(a);
  a.click();
  a.remove();
  web.URL.revokeObjectURL(url);
}
