import Foundation
import Security

enum ClientIdentityError: Error {
  case wrongPassword
  case invalidFile
  case noIdentity
  case keychain(OSStatus)
}

struct ClientCertificateInfo {
  let subject: String
  /// Milliseconds since the Unix epoch.
  let expiresAt: Double?
}

/**
 Holds the client identity used for mutual TLS, and the one host it may be
 presented to.

 The PKCS#12 bundle and its password are kept in the keychain and re-imported
 on launch. That keeps removal clean (one item to delete) and avoids the
 identity outliving the app's own record of it.
 */
final class ClientIdentityStore: @unchecked Sendable {
  static let shared = ClientIdentityStore()

  private static let keychainService = "app.karakeep.client-certificate"
  private static let bundleAccount = "pkcs12"
  private static let passwordAccount = "password"
  private static let hostDefaultsKey = "KarakeepClientCertificateHost"

  private let lock = NSLock()
  private var credential: URLCredential?
  private var host: String?
  private var certificateInfo: ClientCertificateInfo?

  // MARK: - Reads (hot path, called for every request)

  /// The credential to present to `host`, if a certificate is installed and
  /// `host` is the server it was installed for.
  func credential(forHost requestHost: String?) -> URLCredential? {
    guard let requestHost = requestHost?.lowercased() else {
      return nil
    }
    lock.lock()
    defer { lock.unlock() }
    guard let credential, let host, host == requestHost else {
      return nil
    }
    return credential
  }

  var info: ClientCertificateInfo? {
    lock.lock()
    defer { lock.unlock() }
    return certificateInfo
  }

  // MARK: - Mutations

  /// Restores the saved identity and host. Called once at launch.
  func load() {
    let savedHost = UserDefaults.standard.string(forKey: Self.hostDefaultsKey)
    var loaded: (URLCredential, ClientCertificateInfo)?
    if let bundle = Self.readKeychain(account: Self.bundleAccount),
      let passwordData = Self.readKeychain(account: Self.passwordAccount),
      let password = String(data: passwordData, encoding: .utf8) {
      loaded = try? Self.makeCredential(pkcs12: bundle, password: password)
    }
    lock.lock()
    host = savedHost
    credential = loaded?.0
    certificateInfo = loaded?.1
    lock.unlock()
  }

  func setHost(_ newHost: String?) {
    let normalized = newHost?.lowercased()
    if let normalized, !normalized.isEmpty {
      UserDefaults.standard.set(normalized, forKey: Self.hostDefaultsKey)
    } else {
      UserDefaults.standard.removeObject(forKey: Self.hostDefaultsKey)
    }
    lock.lock()
    host = (normalized?.isEmpty ?? true) ? nil : normalized
    lock.unlock()
  }

  @discardableResult
  func importPKCS12(_ data: Data, password: String) throws -> ClientCertificateInfo {
    let (newCredential, newInfo) = try Self.makeCredential(pkcs12: data, password: password)
    try Self.writeKeychain(account: Self.bundleAccount, data: data)
    do {
      try Self.writeKeychain(account: Self.passwordAccount, data: Data(password.utf8))
    } catch {
      Self.deleteKeychain(account: Self.bundleAccount)
      throw error
    }
    activate(credential: newCredential, info: newInfo)
    return newInfo
  }

  func remove() {
    Self.deleteKeychain(account: Self.bundleAccount)
    Self.deleteKeychain(account: Self.passwordAccount)
    lock.lock()
    credential = nil
    certificateInfo = nil
    lock.unlock()
  }

  func activate(credential newCredential: URLCredential, info newInfo: ClientCertificateInfo) {
    lock.lock()
    credential = newCredential
    certificateInfo = newInfo
    lock.unlock()
  }

  // MARK: - PKCS#12

  static func makeCredential(
    pkcs12 data: Data,
    password: String
  ) throws -> (URLCredential, ClientCertificateInfo) {
    var rawItems: CFArray?
    let options = [kSecImportExportPassphrase as String: password] as CFDictionary
    let status = SecPKCS12Import(data as CFData, options, &rawItems)
    switch status {
    case errSecSuccess:
      break
    case errSecAuthFailed, errSecPkcs12VerifyFailure:
      throw ClientIdentityError.wrongPassword
    default:
      throw ClientIdentityError.invalidFile
    }

    let items = (rawItems as? [[String: Any]]) ?? []
    guard let item = items.first(where: { $0[kSecImportItemIdentity as String] != nil }),
      let identityRef = item[kSecImportItemIdentity as String] else {
      throw ClientIdentityError.noIdentity
    }
    // swiftlint:disable:next force_cast
    let identity = identityRef as! SecIdentity

    var leaf: SecCertificate?
    SecIdentityCopyCertificate(identity, &leaf)

    // The chain starts with the leaf, which the identity already carries.
    let chain = (item[kSecImportItemCertChain as String] as? [SecCertificate]) ?? []
    let intermediates = Array(chain.dropFirst())

    let credential = URLCredential(
      identity: identity,
      certificates: intermediates.isEmpty ? nil : intermediates,
      persistence: .forSession
    )

    var subject = ""
    var expiresAt: Double?
    if let leaf {
      subject = (SecCertificateCopySubjectSummary(leaf) as String?) ?? ""
      if #available(iOS 18.0, macOS 15.0, tvOS 18.0, *) {
        if let date = SecCertificateCopyNotValidAfterDate(leaf) as Date? {
          expiresAt = date.timeIntervalSince1970 * 1000
        }
      }
    }
    return (credential, ClientCertificateInfo(subject: subject, expiresAt: expiresAt))
  }

  // MARK: - Keychain

  private static func baseQuery(account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: account
    ]
  }

  private static func readKeychain(account: String) -> Data? {
    var query = baseQuery(account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else {
      return nil
    }
    return result as? Data
  }

  private static func writeKeychain(account: String, data: Data) throws {
    deleteKeychain(account: account)
    var query = baseQuery(account: account)
    query[kSecValueData as String] = data
    // Readable while locked so background refreshes keep working, but never
    // synced or restored onto another device.
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw ClientIdentityError.keychain(status)
    }
  }

  private static func deleteKeychain(account: String) {
    SecItemDelete(baseQuery(account: account) as CFDictionary)
  }
}
