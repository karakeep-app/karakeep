package app.karakeep.shareintent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class KarakeepShareIntentLifecycleListener(activityContext: Context) : ReactActivityLifecycleListener {
    companion object {
        private const val TAG = "KarakeepShareIntent"
    }

    override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
        val intent = activity?.intent ?: return

        // Only store the intent if it is actually a share intent.
        // This prevents normal app launches from overwriting a pending share intent.
        if (isShareIntent(intent)) {
            Log.d(TAG, "onCreate: Captured share intent action=${intent.action} type=${intent.type}")
            KarakeepShareIntentSingleton.storeShareIntent(Intent(intent))
        } else {
            Log.d(TAG, "onCreate: Not a share intent, ignoring. action=${intent.action} type=${intent.type}")
        }
    }

    private fun isShareIntent(intent: Intent): Boolean {
        return (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) &&
            intent.type != null
    }
}
