package app.karakeep.widget

import android.content.Intent
import android.widget.RemoteViewsService

class KarakeepWidgetRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return KarakeepWidgetRemoteViewsFactory(applicationContext, intent)
    }
}