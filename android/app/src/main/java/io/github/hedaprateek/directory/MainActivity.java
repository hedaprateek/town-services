package io.github.hedaprateek.directory;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

/**
 * One screen: the site, in a WebView, with no browser furniture around it.
 *
 * Two flavours share this. The town build serves a copy of the site that ships
 * inside the APK, so it opens with no signal the first time it is ever run.
 * The society build opens the gated site over the network, because its data is
 * the one thing that must not travel inside a file people pass around.
 */
public class MainActivity extends Activity {

  /** The origin the bundled copy is served from. Reserved by WebView for this. */
  private static final String APP_HOST = "appassets.androidplatform.net";

  private WebView web;
  private WebViewAssetLoader loader;
  private boolean failed = false;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);

    web = new WebView(this);
    setContentView(web);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);          // the language and text-size choices
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    s.setDisplayZoomControls(false);
    s.setAllowFileAccess(false);           // nothing needs file://
    s.setAllowContentAccess(false);
    s.setMediaPlaybackRequiresUserGesture(true);
    // Lets the page tell it is running inside the app and drop anything that
    // only makes sense in a browser, such as "add to home screen".
    s.setUserAgentString(s.getUserAgentString() + " " + BuildConfig.UA_TAG);

    // The gate hands out a session cookie; it has to survive being closed.
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(web, false);

    if (BuildConfig.BUNDLED) {
      loader = new WebViewAssetLoader.Builder()
          .setDomain(APP_HOST)
          .addPathHandler("/assets/", new SiteFiles(this))
          .build();
    }

    web.setWebViewClient(new Client());

    if (state != null) {
      web.restoreState(state);
    } else {
      web.loadUrl(BuildConfig.START_URL);
    }

    refreshData();
  }

  /* ------------------------------------------------------------------ */

  private final class Client extends WebViewClient {

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
      return loader == null ? null : loader.shouldInterceptRequest(req.getUrl());
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
      return openOutside(req.getUrl());
    }

    // API 21-23 still call the string form.
    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView v, String url) {
      return openOutside(Uri.parse(url));
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onReceivedError(WebView v, int code, String desc, String url) {
      // Only the page itself matters here. A missing image should not replace
      // a list someone is reading with an error.
      if (url != null && url.equals(v.getUrl())) showOffline();
    }

    @Override
    public void onPageFinished(WebView v, String url) {
      failed = false;
    }
  }

  /**
   * Anything that is not this app's own site goes to whatever app handles it:
   * the dialler, WhatsApp, the mail app, the browser. Returning true means the
   * WebView does not try to load it itself.
   */
  private boolean openOutside(Uri uri) {
    if (uri == null) return false;
    String scheme = uri.getScheme();
    if (scheme == null) return false;

    if (scheme.equals("http") || scheme.equals("https")) {
      String host = uri.getHost();
      if (host != null && host.equalsIgnoreCase(ownHost())) return false;   // ours
    }

    try {
      Intent i = new Intent(Intent.ACTION_VIEW, uri);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(i);
    } catch (ActivityNotFoundException e) {
      // No dialler on a tablet, no mail app set up, no WhatsApp installed.
      Toast.makeText(this, getString(R.string.no_app_for_that), Toast.LENGTH_SHORT).show();
    }
    return true;
  }

  private String ownHost() {
    if (BuildConfig.BUNDLED) return APP_HOST;
    Uri u = Uri.parse(BuildConfig.START_URL);
    return u.getHost() == null ? "" : u.getHost();
  }

  /** Shown only when the page itself could not be reached and nothing is cached. */
  private void showOffline() {
    if (failed) return;
    failed = true;
    String html =
        "<!doctype html><meta charset=utf-8>" +
        "<meta name=viewport content='width=device-width,initial-scale=1'>" +
        "<style>body{margin:0;display:grid;place-items:center;height:100vh;" +
        "font:16px/1.5 system-ui,sans-serif;background:#0A1628;color:#E8EDF5;" +
        "text-align:center;padding:24px;box-sizing:border-box}" +
        "p{color:#94A3B8;max-width:32ch}</style><div><h2>" +
        getString(R.string.offline_title) + "</h2><p>" +
        getString(R.string.offline_body) + "</p></div>";
    web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
  }

  /* ------------------------------------------------------------------
     Serving the bundled copy, newest first.

     A file this app has downloaded wins over the one that shipped in the APK,
     so the listings stay current without anyone reinstalling anything. */

  private static final class SiteFiles implements WebViewAssetLoader.PathHandler {
    private final WebViewAssetLoader.AssetsPathHandler shipped;
    private final File fresh;

    SiteFiles(MainActivity ctx) {
      shipped = new WebViewAssetLoader.AssetsPathHandler(ctx);
      fresh = new File(ctx.getFilesDir(), "fresh");
    }

    @Override
    public WebResourceResponse handle(String path) {
      // Only ever files this app wrote itself, and never a path that climbs out.
      if (path != null && !path.contains("..") && !path.startsWith("/")) {
        File f = new File(fresh, path);
        if (f.isFile() && f.length() > 0) {
          try {
            return new WebResourceResponse(mimeOf(path), "utf-8", new FileInputStream(f));
          } catch (Exception e) {
            // Fall through: the copy that shipped is always there.
          }
        }
      }
      return shipped.handle(path);
    }
  }

  private static String mimeOf(String path) {
    if (path.endsWith(".json")) return "application/json";
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".js")) return "text/javascript";
    if (path.endsWith(".css")) return "text/css";
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".webmanifest")) return "application/manifest+json";
    return "application/octet-stream";
  }

  /**
   * Pulls the current listings in the background. If they turn out to differ
   * from what is on screen the page is reloaded once — the file is a few
   * kilobytes, so this lands well before anyone has finished reading the first
   * screen. Offline, every step here fails quietly and the shipped copy stands.
   */
  private void refreshData() {
    if (!BuildConfig.BUNDLED || TextUtils.isEmpty(BuildConfig.DATA_FILES)) return;

    final File dir = new File(getFilesDir(), "fresh");
    final String[] names = BuildConfig.DATA_FILES.split(",");

    new Thread(new Runnable() {
      @Override public void run() {
        boolean changed = false;
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        for (String raw : names) {
          String name = raw.trim();
          if (name.isEmpty()) continue;
          try {
            byte[] got = download(BuildConfig.REMOTE_BASE + name);
            if (got == null) continue;
            File out = new File(dir, name);
            if (Arrays.equals(got, read(out))) continue;
            // Written beside it and moved into place, so a dropped connection
            // cannot leave a half-written list where a whole one was.
            File part = new File(dir, name + ".part");
            OutputStream os = new FileOutputStream(part);
            os.write(got);
            os.close();
            if (part.renameTo(out)) changed = true; else part.delete();
          } catch (Exception e) {
            // No connection, or the site moved. Nothing to do about it here.
          }
        }
        if (changed) {
          runOnUiThread(new Runnable() {
            @Override public void run() { if (!failed) web.reload(); }
          });
        }
      }
    }).start();
  }

  private static byte[] download(String url) throws Exception {
    HttpURLConnection c = null;
    try {
      c = (HttpURLConnection) new URL(url).openConnection();
      c.setConnectTimeout(8000);
      c.setReadTimeout(15000);
      c.setInstanceFollowRedirects(true);
      if (c.getResponseCode() != 200) return null;
      InputStream in = c.getInputStream();
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] chunk = new byte[8192];
      int n, total = 0;
      while ((n = in.read(chunk)) > 0) {
        total += n;
        if (total > 4 * 1024 * 1024) return null;   // not our file any more
        buf.write(chunk, 0, n);
      }
      in.close();
      return total > 0 ? buf.toByteArray() : null;
    } finally {
      if (c != null) c.disconnect();
    }
  }

  private static byte[] read(File f) {
    if (!f.isFile()) return null;
    try {
      InputStream in = new FileInputStream(f);
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] chunk = new byte[8192];
      int n;
      while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
      in.close();
      return buf.toByteArray();
    } catch (Exception e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */

  @Override
  @SuppressWarnings("deprecation")
  public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    if (web != null) web.saveState(out);
  }

  @Override
  protected void onPause() {
    super.onPause();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      CookieManager.getInstance().flush();   // keep the sign-in across restarts
    }
    if (web != null) web.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (web != null) web.onResume();
  }
}
