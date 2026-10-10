import SwiftUI
import Photos

struct CloudPhotoSetupView: View {
    @State private var origin = ""
    @State private var token = ""
    @State private var consent = false
    @State private var busy = false
    @State private var message = ""
    var body: some View {
        Form {
            Section("Cloud camera logging") {
                Text("In SociusFit, open /capture/camera, approve cloud screening and create a private pairing. Paste its site origin and token below. Do not paste an OpenAI key.")
                TextField("SociusFit site origin (https://…)", text:$origin).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Private device pairing token",text:$token).textInputAutocapitalization(.never).autocorrectionDisabled()
                Text("New photos after pairing, including non-food or sensitive scenes, are sent to OpenAI. Food candidates also go to the cloud provider configured for Socius macro analysis. SociusFit does not save the photo; provider retention policies apply. You review drafts in SociusFit; only accepting a meal changes totals.")
                Toggle("I approve cloud screening of new photos",isOn:$consent)
                Button("Pair and enable cloud logging") {
                    busy = true
                    Task {
                        do {
                            _ = await PHPhotoLibrary.requestAuthorization(for:.readWrite)
                            try await CloudPhotoRuntime.shared.pair(originText:origin.trimmingCharacters(in:.whitespacesAndNewlines),token:token.trimmingCharacters(in:.whitespacesAndNewlines),consent:consent)
                            token = ""; consent = false; message = "Paired. Use Log New Camera Photos in your Camera-close automation. Earlier photos are excluded."
                        } catch { message = "Pairing was not confirmed. Saved state is preserved. Disable all camera devices on the website before creating a new pairing." }
                        busy = false
                    }
                }.frame(minHeight:44).disabled(busy || !consent)
            }
            Section("Delivery") {
                Text("Shortcuts → Camera → Is Closed → Run Immediately → Log New Camera Photos. You may feed its text result to Show Notification. One photo is processed per run. Imports qualify only if their recorded capture time is after pairing. Deferred photos need a later invocation. Photos needing iCloud download are deferred.")
                Button("Process or check next pending photo") { busy = true; Task { message = await CloudPhotoRuntime.shared.run(); busy = false } }.frame(minHeight:44).disabled(busy)
                Button("Disable cloud logging",role:.destructive) { Task { message = await CloudPhotoRuntime.shared.disable() } }.frame(minHeight:44)
                Text("Disable stops new dispatch. Already sent photos cannot be recalled. If server revocation is unconfirmed, use Disable all camera devices in SociusFit. Signing out of SociusFit also revokes its device access.")
                if !message.isEmpty { Text(message) }
            }
        }.navigationTitle("Cloud Photo Logging")
    }
}
