Pod::Spec.new do |s|
  s.name           = 'KarakeepClientCertificate'
  s.version        = '1.0.0'
  s.summary        = 'TLS client certificate (mTLS) support for the Karakeep app'
  s.description    = 'Presents a user-installed client certificate to the Karakeep server.'
  s.license        = 'AGPL-3.0'
  s.author         = 'Karakeep'
  s.homepage       = 'https://karakeep.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
