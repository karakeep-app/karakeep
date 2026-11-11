import ExpoModulesCore

public class ClientCertificateModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KarakeepClientCertificate")

    // Imports a PKCS#12 (.p12/.pfx) bundle and makes it the active identity.
    AsyncFunction("importCertificate") { (fileUrl: URL, password: String) -> [String: Any] in
      let data: Data
      do {
        data = try Data(contentsOf: fileUrl)
      } catch {
        throw CertificateFileUnreadableException()
      }
      do {
        return try ClientIdentityStore.shared.importPKCS12(data, password: password).asDictionary
      } catch ClientIdentityError.wrongPassword {
        throw CertificateWrongPasswordException()
      } catch ClientIdentityError.keychain(let status) {
        throw CertificateKeychainException(Int(status))
      } catch {
        throw CertificateInvalidFileException()
      }
    }

    Function("getCertificate") { () -> [String: Any]? in
      ClientIdentityStore.shared.info?.asDictionary
    }

    Function("removeCertificate") {
      ClientIdentityStore.shared.remove()
    }

    // The only host the certificate is ever presented to.
    Function("setServerHost") { (host: String?) in
      ClientIdentityStore.shared.setHost(host)
    }
  }
}

private extension ClientCertificateInfo {
  var asDictionary: [String: Any] {
    var result: [String: Any] = ["subject": subject]
    if let expiresAt {
      result["expiresAt"] = expiresAt
    }
    return result
  }
}

// The codes below (ERR_CERTIFICATE_WRONG_PASSWORD, ...) are matched in JS.

final class CertificateWrongPasswordException: Exception, @unchecked Sendable {
  override var reason: String {
    "The password for this certificate is incorrect"
  }
}

final class CertificateInvalidFileException: Exception, @unchecked Sendable {
  override var reason: String {
    "The file is not a PKCS#12 bundle containing a certificate and its private key"
  }
}

final class CertificateFileUnreadableException: Exception, @unchecked Sendable {
  override var reason: String {
    "The certificate file could not be read"
  }
}

final class CertificateKeychainException: GenericException<Int>, @unchecked Sendable {
  override var reason: String {
    "The certificate could not be saved to the keychain (status \(param))"
  }
}
