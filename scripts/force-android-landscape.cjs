const fs = require('fs');
const path = require('path');

const androidRoot = path.join(process.cwd(), 'android');
const appRoot = path.join(androidRoot, 'app');
const manifestPath = path.join(appRoot, 'src', 'main', 'AndroidManifest.xml');
const xmlDir = path.join(appRoot, 'src', 'main', 'res', 'xml');
const networkConfigPath = path.join(xmlDir, 'network_security_config.xml');
const javaDir = path.join(appRoot, 'src', 'main', 'java', 'com', 'ronecaplaytv', 'app');
const mainActivityPath = path.join(javaDir, 'MainActivity.java');
const nativePluginPath = path.join(javaDir, 'NativeVideoPlayerPlugin.java');
const nativeActivityPath = path.join(javaDir, 'NativePlayerActivity.java');
const appGradlePath = path.join(appRoot, 'build.gradle');

function setAndroidAttr(attrs, name, value) {
  const pattern = new RegExp(`android:${name}="[^"]*"`, 'g');
  const replacement = `android:${name}="${value}"`;

  if (pattern.test(attrs)) {
    return attrs.replace(pattern, replacement);
  }

  return `${attrs}\n        ${replacement}`;
}

if (!fs.existsSync(manifestPath)) {
  console.log('AndroidManifest.xml não encontrado; pulando configuração Android.');
  process.exit(0);
}

fs.mkdirSync(xmlDir, { recursive: true });
fs.mkdirSync(javaDir, { recursive: true });

fs.writeFileSync(networkConfigPath, `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`);

let manifest = fs.readFileSync(manifestPath, 'utf8');

manifest = manifest.replace(
  /<application([\s\S]*?)>/,
  (match, attrs) => {
    let next = attrs;

    next = setAndroidAttr(next, 'usesCleartextTraffic', 'true');
    next = setAndroidAttr(next, 'networkSecurityConfig', '@xml/network_security_config');
    next = setAndroidAttr(next, 'hardwareAccelerated', 'true');

    return `<application${next}>`;
  }
);

manifest = manifest.replace(
  /<activity([\s\S]*?android:name="\.MainActivity"[\s\S]*?)>/,
  (match, attrs) => {
    let next = attrs;

    if (/android:screenOrientation=/.test(next)) {
      next = next.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="landscape"');
    } else {
      next += '\n            android:screenOrientation="landscape"';
    }

    if (!/android:configChanges=/.test(next)) {
      next += '\n            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"';
    }

    return `<activity${next}>`;
  }
);

if (!manifest.includes('android:name=".NativePlayerActivity"')) {
  manifest = manifest.replace(
    '</application>',
    `        <activity
            android:name=".NativePlayerActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|screenLayout|uiMode"
            android:excludeFromRecents="true"
            android:exported="false"
            android:hardwareAccelerated="true"
            android:launchMode="singleTop"
            android:screenOrientation="landscape"
            android:theme="@style/AppTheme.NoActionBar" />

    </application>`
  );
}

fs.writeFileSync(manifestPath, manifest);

if (fs.existsSync(appGradlePath)) {
  let gradle = fs.readFileSync(appGradlePath, 'utf8');

  const deps = [
    'implementation "androidx.media3:media3-exoplayer:1.5.1"',
    'implementation "androidx.media3:media3-exoplayer-hls:1.5.1"',
    'implementation "androidx.media3:media3-datasource:1.5.1"',
    'implementation "androidx.media3:media3-ui:1.5.1"',
  ];

  for (const dep of deps) {
    if (!gradle.includes(dep)) {
      gradle = gradle.replace(/dependencies\s*\{/, `dependencies {\n    ${dep}`);
    }
  }

  fs.writeFileSync(appGradlePath, gradle);
}

fs.writeFileSync(mainActivityPath, `package com.ronecaplaytv.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeVideoPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

fs.writeFileSync(nativePluginPath, `package com.ronecaplaytv.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeVideoPlayer")
public class NativeVideoPlayerPlugin extends Plugin {
    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        String urlsJson = call.getString("urlsJson", "");
        String title = call.getString("title", "RonecaPlayTV");

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL de mídia vazia.");
            return;
        }

        Intent intent = new Intent(getActivity(), NativePlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("urlsJson", urlsJson);
        intent.putExtra("title", title);
        intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);

        getActivity().startActivity(intent);
        getActivity().overridePendingTransition(0, 0);

        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }
}
`);

fs.writeFileSync(nativeActivityPath, `package com.ronecaplaytv.app;

