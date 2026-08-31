package com.nexplay.app

import android.app.Application

class NexPlayApplication : Application() {
    val assetServerManager = NexPlayAssetServerManager()
}

