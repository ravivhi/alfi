package com.raviv.alfi.local;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Set;

// Local build of the Alfi game: the web files ship inside the APK (assets/web) and are served from a
// secure https origin, so the game runs fully offline with its own localStorage.
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/web/index.html";

    private WebView webView;
    private String versionName = "";
    private TtsBridge tts;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        try {
            String v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            if (v != null) versionName = v;
        } catch (Exception e) {
            versionName = "";
        }

        webView = new WebView(this);
        setContentView(webView);
        hideSystemBars();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // Owner 2026-11-22 (preview 0.7): no zoom - kids zoomed in by accident. No pinch, no zoom buttons, the
        // system font size never scales the text.
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        tts = new TtsBridge();
        webView.addJavascriptInterface(tts, "AlfiTTS");
        webView.addJavascriptInterface(new NativeBridge(), "AlfiNative");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                return showChooser(callback, params);
            }
        });

        final String polyfill = readAsset("bridge/tts-polyfill.js");
        final boolean docStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (docStart) {
            WebViewCompat.addDocumentStartJavaScript(webView, polyfill, Collections.singleton(ORIGIN));
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // Older WebViews without document-start scripts: inject as early as possible.
                if (!docStart) view.evaluateJavascript(polyfill, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Stay inside the app; the game has no external links that should open here.
                return !request.getUrl().toString().startsWith(ORIGIN);
            }
        });

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(versionName.isEmpty() ? START_URL : START_URL + "?v=" + Uri.encode(versionName));
    }

    // Android back: press the game's own back button when it is shown, else its home button; on the home
    // screen, leave the app.
    @Override
    public void onBackPressed() {
        String js = "(window.alfiBack ? window.alfiBack() : "
                + "(function(){function vis(id){var b=document.getElementById(id);"
                + "if(!b)return null;var cs=getComputedStyle(b);"
                + "return (b.offsetParent!==null&&cs.visibility!=='hidden'&&cs.display!=='none'&&!b.disabled)?b:null;}"
                + "var b=vis('tbBack')||vis('tbHome');if(b){b.click();return 'handled';}return 'exit';})())";
        webView.evaluateJavascript(js, result -> {
            if (result == null || result.contains("exit")) finish();
        });
    }

    // ---- File chooser (setup photo: camera + gallery) and export (create document) ----
    private static final int REQ_CHOOSER = 4101;
    private static final int REQ_EXPORT = 4102;
    private ValueCallback<Uri[]> chooserCallback;
    private Uri cameraUri;
    private File cameraFile;
    private String pendingExportText;

    private boolean showChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (chooserCallback != null) chooserCallback.onReceiveValue(null);
        chooserCallback = callback;
        cameraUri = null;
        cameraFile = null;
        boolean image = false;
        if (params != null && params.getAcceptTypes() != null) {
            for (String t : params.getAcceptTypes()) {
                if (t != null && t.contains("image")) image = true;
            }
        }
        Intent get = new Intent(Intent.ACTION_GET_CONTENT);
        get.addCategory(Intent.CATEGORY_OPENABLE);
        get.setType(image ? "image/*" : "*/*");
        Intent chooser = Intent.createChooser(get, null);
        if (image) {
            try {
                File dir = new File(getCacheDir(), "photos");
                if (!dir.exists()) dir.mkdirs();
                // the photos of earlier choosers were read by the page long ago: only the new one may stay
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                cameraFile = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", cameraFile);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
            } catch (Exception e) {
                cameraUri = null;
                cameraFile = null;
            }
        }
        try {
            startActivityForResult(chooser, REQ_CHOOSER);
        } catch (Exception e) {
            chooserCallback = null;
            callback.onReceiveValue(null);
            return false;
        }
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CHOOSER) {
            ValueCallback<Uri[]> cb = chooserCallback;
            chooserCallback = null;
            if (cb == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                } else if (cameraFile != null && cameraUri != null && cameraFile.length() > 0) {
                    result = new Uri[]{cameraUri};
                }
            }
            cb.onReceiveValue(result);
            cameraUri = null;
            cameraFile = null;
        } else if (requestCode == REQ_EXPORT) {
            String text = pendingExportText;
            pendingExportText = null;
            boolean saved = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && text != null) {
                try (java.io.OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (out != null) {
                        out.write(text.getBytes(StandardCharsets.UTF_8));
                        out.flush();
                        saved = true;
                    }
                } catch (Exception e) {
                    saved = false;
                }
            }
            exportDone(saved);
        }
    }

    // Tells the page how the export ended: true once the file is written; false when the write failed or the
    // parent closed the save window.
    private void exportDone(boolean saved) {
        final String js = "window.__alfiExportDone&&window.__alfiExportDone(" + saved + ")";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    // The Java side of src/platform/native.ts: save backup file, exit, export.
    final class NativeBridge {
        private File cur() { return new File(getFilesDir(), "alfi-backup.json"); }
        private File prev() { return new File(getFilesDir(), "alfi-backup.prev.json"); }

        private String readFile(File f) {
            if (!f.exists() || f.length() == 0) return null;
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            } catch (IOException e) {
                return null;
            }
        }

        // The main file, or the previous one when the main file is missing, empty or not JSON (a torn write).
        @JavascriptInterface
        public String readBackup() {
            String s = readFile(cur());
            if (s != null && isJson(s)) return s;
            String p = readFile(prev());
            if (p != null && isJson(p)) return p;
            return s != null ? s : p;
        }

        private boolean isJson(String s) {
            try {
                new org.json.JSONObject(s);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean writeBackup(String json) {
            if (json == null) return false;
            File tmp = new File(getFilesDir(), "alfi-backup.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (IOException e) {
                tmp.delete();
                return false;
            }
            File c = cur();
            File p = prev();
            if (c.exists()) {
                if (p.exists()) p.delete();
                if (!c.renameTo(p)) {
                    c.delete();
                }
            }
            if (!tmp.renameTo(c)) {
                tmp.delete();
                return false;
            }
            return true;
        }

        // The APK's versionName, shown on screen so a screenshot names the build that ran.
        @JavascriptInterface
        public String appVersion() {
            return versionName;
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> finish());
        }

        @JavascriptInterface
        public void exportFile(String name, String text) {
            final String fname = (name == null || name.isEmpty()) ? "alfi-export.json" : name;
            final String body = text == null ? "" : text;
            runOnUiThread(() -> {
                pendingExportText = body;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, fname);
                try {
                    startActivityForResult(i, REQ_EXPORT);
                } catch (Exception e) {
                    pendingExportText = null;
                    exportDone(false);
                }
            });
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tts != null) tts.stop();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        webView.destroy();
        super.onDestroy();
    }

    private void hideSystemBars() {
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    private String readAsset(String path) {
        try (InputStream in = getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            return "";
        }
    }

    // The Java side of tts-polyfill.js: Hebrew speech through the phone's Android text-to-speech engine.
    final class TtsBridge implements TextToSpeech.OnInitListener {
        private final TextToSpeech engine;
        private volatile boolean ready;
        private volatile boolean hebrew;
        private static final long VOICE_RETRY_MS = 1500;
        private int counter;

        TtsBridge() {
            engine = new TextToSpeech(MainActivity.this, this);
        }

        // The voice re-check scheduled in onInit; shutdown() cancels it so it never runs on a dead engine.
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final Runnable voiceRetry = () -> {
            if (hebrew) return;
            try {
                if (selectLocalHebrew()) {
                    hebrew = true;
                    notifyVoicesReady();
                }
            } catch (Exception e) {
                // the engine went away or the page is gone: stay without a voice
            }
        };

        @Override
        public void onInit(int status) {
            if (status != TextToSpeech.SUCCESS) return;
            // Only an installed, on-device Hebrew voice: a network voice would send every line (the child's name
            // too) off the phone, and offline it says nothing while the page believes it has a voice. Without one,
            // hasHebrew() stays false and the page shows its no-voice notice.
            hebrew = selectLocalHebrew();
            engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { }
                @Override public void onDone(String utteranceId) { notifyDone(utteranceId); }
                @Override public void onError(String utteranceId) { notifyDone(utteranceId); }
            });
            ready = true;
            notifyVoicesReady();
            // Some engines report an empty voice set right at init: look once more before settling on "no voice".
            if (!hebrew) {
                mainHandler.postDelayed(voiceRetry, VOICE_RETRY_MS);
            }
        }

        // Picks and selects the local Hebrew voice; false when there is none (or the engine refuses it).
        private boolean selectLocalHebrew() {
            Voice voice = pickLocalHebrewVoice();
            if (voice == null) return false;
            try {
                return engine.setVoice(voice) == TextToSpeech.SUCCESS;
            } catch (Exception e) {
                return false;
            }
        }

        private void notifyVoicesReady() {
            runOnUiThread(() -> webView.evaluateJavascript(
                    "window.__alfiVoicesReady&&window.__alfiVoicesReady()", null));
        }

        // A Hebrew voice (he, or the legacy code iw) that needs no network and whose data is installed; the best
        // quality wins, then the lower latency.
        private Voice pickLocalHebrewVoice() {
            Set<Voice> voices;
            try {
                voices = engine.getVoices();
            } catch (Exception e) {
                return null;
            }
            if (voices == null) return null;
            Voice best = null;
            for (Voice v : voices) {
                if (v == null || v.getLocale() == null) continue;
                String lang = v.getLocale().getLanguage();
                if (!"he".equals(lang) && !"iw".equals(lang)) continue;
                if (v.isNetworkConnectionRequired()) continue;
                Set<String> features = v.getFeatures();
                if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                if (best == null || v.getQuality() > best.getQuality()
                        || (v.getQuality() == best.getQuality() && v.getLatency() < best.getLatency())) {
                    best = v;
                }
            }
            return best;
        }

        @JavascriptInterface
        public boolean hasHebrew() {
            return ready && hebrew;
        }

        @JavascriptInterface
        public void speak(String text, float rate, float pitch) {
            if (!ready || !hebrew || text == null || text.isEmpty()) return;
            engine.setSpeechRate(rate);
            engine.setPitch(pitch);
            engine.speak(text, TextToSpeech.QUEUE_ADD, null, "alfi" + (counter++));
        }

        @JavascriptInterface
        public void speak2(String text, float rate, float pitch, float volume, String id) {
            if (id == null) return;
            if (!ready || !hebrew || text == null || text.isEmpty()) {
                notifyDone(id);
                return;
            }
            engine.setSpeechRate(rate);
            engine.setPitch(pitch);
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, volume)));
            engine.speak(text, TextToSpeech.QUEUE_ADD, params, id);
        }

        private void notifyDone(String id) {
            final String safe = id == null ? "" : id.replaceAll("[^A-Za-z0-9_]", "");
            runOnUiThread(() -> webView.evaluateJavascript(
                    "window.__alfiTtsDone&&window.__alfiTtsDone('" + safe + "')", null));
        }

        @JavascriptInterface
        public void stop() {
            if (ready) engine.stop();
        }

        void shutdown() {
            mainHandler.removeCallbacks(voiceRetry);
            engine.shutdown();
        }
    }
}
