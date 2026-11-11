import Foundation
import ObjectiveC

/**
 Answers TLS client-certificate requests from the Karakeep server.

 The app talks to the server through several independent HTTP stacks (React
 Native's fetch, expo-image, expo-file-system, react-native-blob-util), each
 owning its own `URLSession` and none exposing a client-certificate hook. So
 rather than patching each one, this protocol is injected into every session
 configuration. It claims only HTTPS requests to the configured server while a
 certificate is installed, and replays them on a session whose delegate can
 present the identity. Everything else is left untouched.
 */
final class MutualTLSURLProtocol: URLProtocol, @unchecked Sendable {
  private static let handledKey = "app.karakeep.mtls.handled"
  nonisolated(unsafe) private static var installed = false

  private var innerTask: URLSessionDataTask?
  private var stopped = false

  // MARK: - Installation

  /// Makes every `URLSession` created from now on route through this protocol.
  /// Must run before the app's networking stacks create their sessions.
  static func install() {
    guard !installed else {
      return
    }
    installed = true

    // Covers `URLSession.shared`.
    URLProtocol.registerClass(MutualTLSURLProtocol.self)

    // Sessions with their own configuration ignore registered classes, so add
    // ourselves to the configurations they start from.
    wrapConfigurationGetter(#selector(getter: URLSessionConfiguration.default))
    wrapConfigurationGetter(#selector(getter: URLSessionConfiguration.ephemeral))
  }

  private typealias ConfigurationGetter = @convention(c) (AnyObject, Selector) -> URLSessionConfiguration

  /// Replaces a `URLSessionConfiguration` class getter with one that calls
  /// the previous implementation and adds this protocol to the result.
  ///
  /// The previous implementation is called directly rather than by exchanging
  /// methods and re-sending a renamed selector: other libraries wrap these
  /// getters too (expo-dev-launcher, for one) and may invoke ours with a
  /// receiver and selector of their own.
  private static func wrapConfigurationGetter(_ selector: Selector) {
    guard let method = class_getClassMethod(URLSessionConfiguration.self, selector) else {
      return
    }
    let original = unsafeBitCast(method_getImplementation(method), to: ConfigurationGetter.self)
    let replacement: @convention(block) (AnyObject) -> URLSessionConfiguration = { receiver in
      let configuration = original(receiver, selector)
      var classes = configuration.protocolClasses ?? []
      if !classes.contains(where: { $0 == MutualTLSURLProtocol.self }) {
        classes.insert(MutualTLSURLProtocol.self, at: 0)
        configuration.protocolClasses = classes
      }
      return configuration
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
  }

  // MARK: - URLProtocol

  override class func canInit(with request: URLRequest) -> Bool {
    guard let url = request.url,
      url.scheme?.lowercased() == "https",
      URLProtocol.property(forKey: handledKey, in: request) == nil else {
      return false
    }
    return ClientIdentityStore.shared.credential(forHost: url.host) != nil
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    guard let mutableRequest = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest else {
      client?.urlProtocol(self, didFailWithError: URLError(.unknown))
      return
    }
    URLProtocol.setProperty(true, forKey: Self.handledKey, in: mutableRequest)

    let task = MutualTLSSession.shared.session.dataTask(with: mutableRequest as URLRequest)
    innerTask = task
    MutualTLSSession.shared.register(self, for: task)
    task.resume()
  }

  override func stopLoading() {
    stopped = true
    if let task = innerTask {
      MutualTLSSession.shared.unregister(task)
      task.cancel()
    }
    innerTask = nil
  }

  // MARK: - Forwarding from the inner session

  fileprivate func didRedirect(
    response: HTTPURLResponse,
    newRequest: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    // Hand the redirect to the original session, which decides whether to
    // follow it and re-issues the request (through us again, if it still
    // targets the server).
    if let redirected = (newRequest as NSURLRequest).mutableCopy() as? NSMutableURLRequest {
      URLProtocol.removeProperty(forKey: Self.handledKey, in: redirected)
      client?.urlProtocol(self, wasRedirectedTo: redirected as URLRequest, redirectResponse: response)
    }
    completionHandler(nil)
    innerTask?.cancel()
  }

  fileprivate func didReceive(response: URLResponse) {
    // The inner session already caches; don't store the response twice.
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
  }

  fileprivate func didReceive(data: Data) {
    client?.urlProtocol(self, didLoad: data)
  }

  fileprivate func didComplete(error: Error?) {
    guard !stopped else {
      return
    }
    if let error {
      client?.urlProtocol(self, didFailWithError: error)
    } else {
      client?.urlProtocolDidFinishLoading(self)
    }
  }
}

/// The session that actually performs claimed requests, shared so connections
/// to the server are reused across requests.
private final class MutualTLSSession: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  static let shared = MutualTLSSession()

  private let lock = NSLock()
  private var protocols: [Int: MutualTLSURLProtocol] = [:]

  private(set) lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.protocolClasses = configuration.protocolClasses?.filter {
      $0 != MutualTLSURLProtocol.self
    }
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }()

  func register(_ proto: MutualTLSURLProtocol, for task: URLSessionTask) {
    lock.lock()
    protocols[task.taskIdentifier] = proto
    lock.unlock()
  }

  func unregister(_ task: URLSessionTask) {
    lock.lock()
    protocols[task.taskIdentifier] = nil
    lock.unlock()
  }

  private func proto(for task: URLSessionTask) -> MutualTLSURLProtocol? {
    lock.lock()
    defer { lock.unlock() }
    return protocols[task.taskIdentifier]
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    let space = challenge.protectionSpace
    if space.authenticationMethod == NSURLAuthenticationMethodClientCertificate,
      let credential = ClientIdentityStore.shared.credential(forHost: space.host) {
      completionHandler(.useCredential, credential)
      return
    }
    completionHandler(.performDefaultHandling, nil)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let proto = proto(for: task) else {
      completionHandler(nil)
      return
    }
    proto.didRedirect(response: response, newRequest: request, completionHandler: completionHandler)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    proto(for: dataTask)?.didReceive(response: response)
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    proto(for: dataTask)?.didReceive(data: data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let proto = proto(for: task)
    unregister(task)
    proto?.didComplete(error: error)
  }
}
