import Foundation
import ObjectiveC

/**
 Client-certificate support for pages loaded in react-native-webview (archived
 pages are loaded straight from the server).

 WKWebView does its networking out of process, so `MutualTLSURLProtocol` never
 sees these requests. react-native-webview does expose a client credential, but
 it's presented to any site that asks; wrapping its challenge handler instead
 keeps the certificate scoped to the Karakeep server.
 */
enum WebViewClientCertificate {
  private typealias Completion = @convention(block) (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  private typealias Handler = @convention(c) (AnyObject, Selector, AnyObject, URLAuthenticationChallenge, @escaping Completion) -> Void

  nonisolated(unsafe) private static var installed = false

  static func install() {
    let selector = NSSelectorFromString("webView:didReceiveAuthenticationChallenge:completionHandler:")
    guard !installed,
      let webViewClass = NSClassFromString("RNCWebViewImpl"),
      let method = class_getInstanceMethod(webViewClass, selector) else {
      return
    }
    installed = true

    let original = unsafeBitCast(method_getImplementation(method), to: Handler.self)
    let replacement: @convention(block) (AnyObject, AnyObject, URLAuthenticationChallenge, @escaping Completion) -> Void = { receiver, webView, challenge, completion in
      let space = challenge.protectionSpace
      if space.authenticationMethod == NSURLAuthenticationMethodClientCertificate,
        let credential = ClientIdentityStore.shared.credential(forHost: space.host) {
        completion(.useCredential, credential)
        return
      }
      original(receiver, selector, webView, challenge, completion)
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
  }
}
