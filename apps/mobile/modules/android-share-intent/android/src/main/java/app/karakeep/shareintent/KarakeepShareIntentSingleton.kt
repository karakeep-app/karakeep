package app.karakeep.shareintent

import android.content.Intent
import expo.modules.core.interfaces.SingletonModule

object KarakeepShareIntentSingleton : SingletonModule {
    override fun getName(): String = "KarakeepShareIntent"

    var intent: Intent? = null
    var isPending: Boolean = false

    @Synchronized
    fun storeShareIntent(newIntent: Intent) {
        intent = newIntent
        isPending = true
    }

    @Synchronized
    fun peekShareIntent(): Intent? {
        return intent
    }

    @Synchronized
    fun clear() {
        intent = null
        isPending = false
    }
}
