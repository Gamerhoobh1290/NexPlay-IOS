package com.nexplay.app

import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.android.material.button.MaterialButton

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var loadingPanel: View
    private lateinit var loadingMessage: TextView
    private lateinit var pageProgress: ProgressBar
    private lateinit var errorPanel: View
    private lateinit var errorTitle: TextView
    private lateinit var errorMessage: TextView
    private lateinit var retryButton: MaterialButton
    private lateinit var mediaNotificationController: NexPlayMediaNotificationController

    private var pendingFileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebViewState: Bundle? = null
    private var restoredFromSavedState = false

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFileChooserCallback ?: return@registerForActivityResult
            pendingFileChooserCallback = null
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                ?: extractUris(result.data)
            callback.onReceiveValue(uris)
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) return@registerForActivityResult
            runPlaybackScript("(function(){ if (window.__nexplayAndroidBridgeInstalled) { var bridge = window.NexPlayAndroid; if (bridge && typeof bridge.onBridgeReady === 'function') bridge.onBridgeReady(); } })();")
        }

    private val androidPlaybackBridge = AndroidPlaybackBridge()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        mediaNotificationController = NexPlayMediaNotificationController(
            context = this,
            commandTarget = object : NexPlayMediaNotificationController.CommandTarget {
                override fun onPlayRequested() = runPlaybackScript(NexPlayAndroidBridgeScripts.playCommand)
                override fun onPauseRequested() = runPlaybackScript(NexPlayAndroidBridgeScripts.pauseCommand)
                override fun onNextRequested() = runPlaybackScript(NexPlayAndroidBridgeScripts.nextCommand)
                override fun onPreviousRequested() = runPlaybackScript(NexPlayAndroidBridgeScripts.previousCommand)
                override fun onSeekToRequested(positionMs: Long) {
                    runPlaybackScript(NexPlayAndroidBridgeScripts.seekToCommand(positionMs))
                }
            }
        )

        bindViews()
        configureWebView()
        configureBackNavigation()
        ensureNotificationPermission()
        pendingWebViewState = savedInstanceState

        retryButton.setOnClickListener {
            startOrRetryServer(retry = true)
        }

        startOrRetryServer(retry = false)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        // Keep WebView timers active so background playback and notification state stay in sync.
        super.onPause()
    }

    override fun onDestroy() {
        pendingFileChooserCallback?.onReceiveValue(null)
        pendingFileChooserCallback = null
        mediaNotificationController.release()
        webView.destroy()
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    private fun bindViews() {
        webView = findViewById(R.id.nexplay_webview)
        loadingPanel = findViewById(R.id.loading_panel)
        loadingMessage = findViewById(R.id.loading_message)
        pageProgress = findViewById(R.id.page_progress)
        errorPanel = findViewById(R.id.error_panel)
        errorTitle = findViewById(R.id.error_title)
        errorMessage = findViewById(R.id.error_message)
        retryButton = findViewById(R.id.retry_button)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowContentAccess = true
            allowFileAccess = false
            builtInZoomControls = false
            displayZoomControls = false
            javaScriptCanOpenWindowsAutomatically = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.setBackgroundColor(getColor(R.color.nexplay_black))
        webView.addJavascriptInterface(androidPlaybackBridge, "NexPlayAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false

                return if (isLocalAppUrl(request.url)) {
                    false
                } else {
                    openInExternalBrowser(request.url)
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                if (url != null && isLocalAppUrl(Uri.parse(url))) {
                    injectAndroidPlaybackBridge()
                    showWebView()
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame && isLocalAppUrl(request.url)) {
                    showError(
                        title = getString(R.string.error_page_title),
                        message = error.description?.toString()
                            ?: getString(R.string.error_page_message)
                    )
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                pageProgress.progress = newProgress
                pageProgress.visibility = if (newProgress in 1..99 && errorPanel.visibility != View.VISIBLE) {
                    View.VISIBLE
                } else {
                    View.GONE
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                pendingFileChooserCallback?.onReceiveValue(null)
                pendingFileChooserCallback = filePathCallback

                val chooserIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    type = "*/*"
                    putExtra(
                        Intent.EXTRA_ALLOW_MULTIPLE,
                        fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                    )

                    val acceptedMimeTypes = fileChooserParams
                        ?.acceptTypes
                        ?.mapNotNull { it?.trim()?.takeIf(String::isNotEmpty) }
                        ?.toTypedArray()

                    if (!acceptedMimeTypes.isNullOrEmpty()) {
                        putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes)
                    }
                }

                return try {
                    fileChooserLauncher.launch(
                        Intent.createChooser(chooserIntent, getString(R.string.file_chooser_title))
                    )
                    true
                } catch (_: ActivityNotFoundException) {
                    pendingFileChooserCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }
        }
    }

    private fun injectAndroidPlaybackBridge() {
        runPlaybackScript(NexPlayAndroidBridgeScripts.installPlaybackBridge)
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    private fun startOrRetryServer(retry: Boolean) {
        showLoading(if (retry) getString(R.string.loading_retry) else getString(R.string.loading_start))

        Thread {
            val manager = (application as NexPlayApplication).assetServerManager
            val state = if (retry) {
                manager.retry(applicationContext)
            } else {
                manager.startIfNeeded(applicationContext)
            }

            runOnUiThread {
                when (state) {
                    is AssetServerState.Running -> loadHomeUrl(state.launchUrl)
                    is AssetServerState.Failed -> showError(state.title, state.message)
                    AssetServerState.Idle -> showLoading(getString(R.string.loading_start))
                }
            }
        }.start()
    }

    private fun loadHomeUrl(url: String) {
        errorPanel.visibility = View.GONE
        loadingPanel.visibility = View.VISIBLE
        loadingMessage.text = getString(R.string.loading_page)
        pageProgress.visibility = View.VISIBLE
        pageProgress.progress = 0
        webView.visibility = View.VISIBLE

        val savedState = pendingWebViewState
        if (!restoredFromSavedState && savedState != null) {
            val restored = webView.restoreState(savedState)
            if (restored != null) {
                restoredFromSavedState = true
                pendingWebViewState = null
                return
            }
        }

        if (webView.url != url) {
            webView.loadUrl(url)
        } else {
            webView.reload()
        }
    }

    private fun showWebView() {
        loadingPanel.visibility = View.GONE
        errorPanel.visibility = View.GONE
        pageProgress.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }

    private fun showLoading(message: String) {
        loadingPanel.visibility = View.VISIBLE
        loadingMessage.text = message
        errorPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        pageProgress.visibility = View.VISIBLE
        pageProgress.progress = 0
    }

    private fun showError(title: String, message: String) {
        loadingPanel.visibility = View.GONE
        pageProgress.visibility = View.GONE
        errorPanel.visibility = View.VISIBLE
        errorTitle.text = title
        errorMessage.text = message
        webView.visibility = View.INVISIBLE
    }

    private fun isLocalAppUrl(uri: Uri?): Boolean {
        if (uri == null) return false
        val host = uri.host?.lowercase() ?: return false
        val port = if (uri.port == -1) 80 else uri.port
        return (uri.scheme == "http" || uri.scheme == "https") &&
            port == 5000 &&
            (host == "localhost" || host == "127.0.0.1")
    }

    private fun openInExternalBrowser(uri: Uri) {
        val browserIntent = Intent(Intent.ACTION_VIEW, uri).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
        }

        try {
            startActivity(browserIntent)
        } catch (_: ActivityNotFoundException) {
        }
    }

    private fun runPlaybackScript(script: String) {
        webView.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Exception) {
            }
        }
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private inner class AndroidPlaybackBridge {
        @JavascriptInterface
        fun onBridgeReady() {
            runOnUiThread {
                mediaNotificationController.onBridgeReady()
            }
        }

        @JavascriptInterface
        fun onPlaybackSnapshot(snapshotJson: String?) {
            if (snapshotJson.isNullOrBlank()) return
            runOnUiThread {
                mediaNotificationController.consumePlaybackSnapshot(snapshotJson)
            }
        }
    }

    private fun extractUris(intent: Intent?): Array<Uri>? {
        if (intent == null) return null

        val fromData = intent.data?.let { arrayOf(it) }
        val clipData = intent.clipData ?: return fromData

        val items = ArrayList<Uri>(clipData.itemCount)
        for (index in 0 until clipData.itemCount) {
            clipData.getItemAt(index)?.uri?.let(items::add)
        }

        return when {
            items.isNotEmpty() -> items.toTypedArray()
            else -> fromData
        }
    }
}
