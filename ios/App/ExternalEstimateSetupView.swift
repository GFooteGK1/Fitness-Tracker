import SwiftUI
import Photos

struct ExternalEstimateSetupView: View {
    @State private var consent = false
    @State private var busy = false
    @State private var origin = ""
    @State private var token = ""
    @State private var message = ""
    var body: some View {
        Form {
            Section("ChatGPT estimate handoff") {
                Text("Keep using the ordinary Camera. Your Camera Is Closed automation can pass one new photo to your chosen ChatGPT action without opening this app or launching a shortcut manually.")
                Text("This separate lane starts from a new enrollment boundary. New still photos, including imports, may qualify. It does not scan earlier photos. A photo does not establish that you ate the food.")
                Toggle("I approve handing new eligible photos to my chosen ChatGPT action", isOn: $consent)
                Button("Enable photo handoff") {
                    busy = true
                    Task {
                        _ = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
                        do { try await ExternalEstimateRuntime.shared.enable(consent: consent); consent = false; message = "Handoff enabled. Configure the Camera-close automation below. Import remains separately authorized." }
                        catch { message = error.localizedDescription }
                        busy = false
                    }
                }.frame(minHeight: 44).disabled(busy || !consent)
                Button("Disable photo handoff", role: .destructive) {
                    Task {
                        do { try await ExternalEstimateRuntime.shared.disable(); message = "Handoff disabled. Pending identities are preserved. Already handed-off photos cannot be recalled." }
                        catch { message = error.localizedDescription }
                    }
                }.frame(minHeight: 44)
            }
            Section("One-time automation setup") {
                Text("Camera → Is Closed → Run Immediately. Run Prepare Next Estimate Capture and read its JSON. Only for state prepared, pass capture.requestId to Get Prepared Estimate Photo. Send that file to your chosen ChatGPT action. Pass its strict estimate JSON and the original capture ID to Import External Food Estimate.")
                Text("For imageHandedOff, continue the original estimate; do not hand off another photo. For importSubmitted, use Read External Estimate Capture. Unknown delivery never creates a new capture ID or repeats estimation automatically.")
                Text("ChatGPT image transfer and locked-phone execution require a device test. Existing thumbnail diagnostics do not prove these steps. This app does not call a model API.")
            }
            Section("Separate Socius import approval") {
                Text("Import is inactive until its separate server activation and owner-scoped grant are approved. Existing camera pairing tokens cannot import estimates. Do not enter an OpenAI or service-role key.")
                TextField("Approved SociusFit site origin", text: $origin).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Separately approved estimate import capability", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Store approved import configuration") {
                    busy = true
                    Task {
                        do { try await ExternalEstimateRuntime.shared.configure(origin: origin.trimmingCharacters(in: .whitespacesAndNewlines), token: token.trimmingCharacters(in: .whitespacesAndNewlines)); token = ""; message = "Configuration stored privately. This does not activate the server or expand camera access." }
                        catch { message = error.localizedDescription }
                        busy = false
                    }
                }.frame(minHeight: 44).disabled(busy)
            }
            if !message.isEmpty { Section("Status") { Text(message) } }
        }.navigationTitle("ChatGPT Photo Handoff")
    }
}
