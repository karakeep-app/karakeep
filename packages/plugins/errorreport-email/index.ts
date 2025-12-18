// Auto-register the Email error report provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { EmailErrorReportProvider } from "./src";

if (EmailErrorReportProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.ErrorReport,
    name: "Email",
    provider: new EmailErrorReportProvider(),
  });
}
