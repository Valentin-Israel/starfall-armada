import Foundation
import Capacitor
import AuthenticationServices

/// A local, app-embedded Capacitor 8 plugin that runs the Google OAuth handoff
/// inside an in-app `ASWebAuthenticationSession` instead of kicking the user out
/// to the external Safari app.
///
/// `prefersEphemeralWebBrowserSession = false` makes the session share the
/// device's Safari cookie jar (SSO) and triggers the native consent alert
/// ("Starfall" Wants to Use "google.com" to Sign In). The redirect to the
/// custom scheme (starfall://auth?token=...) is captured by the session itself,
/// so the whole external-Safari / appUrlOpen round-trip is bypassed.
@objc(EphemeralWebAuthPlugin)
public class EphemeralWebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "EphemeralWebAuthPlugin"
    public let jsName = "EphemeralWebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    // ASWebAuthenticationSession must be retained for its whole lifetime.
    // If ARC deallocates it the sheet closes and the completion never fires.
    private var session: ASWebAuthenticationSession?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let authUrlString = call.getString("authUrl"),
              let authUrl = URL(string: authUrlString) else {
            call.reject("authUrl is required and must be a valid URL")
            return
        }
        // ASWebAuthenticationSession expects the scheme WITHOUT "://" (e.g. "starfall").
        guard let callbackScheme = call.getString("callbackScheme"), !callbackScheme.isEmpty else {
            call.reject("callbackScheme is required")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: authUrl,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.session = nil // release the retained session

                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionError.errorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.reject("Sign-in was cancelled.", "USER_CANCELLED", error)
                    } else {
                        call.reject(error.localizedDescription, "AUTH_FAILED", error)
                    }
                    return
                }

                guard let callbackURL = callbackURL else {
                    call.reject("Authentication finished without a callback URL.", "NO_CALLBACK")
                    return
                }

                call.resolve(["url": callbackURL.absoluteString])
            }

            session.presentationContextProvider = self
            // false => share Safari cookies/SSO and show the native consent popup.
            session.prefersEphemeralWebBrowserSession = false

            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not start the authentication session.", "START_FAILED")
            }
        }
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

/// App-embedded CAPBridgedPlugins are NOT auto-discovered by Capacitor (only
/// built-ins and npm-package plugins listed in the generated capacitor.config.json
/// are). They must be registered explicitly on the bridge. Main.storyboard is
/// pointed at this subclass so the override runs at launch.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EphemeralWebAuthPlugin())
    }
}
