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
        String title = call.getString("title", "RonecaPlayTV");

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL de mídia vazia.");
            return;
        }

        Intent intent = new Intent(getActivity(), NativePlayerActivity.class);
        intent.putExtra("url", url);
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
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

public class NativePlayerActivity extends AppCompatActivity {
    private ExoPlayer player;
    private PlayerView playerView;
    private String mediaUrl;

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

        mediaUrl = getIntent().getStringExtra("url");

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

        root.addView(
            playerView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        setContentView(root);

        initializePlayer();
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
        if (mediaUrl == null || mediaUrl.trim().isEmpty()) {
            finish();
            return;
        }

        DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
            .setUserAgent("VLC/3.0.20 LibVLC/3.0.20")
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

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(mediaUrl.trim()));

        player.setMediaItem(mediaItem);
        player.setPlayWhenReady(true);
        player.prepare();

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                // Mantém tudo dentro do app. Se a fonte falhar, fecha o player
                // e volta para a tela React do próprio RonecaPlayTV.
                playerView.postDelayed(() -> {
                    if (!isFinishing()) {
                        finish();
                        overridePendingTransition(0, 0);
                    }
                }, 1800);
            }
        });
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

console.log('Android configurado: player ExoPlayer interno no próprio APK.');
