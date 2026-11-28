import ExpoModulesCore

public class ClientCertificateAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Has to happen at launch: a URLSession copies its configuration when it
    // is created, so the protocol must be in place before the first request.
    ClientIdentityStore.shared.load()
    MutualTLSURLProtocol.install()
    WebViewClientCertificate.install()
    return true
  }
}
