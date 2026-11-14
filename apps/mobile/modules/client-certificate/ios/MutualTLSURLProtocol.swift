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

  // `startLoading`/`stopLoading` run on the loading system's thread while the
  // forwarding methods run on the inner session's queue, so this state is
  // only touched under `stateLock`.
  private let stateLock = NSLock()
  private var innerTask: URLSessionDataTask?
  /// Set once nothing more may be reported to the client: after it stopped
  /// us, or after we handed it a redirect.
  private var finished = false

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

  /// Drops connections made with the current identity. Call whenever the
  /// identity or the server it belongs to changes: an open TLS connection
  /// would otherwise keep being reused without a new certificate challenge.
  static func resetConnections() {
    MutualTLSSession.shared.reset()
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

    let task = MutualTLSSession.shared.makeTask(for: mutableRequest as URLRequest, proto: self)
    stateLock.lock()
    innerTask = task
    stateLock.unlock()
    task.resume()
  }

  override func stopLoading() {
    if let task = finish() {
      MutualTLSSession.shared.unregister(task)
      task.cancel()
    }
  }

  /// Marks the request as over and hands back the inner task, if this call
  /// is the one that ended it.
  private func finish() -> URLSessionDataTask? {
    stateLock.lock()
    defer { stateLock.unlock() }
    finished = true
    let task = innerTask
    innerTask = nil
    return task
  }

  private var isFinished: Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return finished
  }

  // MARK: - Forwarding from the inner session

  fileprivate func didRedirect(
    response: HTTPURLResponse,
    newRequest: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    // End this request before telling anyone: cancelling the inner task
    // below reports a cancellation error, which must not reach the client
    // after the redirect has.
    guard !isFinished, let task = finish() else {
      completionHandler(nil)
      return
    }
    MutualTLSSession.shared.unregister(task)

    // Hand the redirect to the original session, which decides whether to
    // follow it and re-issues the request (through us again, if it still
    // targets the server).
    if let redirected = (newRequest as NSURLRequest).mutableCopy() as? NSMutableURLRequest {
      URLProtocol.removeProperty(forKey: Self.handledKey, in: redirected)
      client?.urlProtocol(self, wasRedirectedTo: redirected as URLRequest, redirectResponse: response)
    }
    completionHandler(nil)
    task.cancel()
  }

  fileprivate func didReceive(response: URLResponse) {
    guard !isFinished else {
      return
    }
    // The inner session already caches; don't store the response twice.
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
  }

  fileprivate func didReceive(data: Data) {
    guard !isFinished else {
      return
    }
    client?.urlProtocol(self, didLoad: data)
  }

  fileprivate func didComplete(error: Error?) {
    guard !isFinished else {
      return
    }
    if let error {
      client?.urlProtocol(self, didFailWithError: error)
    } else {
      client?.urlProtocolDidFinishLoading(self)
    }
  }
}

/// Owns the session that actually performs claimed requests. The session is
/// shared so connections to the server are reused across requests.
private final class MutualTLSSession: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  static let shared = MutualTLSSession()

  private let lock = NSLock()
  private var session: URLSession?
  // Keyed by the task itself: identifiers are only unique within one
  // session, and a reset can leave an old session finishing its tasks.
  private var protocols: [ObjectIdentifier: MutualTLSURLProtocol] = [:]

  /// Creates a task for `request` and routes its events to `proto`.
  func makeTask(for request: URLRequest, proto: MutualTLSURLProtocol) -> URLSessionDataTask {
    lock.lock()
    defer { lock.unlock() }
    let task = currentSession().dataTask(with: request)
    protocols[ObjectIdentifier(task)] = proto
    return task
  }

  /// Retires the session, and with it any connection already authenticated
  /// with the previous identity. Requests in flight are allowed to finish.
  func reset() {
    lock.lock()
    let retired = session
    session = nil
    lock.unlock()
    retired?.finishTasksAndInvalidate()
  }

  // Must be called with `lock` held.
  private func currentSession() -> URLSession {
    if let session {
      return session
    }
    let configuration = URLSessionConfiguration.default
    configuration.protocolClasses = configuration.protocolClasses?.filter {
      $0 != MutualTLSURLProtocol.self
    }
    let created = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    session = created
    return created
  }

  func unregister(_ task: URLSessionTask) {
    lock.lock()
    protocols[ObjectIdentifier(task)] = nil
    lock.unlock()
  }

  private func proto(for task: URLSessionTask) -> MutualTLSURLProtocol? {
    lock.lock()
    defer { lock.unlock() }
    return protocols[ObjectIdentifier(task)]
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