import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class NativePlayerActivity extends AppCompatActivity {
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView messageView;
    private final ArrayList<String> mediaUrls = new ArrayList<>();
    private int currentIndex = 0;
    private String lastError = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        overridePendingTransition(0, 0);
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        parseUrls();

        hideSystemUi();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setUseController(true);
        playerView.setKeepScreenOn(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setControllerAutoShow(true);
        playerView.setControllerHideOnTouch(true);

        messageView = new TextView(this);
        messageView.setTextColor(Color.WHITE);
        messageView.setTextSize(18);
        messageView.setGravity(Gravity.CENTER);
        messageView.setPadding(42, 28, 42, 28);
        messageView.setVisibility(View.GONE);
        messageView.setBackgroundColor(Color.argb(210, 0, 0, 0));

        root.addView(
            playerView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        root.addView(
            messageView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
        );

        setContentView(root);

        initializePlayer();
    }

    private void parseUrls() {
        String primaryUrl = getIntent().getStringExtra("url");
        String urlsJson = getIntent().getStringExtra("urlsJson");

        if (urlsJson != null && !urlsJson.trim().isEmpty()) {
            try {
                JSONArray array = new JSONArray(urlsJson);

                for (int index = 0; index < array.length(); index++) {
                    String value = array.optString(index, "").trim();

                    if (!value.isEmpty() && !mediaUrls.contains(value)) {
                        mediaUrls.add(value);
                    }
                }
            } catch (Exception ignored) {
                // fallback abaixo
            }
        }

        if (primaryUrl != null && !primaryUrl.trim().isEmpty() && !mediaUrls.contains(primaryUrl.trim())) {
            mediaUrls.add(0, primaryUrl.trim());
        }
    }

    private void hideSystemUi() {
        View decorView = getWindow().getDecorView();

        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void initializePlayer() {
        if (mediaUrls.isEmpty()) {
            showMessage("Nenhuma fonte de mídia foi enviada ao player interno.");
            return;
        }

        Map<String, String> requestHeaders = new HashMap<>();
        requestHeaders.put("Accept", "*/*");
        requestHeaders.put("User-Agent", "VLC/3.0.20 LibVLC/3.0.20");

        DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
            .setUserAgent("VLC/3.0.20 LibVLC/3.0.20")
            .setDefaultRequestProperties(requestHeaders)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000);

        DefaultDataSource.Factory dataSourceFactory = new DefaultDataSource.Factory(
            this,
            httpDataSourceFactory
        );

        player = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(dataSourceFactory))
            .build();

        playerView.setPlayer(player);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_READY) {
                    messageView.setVisibility(View.GONE);
                }

                if (playbackState == Player.STATE_BUFFERING) {
                    showTemporaryMessage("Carregando fonte " + (currentIndex + 1) + "/" + mediaUrls.size() + "...");
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                lastError = error.getErrorCodeName() + ": " + String.valueOf(error.getMessage());
                tryNextSourceOrShowError();
            }
        });

        playCurrentSource();
    }

    private void playCurrentSource() {
        if (player == null || currentIndex < 0 || currentIndex >= mediaUrls.size()) {
            showFinalError();
            return;
        }

        String url = mediaUrls.get(currentIndex);

        showTemporaryMessage("Abrindo fonte " + (currentIndex + 1) + "/" + mediaUrls.size() + "...");

        player.stop();
        player.clearMediaItems();

        MediaItem mediaItem = buildMediaItem(url);

        player.setMediaItem(mediaItem);
        player.setPlayWhenReady(true);
        player.prepare();
    }

    private MediaItem buildMediaItem(String rawUrl) {
        String url = rawUrl.trim();
        String lower = url.toLowerCase();

        MediaItem.Builder builder = new MediaItem.Builder()
            .setUri(Uri.parse(url));

        if (lower.contains(".m3u8")) {
            builder.setMimeType("application/x-mpegURL");
        } else if (lower.contains(".mpd")) {
            builder.setMimeType("application/dash+xml");
        } else if (lower.matches(".*\\\\.(ts|m2ts|mpegts)(\\\\?|#|$).*")) {
            builder.setMimeType("video/mp2t");
        } else if (lower.contains(".mp4")) {
            builder.setMimeType("video/mp4");
        }

        return builder.build();
    }

    private void tryNextSourceOrShowError() {
        if (currentIndex + 1 < mediaUrls.size()) {
            currentIndex += 1;

            playerView.postDelayed(this::playCurrentSource, 450);
            return;
        }

        showFinalError();
    }

    private String safeCurrentUrl() {
        try {
            String url = mediaUrls.isEmpty() ? "" : mediaUrls.get(Math.max(0, Math.min(currentIndex, mediaUrls.size() - 1)));
            Uri uri = Uri.parse(url);
            String host = uri.getHost() == null ? "fonte" : uri.getHost();
            String path = uri.getPath() == null ? "" : uri.getPath();
            String ext = "";

            int dot = path.lastIndexOf(".");
            if (dot >= 0 && dot < path.length() - 1) {
                ext = path.substring(dot);
            }

            return uri.getScheme() + "://" + host + "/..." + ext;
        } catch (Exception error) {
            return "fonte protegida";
        }
    }

    private void showTemporaryMessage(String message) {
        messageView.setText(message);
        messageView.setVisibility(View.VISIBLE);
    }

    private void showMessage(String message) {
        messageView.setText(message);
        messageView.setVisibility(View.VISIBLE);
    }

    private void showFinalError() {
        String detail = lastError == null || lastError.trim().isEmpty()
            ? "Erro desconhecido do player nativo."
            : lastError;

        showMessage(
            "Não foi possível reproduzir esta mídia no player interno.\\n\\n"
                + "Fonte testada: " + safeCurrentUrl() + "\\n"
                + "Tentativas: " + mediaUrls.size() + "\\n"
                + "Erro: " + detail + "\\n\\n"
                + "Toque em voltar para retornar ao RonecaPlayTV."
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();

        if (player != null) {
            player.play();
        }
    }

    @Override
    protected void onPause() {
        if (player != null) {
            player.pause();
        }

        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (player != null) {
            player.release();
            player = null;
        }

        super.onDestroy();
        overridePendingTransition(0, 0);
    }
}
`);

console.log('Android configurado: ExoPlayer interno com múltiplas fontes e erro visível.');
