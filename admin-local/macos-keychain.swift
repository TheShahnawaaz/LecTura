// macOS-only operator helper. Never prints or passes the raw credential in argv/env.
import Foundation
import Security
import CryptoKit
import Dispatch
import Darwin

let service = "com.lectura.study-sync.admin"
let account = "lectura-study-sync"
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let lookup: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecAttrSynchronizable as String: false,
]

func stop(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func credential() -> Data {
    var query = lookup
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data,
          let value = String(data: data, encoding: .utf8),
          value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
        stop("LecTura admin credential unavailable in Keychain (status \(status)).")
    }
    return data
}

func run(_ executable: String, _ arguments: [String], input: Data) -> Int32 {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.currentDirectoryURL = root.appendingPathComponent("cloud/worker")
    var environment = ProcessInfo.processInfo.environment
    environment["CLOUDFLARE_AUTH_USE_KEYRING"] = "true"
    environment["WRANGLER_SEND_METRICS"] = "false"
    process.environment = environment
    let pipe = Pipe()
    process.standardInput = pipe
    do {
        try process.run()
        pipe.fileHandleForWriting.write(input)
        try pipe.fileHandleForWriting.close()
    } catch { stop("Could not start the trusted admin helper child process.") }
    // Forward shutdown through the helper so the credential-holding Node process
    // cannot outlive the operator's launcher.
    let signals = [SIGINT, SIGTERM].map { number -> DispatchSourceSignal in
        signal(number, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: number, queue: .global())
        source.setEventHandler { kill(process.processIdentifier, number) }
        source.resume()
        return source
    }
    withExtendedLifetime(signals) { process.waitUntilExit() }
    for source in signals { source.cancel() }
    return process.terminationStatus
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let action = arguments.first else { stop("Use status, create, configure, check or serve.") }
switch action {
case "status":
    var query = lookup
    query[kSecReturnAttributes as String] = true
    let status = SecItemCopyMatching(query as CFDictionary, nil)
    if status == errSecSuccess { print("LecTura admin Keychain entry exists.") }
    else if status == errSecItemNotFound { print("LecTura admin Keychain entry is absent.") }
    else { stop("Could not inspect Keychain entry (status \(status)).") }
case "create":
    // Explicit operator approval is required before invoking this action.
    let existing = SecItemCopyMatching(lookup as CFDictionary, nil)
    guard existing == errSecItemNotFound else {
        stop("Refusing to create or overwrite an existing/unreadable Keychain entry (status \(existing)).")
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
        stop("Secure random generation failed.")
    }
    let value = bytes.map { String(format: "%02x", $0) }.joined()
    var item = lookup
    item[kSecAttrLabel as String] = "LecTura private dashboard administrator"
    item[kSecValueData as String] = Data(value.utf8)
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else { stop("Keychain creation failed (status \(status)); no Worker secret was changed.") }
    print("Created LecTura admin credential in this Mac's Keychain; no Worker secret changed yet.")
case "configure", "check", "serve":
    guard arguments.count == 2, arguments[1].hasPrefix("/") else {
        stop("Provide the absolute path to the approved Node runtime.")
    }
    let value = credential()
    if action == "configure" {
        // Explicit operator approval is required before invoking this action.
        let hash = SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
        let script = root.appendingPathComponent("cloud/worker/node_modules/wrangler/bin/wrangler.js").path
        exit(run(arguments[1], [script, "secret", "put", "ADMIN_TOKEN_HASH"], input: Data((hash + "\n").utf8)))
    }
    let script = root.appendingPathComponent("admin-local/keychain-session.mjs").path
    // The raw credential crosses only an anonymous parent-child pipe on this Mac.
    exit(run(arguments[1], [script, action], input: value))
default:
    stop("Unknown action. Use status, create, configure, check or serve.")
}
