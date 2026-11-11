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

 The PKCS#12 bundle and its password are kept together in one keychain item
 and re-imported on launch. A single item means a replacement either fully
 succeeds or leaves the previous certificate intact, and removal is one delete.
 */
final class ClientIdentityStore: @unchecked Sendable {
  static let shared = ClientIdentityStore()

  private static let keychainService = "app.karakeep.client-certificate"
  private static let identityAccount = "identity"
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
    if let data = Self.readKeychain(),
      let saved = try? PropertyListDecoder().decode(SavedIdentity.self, from: data) {
      loaded = try? Self.makeCredential(pkcs12: saved.pkcs12, password: saved.password)
    }
    lock.lock()
    host = savedHost
    credential = loaded?.0
    certificateInfo = loaded?.1
    lock.unlock()
  }

  func setHost(_ newHost: String?) {
    let normalized = newHost?.lowercased()
    let effective = (normalized?.isEmpty ?? true) ? nil : normalized
    if let effective {
      UserDefaults.standard.set(effective, forKey: Self.hostDefaultsKey)
    } else {
      UserDefaults.standard.removeObject(forKey: Self.hostDefaultsKey)
    }
    lock.lock()
    let changed = host != effective
    host = effective
    lock.unlock()
    if changed {
      MutualTLSURLProtocol.resetConnections()
    }
  }

  @discardableResult
  func importPKCS12(_ data: Data, password: String) throws -> ClientCertificateInfo {
    let (newCredential, newInfo) = try Self.makeCredential(pkcs12: data, password: password)
    let saved = try PropertyListEncoder().encode(SavedIdentity(pkcs12: data, password: password))
    // If this fails, the previously saved certificate is untouched.
    try Self.writeKeychain(saved)
    activate(credential: newCredential, info: newInfo)
    return newInfo
  }

  func remove() {
    Self.deleteKeychain()
    lock.lock()
    credential = nil
    certificateInfo = nil
    lock.unlock()
    MutualTLSURLProtocol.resetConnections()
  }

  func activate(credential newCredential: URLCredential, info newInfo: ClientCertificateInfo) {
    lock.lock()
    credential = newCredential
    certificateInfo = newInfo
    lock.unlock()
    MutualTLSURLProtocol.resetConnections()
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

  private struct SavedIdentity: Codable {
    let pkcs12: Data
    let password: String
  }

  private static var itemQuery: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: identityAccount
    ]
  }

  private static func readKeychain() -> Data? {
    var query = itemQuery
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else {
      return nil
    }
    return result as? Data
  }

  /// Replaces the saved item in place, so a failure never loses the item
  /// that was there before.
  private static func writeKeychain(_ data: Data) throws {
    // Readable while locked so background refreshes keep working, but never
    // synced or restored onto another device.
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ]
    var status = SecItemUpdate(itemQuery as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      let item = itemQuery.merging(attributes) { _, new in new }
      status = SecItemAdd(item as CFDictionary, nil)
    }
    guard status == errSecSuccess else {
      throw ClientIdentityError.keychain(status)
    }
  }

  private static func deleteKeychain() {
    SecItemDelete(itemQuery as CFDictionary)
  }
}
