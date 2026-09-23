Pod::Spec.new do |s|
  s.name = 'DorkaNotificationDismissal'
  s.version = '0.0.1'
  s.summary = 'Native notification dismissal and sequence fencing'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Dorka'
  s.homepage = 'https://ondorka.dev'
  s.source = { :git => 'https://github.com/stablyai/orca.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
